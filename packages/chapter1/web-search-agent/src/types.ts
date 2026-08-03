export type JsonRecord = Record<string, unknown>;

export interface FunctionToolCall {
  id: string;
  type?: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ConversationMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: FunctionToolCall[];
  tool_call_id?: string;
  [key: string]: unknown;
}

export interface FormulaToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: JsonRecord;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ConversationMessage[];
  temperature: number;
  max_tokens: number;
  timeout?: number;
  reasoning_effort?: string;
  tools?: FormulaToolDefinition[];
}

export interface ChatCompletionChoice {
  finish_reason?: string | null;
  message: ConversationMessage;
}

export interface ChatCompletionResponse {
  id?: string;
  choices: ChatCompletionChoice[];
  usage?: JsonRecord;
  [key: string]: unknown;
}

export interface ChatClient {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

export type TraceStepType = "thought" | "action" | "observation" | "answer";

export interface TraceStep {
  iteration: number;
  type: TraceStepType;
  content?: string;
  tool?: string;
  args?: JsonRecord;
}

export interface ApiTurn {
  kind: "formula_tools" | "formula_fiber" | "chat_completion";
  formula_uri?: string;
  request: JsonRecord;
  http_status?: number | null;
  response?: JsonRecord;
  elapsed_seconds: number;
  error?: {
    class: string;
    message: string;
    response?: unknown;
    response_text?: string;
  };
}

export interface SearchResult {
  question: string;
  answer: string;
  trace: TraceStep[];
  api_turns?: ApiTurn[];
  provider?: "moonshot" | "openrouter";
  model?: string;
  base_url?: string;
}
