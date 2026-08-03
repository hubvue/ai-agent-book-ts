import { describe, expect, test, vi } from "vitest";

import {
  MAX_ITERATIONS_MESSAGE,
  SEARCH_ERROR_PREFIX,
  WebSearchAgent,
  formatTraceStep,
  runOfflineDemo,
} from "../src/agent.js";
import type {
  ChatClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
  FormulaToolDefinition,
} from "../src/types.js";

const WEB_SEARCH_TOOL: FormulaToolDefinition = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
};

class SequentialChatClient implements ChatClient {
  readonly requests: ChatCompletionRequest[] = [];
  readonly #responses: Array<ChatCompletionResponse | Error>;

  constructor(responses: Array<ChatCompletionResponse | Error>) {
    this.#responses = [...responses];
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.requests.push(structuredClone(request));
    const response = this.#responses.shift();
    if (!response) {
      throw new Error("No fake response available");
    }
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }
}

describe("trace formatting and offline demo", () => {
  test("formats Unicode action arguments like the Python CLI", () => {
    expect(formatTraceStep({
      iteration: 2,
      type: "action",
      tool: "web_search",
      args: { query: "서울 날씨" },
    })).toBe('🔧 [2] 行动: 调用工具 web_search  参数={"query": "서울 날씨"}');
  });

  test("truncates long trace content", () => {
    expect(formatTraceStep({
      iteration: 1,
      type: "thought",
      content: "abcdef",
    }, 3)).toBe("💭 [1] 思考: abc…（省略 3 字）");
  });

  test("returns a deterministic complete offline trace", () => {
    const result = runOfflineDemo("캐싱이 뭐야?", false);
    expect(result.question).toBe("캐싱이 뭐야?");
    expect(result.trace.map((step) => step.type)).toEqual([
      "thought",
      "action",
      "observation",
      "thought",
      "action",
      "observation",
      "answer",
    ]);
    expect(result.answer).toBe(result.trace.at(-1)?.content);
    expect(result.answer).toContain("离线示例轨迹");
  });
});

describe("Moonshot Formula boundary", () => {
  test("fetches, validates, caches, and records the declaration", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      object: "list",
      tools: [WEB_SEARCH_TOOL],
    }));
    const agent = createAgent([], fetchImpl);

    await expect(agent.getTools()).resolves.toEqual([WEB_SEARCH_TOOL]);
    await expect(agent.getTools()).resolves.toEqual([WEB_SEARCH_TOOL]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(agent.getApiTurns()[0]).toMatchObject({
      kind: "formula_tools",
      http_status: 200,
      request: { method: "GET" },
    });
    expect(agent.getApiTurns()[0]?.request).not.toHaveProperty("headers");
  });

  test("forwards raw arguments unchanged and records the Fiber receipt", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      id: "fiber-real",
      status: "succeeded",
      context: { encrypted_output: "encrypted provider output" },
    }));
    const agent = createAgent([], fetchImpl);
    const rawArguments = '{"query":"Moonshot K3"}';

    await expect(
      agent.executeFormula("web_search", rawArguments),
    ).resolves.toBe("encrypted provider output");
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      name: "web_search",
      arguments: rawArguments,
    });
    expect(agent.getApiTurns()[0]?.response).toMatchObject({ id: "fiber-real" });
  });
});

describe("WebSearchAgent ReAct loop", () => {
  test("records tool flow, forwards raw arguments, and returns the answer", async () => {
    const client = new SequentialChatClient([
      response({
        finishReason: "tool_calls",
        reasoning: "공식 설명을 검색해야 한다.",
        toolCalls: [{
          id: "call-1",
          type: "function",
          function: {
            name: "web_search",
            arguments: '{"query": "Moonshot caching"}',
          },
        }],
      }),
      response({ content: "Context Caching 설명입니다." }),
    ]);
    const fetchImpl = formulaFetch();
    const agent = createAgent(client, fetchImpl);

    await expect(agent.searchAndAnswer("Context Caching이 뭐야?")).resolves
      .toBe("Context Caching 설명입니다.");
    expect(agent.getTrace().map((step) => step.type)).toEqual([
      "thought",
      "action",
      "observation",
      "answer",
    ]);
    expect(agent.conversationHistory[2]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{
        id: "call-1",
        type: "function",
        function: {
          name: "web_search",
          arguments: '{"query": "Moonshot caching"}',
        },
      }],
    });
    const fiberRequest = fetchImpl.mock.calls.find((call) =>
      String(call[0]).endsWith("/fibers")
    )?.[1];
    expect(JSON.parse(String(fiberRequest?.body)).arguments).toBe(
      '{"query": "Moonshot caching"}',
    );
    expect(client.requests).toHaveLength(2);
  });

  test("survives malformed tool argument JSON", async () => {
    const rawArguments = '{"query": "moonshot",}';
    const client = new SequentialChatClient([
      response({
        finishReason: "tool_calls",
        toolCalls: [{
          id: "call-bad",
          type: "function",
          function: { name: "web_search", arguments: rawArguments },
        }],
      }),
      response({ content: "recovered answer" }),
    ]);
    const fetchImpl = formulaFetch();
    const agent = createAgent(client, fetchImpl);

    await expect(agent.searchAndAnswer("what is caching?")).resolves.toBe(
      "recovered answer",
    );
    expect(agent.getTrace().find((step) => step.type === "action")?.args)
      .toEqual({});
    const fiberRequest = fetchImpl.mock.calls.find((call) =>
      String(call[0]).endsWith("/fibers")
    )?.[1];
    expect(JSON.parse(String(fiberRequest?.body)).arguments).toBe(rawArguments);
  });

  test("returns the iteration-limit fallback", async () => {
    const agent = createAgent(new SequentialChatClient([
      response({
        finishReason: "tool_calls",
        toolCalls: [{
          id: "call-1",
          type: "function",
          function: { name: "web_search", arguments: "{}" },
        }],
      }),
    ]), formulaFetch());
    await expect(agent.searchAndAnswer("keep searching", 1)).resolves.toBe(
      MAX_ITERATIONS_MESSAGE,
    );
  });

  test("returns the iteration-limit fallback even for an empty tool-call list", async () => {
    const agent = createAgent(new SequentialChatClient([
      response({ finishReason: "tool_calls", toolCalls: [] }),
    ]), formulaFetch());
    await expect(agent.searchAndAnswer("keep searching", 1)).resolves.toBe(
      MAX_ITERATIONS_MESSAGE,
    );
  });

  test("does not call Formula endpoints through the OpenRouter fallback", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new SequentialChatClient([
      response({ content: "model-only answer" }),
    ]);
    const agent = new WebSearchAgent({
      model: "kimi-k3",
      environment: { OPENROUTER_API_KEY: "openrouter-key" },
      client,
      fetchImpl,
    });

    await expect(agent.searchAndAnswer("question")).resolves.toBe(
      "model-only answer",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(client.requests[0]?.tools).toBeUndefined();
  });

  test("marks empty and partial length-limited answers as truncated", async () => {
    for (const partial of ["", "部分答案，被截"]) {
      const agent = createAgent(
        new SequentialChatClient([
          response({ finishReason: "length", content: partial }),
        ]),
        formulaFetch(),
      );
      const answer = await agent.searchAndAnswer("question");
      expect(answer).toContain("截断");
      expect(answer).not.toContain("无法获取足够");
      expect(agent.conversationHistory.at(-1)?.content).toContain("截断");
    }
  });

  test("returns a readable provider error", async () => {
    const agent = createAgent(
      new SequentialChatClient([new Error("provider unavailable")]),
      formulaFetch(),
    );
    await expect(agent.searchAndAnswer("question")).resolves.toBe(
      `${SEARCH_ERROR_PREFIX}: provider unavailable`,
    );
    expect(agent.getTrace()).toEqual([]);
  });

  test("records a malformed provider response as one failed chat turn", async () => {
    const agent = createAgent(
      new SequentialChatClient([{ id: "empty", choices: [] }]),
      formulaFetch(),
    );
    await expect(agent.searchAndAnswer("question")).resolves.toContain(
      "Provider response did not contain a choice",
    );
    const chatTurns = agent.getApiTurns().filter(
      (turn) => turn.kind === "chat_completion",
    );
    expect(chatTurns).toHaveLength(1);
    expect(chatTurns[0]?.error?.response).toMatchObject({ id: "empty" });
  });
});

function createAgent(
  clientOrResponses: ChatClient | Array<ChatCompletionResponse | Error>,
  fetchImpl: typeof fetch,
): WebSearchAgent {
  const client = Array.isArray(clientOrResponses)
    ? new SequentialChatClient(clientOrResponses)
    : clientOrResponses;
  return new WebSearchAgent({
    apiKey: "test-key",
    model: "kimi-k3",
    verbose: false,
    client,
    fetchImpl,
  });
}

function formulaFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith("/tools")) {
      return jsonResponse({ tools: [WEB_SEARCH_TOOL] });
    }
    if (url.endsWith("/fibers")) {
      return jsonResponse({
        id: crypto.randomUUID(),
        status: "succeeded",
        context: { encrypted_output: "encrypted formula output" },
      });
    }
    return jsonResponse({ error: "unexpected URL" }, 404);
  });
}

function response(options: {
  content?: string;
  finishReason?: string;
  reasoning?: string;
  toolCalls?: ChatCompletionResponse["choices"][number]["message"]["tool_calls"];
}): ChatCompletionResponse {
  return {
    id: crypto.randomUUID(),
    choices: [{
      finish_reason: options.finishReason ?? "stop",
      message: {
        role: "assistant",
        content: options.content ?? null,
        reasoning_content: options.reasoning,
        tool_calls: options.toolCalls,
      },
    }],
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
