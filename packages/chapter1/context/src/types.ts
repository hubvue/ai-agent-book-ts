export const ContextMode = {
  FULL: "full",
  NO_HISTORY: "no_history",
  NO_REASONING: "no_reasoning",
  NO_TOOL_CALLS: "no_tool_calls",
  NO_TOOL_RESULTS: "no_tool_results",
} as const;

export type ContextMode = (typeof ContextMode)[keyof typeof ContextMode];

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
  tool_calls?: FunctionToolCall[];
  tool_call_id?: string;
  [key: string]: unknown;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: "string" | "number";
          description: string;
        }
      >;
      required: string[];
    };
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ConversationMessage[];
  temperature: number;
  max_tokens: number;
  timeout?: number;
  tools?: ToolDefinition[];
  tool_choice?: "auto";
  extra_body?: Record<string, unknown>;
}

export interface ChatCompletionResponse {
  id?: string;
  choices: Array<{
    message: ConversationMessage;
  }>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatClient {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}

export interface ApiTurn {
  iteration: number;
  provider: string;
  resolved_model: string;
  base_url: string;
  using_openrouter: boolean;
  request?: ChatCompletionRequest;
  response?: ChatCompletionResponse;
  error?: {
    class: string;
    message: string;
  };
}

export interface ToolCallRecord {
  tool_name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  timestamp: string;
}

export interface AgentTrajectory {
  reasoning_steps: string[];
  tool_calls: ToolCallRecord[];
  api_turns: ApiTurn[];
  context_mode: ContextMode;
}

export interface AgentExecutionResult {
  final_answer?: string | null;
  trajectory: AgentTrajectory;
  iterations: number;
  success?: boolean;
  error?: string;
  provider?: string;
  model?: string;
  base_url?: string;
  using_openrouter?: boolean;
}
