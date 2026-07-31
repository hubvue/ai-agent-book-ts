import { Config, reasoningSafeTemperature, toErrorMessage } from "./config.js";
import { OpenAIChatClient } from "./openai-client.js";
import { resolveBackend } from "./providers.js";
import { ToolRegistry, type ToolResult } from "./tools.js";
import {
  ContextMode,
  type AgentExecutionResult,
  type AgentTrajectory,
  type ChatClient,
  type ChatCompletionRequest,
  type ConversationMessage,
  type FunctionToolCall,
  type ToolCallRecord,
  type ToolDefinition,
} from "./types.js";

export interface ContextAwareAgentOptions {
  apiKey?: string;
  contextMode?: ContextMode;
  provider?: string;
  model?: string;
  verbose?: boolean;
  client?: ChatClient;
  tools?: ToolRegistry;
}

const SYSTEM_PROMPT = `You are an intelligent assistant with access to tools.

Your task is to solve the given problems using the available tools. Think step by step and use tools as needed.

Important: When you have gathered all necessary information and computed the final answer, clearly state "FINAL ANSWER:" followed by your answer.`;

export class ContextAwareAgent {
  readonly provider: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly usingOpenRouter: boolean;
  readonly contextMode: ContextMode;
  readonly verbose: boolean;
  readonly tools: ToolRegistry;

  trajectory: AgentTrajectory;
  conversationHistory: ConversationMessage[];

  readonly #client: ChatClient;

  constructor(options: ContextAwareAgentOptions = {}) {
    const requestedProvider = (options.provider ?? "siliconflow").toLowerCase();
    const backend = resolveBackend({
      provider: requestedProvider,
      model: options.model,
      apiKey: options.apiKey,
    });

    this.provider = requestedProvider;
    this.model = backend.model;
    this.baseUrl = backend.baseUrl;
    this.usingOpenRouter = backend.usingOpenRouter;
    this.contextMode = options.contextMode ?? ContextMode.FULL;
    this.verbose = options.verbose ?? true;
    this.tools = options.tools ?? new ToolRegistry();
    this.#client =
      options.client ??
      new OpenAIChatClient({
        apiKey: backend.apiKey,
        baseUrl: backend.baseUrl,
      });
    this.trajectory = createTrajectory(this.contextMode);
    this.conversationHistory = [];
    this.initializeSystemPrompt();
  }

  buildContext(): string {
    const contextParts: string[] = [];
    if (
      this.contextMode !== ContextMode.NO_REASONING &&
      this.trajectory.reasoning_steps.length > 0
    ) {
      contextParts.push("## Previous Reasoning Steps:");
      for (const reasoningStep of this.trajectory.reasoning_steps) {
        contextParts.push(`- ${reasoningStep}`);
      }
      contextParts.push("");
    }

    if (
      this.contextMode !== ContextMode.NO_HISTORY &&
      this.contextMode !== ContextMode.NO_TOOL_CALLS &&
      this.trajectory.tool_calls.length > 0
    ) {
      contextParts.push("## Tool Call History:");
      for (const toolCall of this.trajectory.tool_calls) {
        contextParts.push(
          `- Called ${toolCall.tool_name} with args: ${JSON.stringify(toolCall.arguments)}`,
        );
        if (
          this.contextMode !== ContextMode.NO_TOOL_RESULTS &&
          toolCall.result
        ) {
          contextParts.push(
            `  Result: ${JSON.stringify(toolCall.result, null, 2)}`,
          );
        }
      }
      contextParts.push("");
    }

    return contextParts.join("\n");
  }

  prepareMessagesForApi(): ConversationMessage[] {
    if (this.contextMode !== ContextMode.NO_HISTORY) {
      return this.conversationHistory;
    }

    const currentRequest = this.conversationHistory.filter(
      (message) => message.role === "system",
    );
    const lastUserMessage = this.conversationHistory.findLast(
      (message) => message.role === "user",
    );
    if (lastUserMessage) {
      currentRequest.push(lastUserMessage);
    }
    return currentRequest;
  }

  async executeTool(
    toolName: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolResult> {
    const toolExecutors: Record<
      string,
      () => Promise<ToolResult> | ToolResult
    > = {
      parse_pdf: () => this.tools.parsePdf(String(arguments_.url ?? "")),
      convert_currency: () =>
        this.tools.convertCurrency(
          Number(arguments_.amount),
          String(arguments_.from_currency ?? ""),
          String(arguments_.to_currency ?? ""),
        ),
      calculate: () =>
        this.tools.calculate(String(arguments_.expression ?? "")),
      code_interpreter: () =>
        this.tools.codeInterpreter(String(arguments_.code ?? "")),
    };
    const execute = toolExecutors[toolName];
    if (!execute) {
      return { error: `Unknown tool: ${toolName}` };
    }
    return execute();
  }

  async executeTask(
    task: string,
    maxIterations = Config.maxIterations,
  ): Promise<AgentExecutionResult> {
    this.conversationHistory.push({ role: "user", content: task });
    let iteration = 0;
    let finalAnswer: string | null = null;

    while (iteration < maxIterations) {
      iteration += 1;
      try {
        const apiMessages = this.prepareMessagesForApi();
        const request = this.createCompletionRequest(apiMessages);
        const requestEvidence = this.createRequestEvidence(request);
        const response = await this.#client.complete(request);
        this.trajectory.api_turns.push({
          iteration,
          provider: this.provider,
          resolved_model: this.model,
          base_url: this.baseUrl,
          using_openrouter: this.usingOpenRouter,
          request: snapshot(requestEvidence),
          response: snapshot(response),
        });
        this.logRequestAndResponse(requestEvidence, response, iteration);

        const message = response.choices[0]?.message;
        if (!message) {
          throw new Error("Provider response did not contain a message");
        }
        const reasoningContent = getReasoningContent(message);
        if (reasoningContent) {
          this.trajectory.reasoning_steps.push(reasoningContent);
        }

        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
          this.conversationHistory.push(this.prepareAssistantMessage(message));
          const content = (message.content ?? "").trim();
          if (content) {
            finalAnswer = extractFinalAnswer(content) ?? content;
          }
          break;
        }

        this.conversationHistory.push(this.prepareAssistantMessage(message));
        await this.executeRequestedTools(toolCalls);

        if (message.content?.includes("FINAL ANSWER:")) {
          finalAnswer = extractFinalAnswer(message.content);
          break;
        }
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        this.trajectory.api_turns.push({
          iteration,
          provider: this.provider,
          resolved_model: this.model,
          base_url: this.baseUrl,
          using_openrouter: this.usingOpenRouter,
          error: {
            class: error instanceof Error ? error.name : "Error",
            message: errorMessage,
          },
        });
        return {
          error: isTimeoutError(errorMessage)
            ? "Request timed out. The model is taking too long to respond. Try a simpler task or different provider."
            : errorMessage,
          trajectory: this.trajectory,
          iterations: iteration,
        };
      }
    }

    return {
      final_answer: finalAnswer,
      trajectory: this.trajectory,
      iterations: iteration,
      success: finalAnswer !== null,
      provider: this.provider,
      model: this.model,
      base_url: this.baseUrl,
      using_openrouter: this.usingOpenRouter,
    };
  }

  reset(): void {
    this.trajectory = createTrajectory(this.contextMode);
    this.initializeSystemPrompt();
  }

  async process(query: string, maxIterations?: number): Promise<string> {
    const result = await this.executeTask(query, maxIterations);
    if (result.final_answer) {
      return result.final_answer;
    }
    if (result.error) {
      return `Error: ${result.error}`;
    }
    return "No answer found";
  }

  private initializeSystemPrompt(): void {
    this.conversationHistory = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
    ];
  }

  private createCompletionRequest(
    messages: ConversationMessage[],
  ): ChatCompletionRequest {
    const request: ChatCompletionRequest = {
      model: this.model,
      messages,
      temperature: reasoningSafeTemperature(this.model, 0.3),
      max_tokens: 8192,
      timeout: 180_000,
    };
    if (this.contextMode !== ContextMode.NO_TOOL_CALLS) {
      request.tools = getToolDefinitions();
      request.tool_choice = "auto";
    }
    if (this.provider === "deepseek" && !this.usingOpenRouter) {
      request.extra_body = { thinking: { type: "enabled" } };
    }
    return request;
  }

  private createRequestEvidence(
    request: ChatCompletionRequest,
  ): ChatCompletionRequest {
    const { timeout: _timeout, extra_body: extraBody, ...requestEvidence } =
      request;
    if (extraBody) {
      return {
        ...requestEvidence,
        thinking: extraBody.thinking,
      } as ChatCompletionRequest;
    }
    return requestEvidence;
  }

  private prepareAssistantMessage(
    message: ConversationMessage,
  ): ConversationMessage {
    const preparedMessage = snapshot(message);
    if (this.contextMode === ContextMode.NO_REASONING) {
      delete preparedMessage.reasoning_content;
      delete preparedMessage.reasoning;
    }
    return preparedMessage;
  }

  private async executeRequestedTools(
    toolCalls: FunctionToolCall[],
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      const functionName = toolCall.function.name;
      let functionArguments: Record<string, unknown>;
      try {
        functionArguments = JSON.parse(
          toolCall.function.arguments || "{}",
        ) as Record<string, unknown>;
      } catch (error) {
        const errorMessage =
          `Invalid tool arguments (not valid JSON): ${toErrorMessage(error)}. ` +
          `Raw arguments: ${toolCall.function.arguments.slice(0, 500)}`;
        this.appendToolCall({
          toolName: functionName,
          arguments_: {},
          result: { error: errorMessage },
        });
        this.appendToolMessage(toolCall.id, { error: errorMessage });
        continue;
      }

      const result = await this.executeTool(functionName, functionArguments);
      this.appendToolCall({
        toolName: functionName,
        arguments_: functionArguments,
        result,
      });
      this.appendToolMessage(toolCall.id, result);
    }
  }

  private appendToolCall({
    toolName,
    arguments_,
    result,
  }: {
    toolName: string;
    arguments_: Record<string, unknown>;
    result: unknown;
  }): void {
    const toolCall: ToolCallRecord = {
      tool_name: toolName,
      arguments: arguments_,
      result,
      timestamp: new Date().toISOString(),
    };
    this.trajectory.tool_calls.push(toolCall);
  }

  private appendToolMessage(
    toolCallId: string,
    result: ToolResult,
  ): void {
    const content =
      this.contextMode === ContextMode.NO_TOOL_RESULTS
        ? "[Tool result hidden due to context mode]"
        : JSON.stringify(result, jsonSafeReplacer);
    this.conversationHistory.push({
      role: "tool",
      tool_call_id: toolCallId,
      content,
    });
  }

  private logRequestAndResponse(
    request: ChatCompletionRequest,
    response: unknown,
    iteration: number,
  ): void {
    if (!this.verbose) {
      return;
    }
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📤 ITERATION ${iteration} - FULL REQUEST JSON:`);
    console.log("-".repeat(80));
    console.log(JSON.stringify(request, null, 2));
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📥 ITERATION ${iteration} - FULL RESPONSE:`);
    console.log("-".repeat(80));
    console.log(JSON.stringify(response, null, 2));
    console.log(`${"=".repeat(80)}\n`);
  }
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "parse_pdf",
        description:
          "Download and parse a PDF document from a URL or local path to extract text content",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL or local path of the PDF document",
            },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "convert_currency",
        description:
          "Convert an amount from one currency to another using the experiment exchange rates",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number", description: "The amount to convert" },
            from_currency: {
              type: "string",
              description: "The source currency code",
            },
            to_currency: {
              type: "string",
              description: "The target currency code",
            },
          },
          required: ["amount", "from_currency", "to_currency"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "calculate",
        description: "Evaluate a mathematical expression",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "A mathematical expression, for example 2 + 2 * 3",
            },
          },
          required: ["expression"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "code_interpreter",
        description:
          "Execute JavaScript for multi-step calculations and data processing. Assign the final value to result.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description:
                "JavaScript code without imports. Use console.log for output and assign the final value to result.",
            },
          },
          required: ["code"],
        },
      },
    },
  ];
}

function createTrajectory(contextMode: ContextMode): AgentTrajectory {
  return {
    reasoning_steps: [],
    tool_calls: [],
    api_turns: [],
    context_mode: contextMode,
  };
}

function getReasoningContent(
  message: ConversationMessage,
): string | undefined {
  const directReasoning = message.reasoning_content;
  if (directReasoning) {
    return String(directReasoning);
  }
  const reasoning = message.reasoning;
  if (typeof reasoning === "string" && reasoning) {
    return reasoning;
  }
  if (reasoning && typeof reasoning === "object") {
    const reasoningRecord = reasoning as Record<string, unknown>;
    const content = reasoningRecord.content ?? reasoningRecord.text;
    return content ? String(content) : undefined;
  }
  return undefined;
}

function extractFinalAnswer(content: string): string | null {
  const marker = "FINAL ANSWER:";
  const markerIndex = content.indexOf(marker);
  return markerIndex < 0
    ? null
    : content.slice(markerIndex + marker.length).trim();
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, jsonSafeReplacer)) as T;
}

function jsonSafeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return [...value];
  }
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  return value;
}

function isTimeoutError(errorMessage: string): boolean {
  const normalizedError = errorMessage.toLowerCase();
  return (
    normalizedError.includes("timeout") ||
    normalizedError.includes("timed out")
  );
}
