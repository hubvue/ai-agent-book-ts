import {
  Config,
  reasoningSafeTemperature,
  resolveLlmBackend,
  toErrorMessage,
} from "./config.js";
import { OpenAIChatClient } from "./openai-client.js";
import type {
  ApiTurn,
  ChatClient,
  ChatCompletionChoice,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ConversationMessage,
  FormulaToolDefinition,
  JsonRecord,
  SearchResult,
  TraceStep,
} from "./types.js";

export const SEARCH_ERROR_PREFIX = "搜索过程中出现错误";
export const MAX_ITERATIONS_MESSAGE =
  "抱歉，搜索过程超过了最大迭代次数，请稍后重试。";
export const NO_INFO_MESSAGE = "抱歉，我无法获取足够的信息来回答您的问题。";
export const TRUNCATION_NOTE =
  "（注意：回答因达到 max_tokens 上限被截断，请增大 max_tokens 后重试。）";

const STEP_LABELS = {
  thought: ["💭", "思考"],
  action: ["🔧", "行动"],
  observation: ["👀", "观察"],
  answer: ["✅", "最终答案"],
} as const;

const SYSTEM_PROMPT = `你是 Kimi，一个智能搜索助手。

请按照以下步骤处理：
1. 分析用户问题，识别关键信息需求
2. 使用 web_search 官方工具搜索相关信息
3. 如果需要更多信息，可以多次调用搜索工具
4. 综合所有信息，生成准确、全面的答案

注意：
- 搜索时使用精准的关键词
- 优先获取最新、最权威的信息
- 答案要结构清晰，有理有据
`;

export interface WebSearchAgentOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  verbose?: boolean;
  environment?: NodeJS.ProcessEnv;
  client?: ChatClient;
  fetchImpl?: typeof fetch;
  requestTimeoutSeconds?: number;
}

export function formatTraceStep(step: TraceStep, maxLength = 500): string {
  const [icon, label] = STEP_LABELS[step.type] ?? ["•", step.type];
  const prefix = `${icon} [${step.iteration ?? "-"}] ${label}`;
  if (step.type === "action") {
    return `${prefix}: 调用工具 ${step.tool}  参数=${pythonStyleJson(step.args ?? {})}`;
  }
  let content = String(step.content ?? "").trim();
  if (content.length > maxLength) {
    const omitted = content.length - maxLength;
    content = `${content.slice(0, maxLength)}…（省略 ${omitted} 字）`;
  }
  return `${prefix}: ${content}`;
}

export function searchImpl(arguments_: JsonRecord): JsonRecord {
  return arguments_;
}

export function isFailureAnswer(answer: string): boolean {
  return answer.startsWith(SEARCH_ERROR_PREFIX) ||
    answer === MAX_ITERATIONS_MESSAGE ||
    answer === NO_INFO_MESSAGE;
}

export class WebSearchAgent {
  readonly usingOpenRouter: boolean;
  readonly baseUrl: string;
  readonly model: string;
  readonly verbose: boolean;
  readonly formulaUri = "moonshot/web-search:latest";

  temperature = 0.6;
  maxTokens = 32_768;
  conversationHistory: ConversationMessage[] = [];
  trace: TraceStep[] = [];
  apiTurns: ApiTurn[] = [];

  readonly #apiKey: string;
  readonly #requestTimeoutMilliseconds: number;
  readonly #client: ChatClient;
  readonly #fetch: typeof fetch;
  #formulaTools: FormulaToolDefinition[] | null = null;

  constructor(options: WebSearchAgentOptions = {}) {
    const environment = options.environment ?? process.env;
    const primaryKey = options.apiKey ||
      environment.MOONSHOT_API_KEY ||
      environment.KIMI_API_KEY;
    const backend = resolveLlmBackend(
      primaryKey,
      options.baseUrl ?? Config.kimiBaseUrl,
      options.model ?? Config.defaultModel,
      environment,
    );
    this.#apiKey = backend.apiKey;
    this.baseUrl = backend.baseUrl;
    this.model = backend.model;
    this.usingOpenRouter = backend.usingOpenRouter;
    this.verbose = options.verbose ?? false;
    this.#requestTimeoutMilliseconds =
      (options.requestTimeoutSeconds ?? Config.searchTimeoutSeconds) * 1_000;
    this.#client = options.client ?? new OpenAIChatClient({
      apiKey: backend.apiKey,
      baseUrl: backend.baseUrl,
    });
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async getTools(): Promise<FormulaToolDefinition[]> {
    if (this.usingOpenRouter) {
      return [];
    }
    if (this.#formulaTools) {
      return this.#formulaTools;
    }

    const url = `${this.baseUrl.replace(/\/$/, "")}/formulas/${this.formulaUri}/tools`;
    const started = performance.now();
    let response: Response | undefined;
    let payload: JsonRecord | undefined;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.#apiKey}` },
        signal: AbortSignal.timeout(this.#requestTimeoutMilliseconds),
      });
      payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const tools = payload.tools;
      if (!Array.isArray(tools) || tools.length === 0) {
        throw new Error("Formula declaration response has no tools");
      }
      if (!tools.some(isWebSearchTool)) {
        throw new Error(
          "Formula declaration does not contain function web_search",
        );
      }
      this.#formulaTools = clone(tools) as FormulaToolDefinition[];
    } catch (error) {
      this.apiTurns.push({
        kind: "formula_tools",
        formula_uri: this.formulaUri,
        request: { method: "GET", url },
        http_status: response?.status ?? null,
        elapsed_seconds: elapsedSeconds(started),
        error: errorEvidence(error, payload),
      });
      throw error;
    }

    this.apiTurns.push({
      kind: "formula_tools",
      formula_uri: this.formulaUri,
      request: { method: "GET", url },
      http_status: response.status,
      response: payload,
      elapsed_seconds: elapsedSeconds(started),
    });
    return this.#formulaTools;
  }

  async executeFormula(name: string, rawArguments: string): Promise<string> {
    if (this.usingOpenRouter) {
      throw new Error("Kimi Formula tools are unavailable on OpenRouter");
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}/formulas/${this.formulaUri}/fibers`;
    const body = { name, arguments: rawArguments };
    const started = performance.now();
    let response: Response | undefined;
    let payload: JsonRecord | undefined;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#requestTimeoutMilliseconds),
      });
      payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (payload.status !== "succeeded") {
        throw new Error(
          `Formula Fiber did not succeed: ${JSON.stringify(payload.status)}`,
        );
      }
      const context = isRecord(payload.context) ? payload.context : {};
      const result = context.output || context.encrypted_output;
      if (result === undefined || result === null || result === "") {
        throw new Error("Succeeded Formula Fiber returned no output");
      }
      this.apiTurns.push({
        kind: "formula_fiber",
        formula_uri: this.formulaUri,
        request: { method: "POST", url, body },
        http_status: response.status,
        response: payload,
        elapsed_seconds: elapsedSeconds(started),
      });
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (error) {
      this.apiTurns.push({
        kind: "formula_fiber",
        formula_uri: this.formulaUri,
        request: { method: "POST", url, body },
        http_status: response?.status ?? null,
        elapsed_seconds: elapsedSeconds(started),
        error: errorEvidence(error, payload),
      });
      throw error;
    }
  }

  async searchAndAnswer(
    userQuestion: string,
    maxIterations = Config.maxSearchIterations,
  ): Promise<string> {
    this.conversationHistory = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userQuestion },
    ];
    this.trace = [];
    this.apiTurns = [];
    this.#formulaTools = null;

    let iteration = 0;
    try {
      let finishReason: string | null | undefined;
      while (
        (finishReason === undefined || finishReason === null ||
          finishReason === "tool_calls") &&
        iteration < maxIterations
      ) {
        iteration += 1;
        const choice = await this.chat(this.conversationHistory);
        finishReason = choice.finish_reason;
        const reasoning = choice.message.reasoning_content ??
          choice.message.reasoning;
        if (reasoning) {
          this.emit({
            iteration,
            type: "thought",
            content: String(reasoning),
          });
        }

        if (finishReason === "tool_calls") {
          const toolCalls = choice.message.tool_calls ?? [];
          this.conversationHistory.push({
            role: "assistant",
            content: choice.message.content || "",
            tool_calls: clone(toolCalls),
          });
          for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const rawArguments = toolCall.function.arguments || "{}";
            let parsedArguments: JsonRecord;
            try {
              const parsed = JSON.parse(rawArguments) as unknown;
              parsedArguments = isRecord(parsed) ? parsed : {};
            } catch {
              parsedArguments = {};
            }
            this.emit({
              iteration,
              type: "action",
              tool: toolName,
              args: parsedArguments,
            });
            const toolResult = toolName === "web_search"
              ? await this.executeFormula(toolName, rawArguments)
              : `Error: unable to find tool by name '${toolName}'`;
            this.emit({
              iteration,
              type: "observation",
              tool: toolName,
              content: toolResult,
            });
            this.conversationHistory.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult,
            });
          }
          continue;
        }

        if (finishReason === "length") {
          const partial = (choice.message.content ?? "").trim();
          const finalAnswer = partial
            ? `${partial}\n\n${TRUNCATION_NOTE}`
            : TRUNCATION_NOTE;
          this.emit({
            iteration,
            type: "answer",
            content: finalAnswer,
          });
          this.conversationHistory.push({
            role: "assistant",
            content: finalAnswer,
          });
          return finalAnswer;
        }

        if (choice.message.content) {
          const answer = choice.message.content;
          this.emit({ iteration, type: "answer", content: answer });
          this.conversationHistory.push({
            role: "assistant",
            content: answer,
          });
          return answer;
        }
      }

      return iteration >= maxIterations
        ? MAX_ITERATIONS_MESSAGE
        : NO_INFO_MESSAGE;
    } catch (error) {
      return `${SEARCH_ERROR_PREFIX}: ${toErrorMessage(error)}`;
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getConversationHistory(): ConversationMessage[] {
    return clone(this.conversationHistory);
  }

  getTrace(): TraceStep[] {
    return clone(this.trace);
  }

  getApiTurns(): ApiTurn[] {
    return clone(this.apiTurns);
  }

  setTemperature(temperature: number): void {
    if (temperature >= 0 && temperature <= 2) {
      this.temperature = temperature;
    }
  }

  private emit(step: TraceStep): void {
    this.trace.push(step);
    if (this.verbose) {
      console.log(formatTraceStep(step));
    }
  }

  private async chat(
    messages: ConversationMessage[],
  ): Promise<ChatCompletionChoice> {
    const request: ChatCompletionRequest = {
      model: this.model,
      messages: clone(messages),
      temperature: reasoningSafeTemperature(this.model, this.temperature),
      max_tokens: this.maxTokens,
      timeout: this.#requestTimeoutMilliseconds,
    };
    if (this.model.toLowerCase() === "kimi-k3") {
      request.reasoning_effort = "max";
    }
    const tools = await this.getTools();
    if (tools.length > 0) {
      request.tools = tools;
    }

    const started = performance.now();
    const { timeout: _timeout, ...requestEvidence } = request;
    let response: ChatCompletionResponse | undefined;
    try {
      response = await this.#client.complete(request);
      const choice = response.choices[0];
      if (!choice) {
        throw new Error("Provider response did not contain a choice");
      }
      this.apiTurns.push({
        kind: "chat_completion",
        request: clone(requestEvidence) as unknown as JsonRecord,
        response: clone(response) as unknown as JsonRecord,
        elapsed_seconds: elapsedSeconds(started),
      });
      return choice;
    } catch (error) {
      this.apiTurns.push({
        kind: "chat_completion",
        request: clone(requestEvidence) as unknown as JsonRecord,
        elapsed_seconds: elapsedSeconds(started),
        error: errorEvidence(
          error,
          response ? clone(response) as unknown as JsonRecord : undefined,
        ),
      });
      throw error;
    }
  }
}

export function runOfflineDemo(
  question = "Moonshot AI 的 Context Caching 是什么技术？",
  verbose = true,
): SearchResult {
  const trace: TraceStep[] = [
    {
      iteration: 1,
      type: "thought",
      content: "用户想了解 Context Caching。这是 Moonshot 的特性，我需要先搜索官方说明，确认它的定义和作用。",
    },
    {
      iteration: 1,
      type: "action",
      tool: "web_search",
      args: { query: "Moonshot AI Context Caching 是什么" },
    },
    {
      iteration: 1,
      type: "observation",
      tool: "web_search",
      content: "（示例结果）Context Caching 是一种上下文缓存机制：把重复使用的前缀（如长系统提示、文档）缓存在服务端，后续请求命中缓存即可复用，从而降低重复计算与费用。",
    },
    {
      iteration: 2,
      type: "thought",
      content: "已知大致定义，但还缺少适用场景。再搜一次它的典型用途以便答得更完整。",
    },
    {
      iteration: 2,
      type: "action",
      tool: "web_search",
      args: { query: "Context Caching 适用场景 计费" },
    },
    {
      iteration: 2,
      type: "observation",
      tool: "web_search",
      content: "（示例结果）常见于多轮对话、长文档反复问答、固定系统提示等场景；命中缓存的 token 通常按更低价格计费，并能显著降低首字延迟。",
    },
    {
      iteration: 3,
      type: "answer",
      content: "Context Caching（上下文缓存）是 Moonshot AI 提供的一种机制：将重复使用的上下文前缀缓存在服务端，后续请求复用缓存内容，从而降低重复计算、减少费用、并加快响应。它特别适合长系统提示、长文档反复问答、多轮对话等场景。（本段来自离线示例轨迹，非真实搜索结果。）",
    },
  ];
  if (verbose) {
    for (const step of trace) {
      console.log(formatTraceStep(step));
    }
  }
  return {
    question,
    trace,
    answer: trace.at(-1)?.content ?? "",
  };
}

function pythonStyleJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('\":', '\": ').replaceAll(',\"', ', \"');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function elapsedSeconds(started: number): number {
  return Number(((performance.now() - started) / 1_000).toFixed(6));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebSearchTool(value: unknown): value is FormulaToolDefinition {
  if (!isRecord(value) || value.type !== "function" || !isRecord(value.function)) {
    return false;
  }
  return value.function.name === "web_search" &&
    isRecord(value.function.parameters);
}

async function readJsonResponse(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Provider returned a non-object JSON response");
  }
  return parsed;
}

function errorEvidence(
  error: unknown,
  response?: JsonRecord,
): ApiTurn["error"] {
  return {
    class: error instanceof Error ? error.name : "Error",
    message: toErrorMessage(error),
    ...(response ? { response } : {}),
  };
}
