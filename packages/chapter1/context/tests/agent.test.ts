import { describe, expect, test } from "vitest";

import { ContextAwareAgent } from "../src/agent.js";
import {
  ContextMode,
  type ChatClient,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from "../src/types.js";

class SequentialChatClient implements ChatClient {
  readonly requests: ChatCompletionRequest[] = [];
  readonly #responses: ChatCompletionResponse[];

  constructor(responses: ChatCompletionResponse[]) {
    this.#responses = [...responses];
  }

  async complete(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    this.requests.push(structuredClone(request));
    const response = this.#responses.shift();
    if (!response) {
      throw new Error("No fake response available");
    }
    return response;
  }
}

describe("ContextAwareAgent", () => {
  test.each(Object.values(ContextMode))(
    "initializes trajectory for %s",
    (contextMode) => {
      const agent = createAgent(contextMode);
      expect(agent.contextMode).toBe(contextMode);
      expect(agent.trajectory.context_mode).toBe(contextMode);
    },
  );

  test("builds readable full context", () => {
    const agent = createAgent(ContextMode.FULL);
    agent.trajectory.reasoning_steps.push("Step 1", "Step 2");
    agent.trajectory.tool_calls.push({
      tool_name: "calculate",
      arguments: { expression: "2 + 2" },
      result: { result: 4 },
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(agent.buildContext()).toContain("Previous Reasoning Steps");
    expect(agent.buildContext()).toContain("Tool Call History");
  });

  test("removes reasoning from no-reasoning readable context", () => {
    const agent = createAgent(ContextMode.NO_REASONING);
    agent.trajectory.reasoning_steps.push("Step 1");
    expect(agent.buildContext()).not.toContain("Previous Reasoning Steps");
  });

  test("keeps only system and current user messages in no-history mode", () => {
    const agent = createAgent(ContextMode.NO_HISTORY);
    agent.conversationHistory.push(
      { role: "user", content: "task" },
      { role: "assistant", content: null, tool_calls: [] },
      { role: "tool", tool_call_id: "call", content: '{"result":4}' },
    );

    expect(agent.prepareMessagesForApi().map((message) => message.role)).toEqual(
      ["system", "user"],
    );
  });

  test("executes registered tools and reports unknown tools", async () => {
    const agent = createAgent(ContextMode.FULL);
    await expect(
      agent.executeTool("calculate", { expression: "2 + 2" }),
    ).resolves.toMatchObject({ result: 4 });
    await expect(agent.executeTool("unknown_tool", {})).resolves.toMatchObject({
      error: "Unknown tool: unknown_tool",
    });
  });

  test("resets trajectory and conversation history", () => {
    const agent = createAgent(ContextMode.FULL);
    agent.trajectory.reasoning_steps.push("Step");
    agent.trajectory.tool_calls.push({
      tool_name: "calculate",
      arguments: {},
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    agent.reset();

    expect(agent.trajectory.reasoning_steps).toEqual([]);
    expect(agent.trajectory.tool_calls).toEqual([]);
    expect(agent.conversationHistory.map((message) => message.role)).toEqual([
      "system",
    ]);
  });

  test("stops after an unmarked text-only response", async () => {
    const client = new SequentialChatClient([
      responseWithMessage({ role: "assistant", content: "Hello!" }),
    ]);
    const agent = createAgent(ContextMode.FULL, client);
    const result = await agent.executeTask("hi", 5);

    expect(result.final_answer).toBe("Hello!");
    expect(result.iterations).toBe(1);
    expect(client.requests).toHaveLength(1);
  });

  test("survives malformed tool argument JSON", async () => {
    const client = new SequentialChatClient([
      responseWithMessage({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-bad",
            type: "function",
            function: {
              name: "calculate",
              arguments: '{"expression": "1+1",}',
            },
          },
        ],
      }),
      responseWithMessage({
        role: "assistant",
        content: "FINAL ANSWER: recovered",
      }),
    ]);
    const agent = createAgent(ContextMode.FULL, client);
    const result = await agent.executeTask("compute", 5);

    expect(result.error).toBeUndefined();
    expect(result.final_answer).toContain("recovered");
    const toolMessage = agent.conversationHistory.find(
      (message) => message.role === "tool",
    );
    expect(toolMessage?.content).toContain("Invalid tool arguments");
    expect(client.requests).toHaveLength(2);
  });

  test("omits tool definitions in no-tool-calls mode", async () => {
    const client = new SequentialChatClient([
      responseWithMessage({
        role: "assistant",
        content: "FINAL ANSWER: text only",
      }),
    ]);
    const agent = createAgent(ContextMode.NO_TOOL_CALLS, client);
    await agent.executeTask("answer", 1);

    expect(client.requests[0]?.tools).toBeUndefined();
    expect(client.requests[0]?.tool_choice).toBeUndefined();
  });
});

function createAgent(
  contextMode: ContextMode,
  client?: ChatClient,
): ContextAwareAgent {
  return new ContextAwareAgent({
    apiKey: "test-key",
    provider: "siliconflow",
    contextMode,
    verbose: false,
    client,
  });
}

function responseWithMessage(
  message: ChatCompletionResponse["choices"][number]["message"],
): ChatCompletionResponse {
  return {
    id: crypto.randomUUID(),
    choices: [{ message }],
  };
}
