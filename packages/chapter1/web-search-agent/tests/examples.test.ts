import { describe, expect, test, vi } from "vitest";

import {
  MAX_ITERATIONS_MESSAGE,
  NO_INFO_MESSAGE,
  SEARCH_ERROR_PREFIX,
  isFailureAnswer,
} from "../src/agent.js";
import { AdvancedWebSearchAgent } from "../src/examples.js";
import type { ChatClient } from "../src/types.js";

const unusedClient: ChatClient = {
  async complete() {
    throw new Error("unused");
  },
};

describe("AdvancedWebSearchAgent", () => {
  test("classifies every fallback as a failure", () => {
    expect(isFailureAnswer(`${SEARCH_ERROR_PREFIX}: boom`)).toBe(true);
    expect(isFailureAnswer(MAX_ITERATIONS_MESSAGE)).toBe(true);
    expect(isFailureAnswer(NO_INFO_MESSAGE)).toBe(true);
    expect(isFailureAnswer("北京今天多云。")).toBe(false);
  });

  test("marks batch fallback answers as errors and clears history", async () => {
    const agent = createAdvanced();
    const search = vi.spyOn(agent, "searchAndAnswer")
      .mockResolvedValueOnce("正常答案")
      .mockResolvedValueOnce(`${SEARCH_ERROR_PREFIX}: network down`)
      .mockResolvedValueOnce(MAX_ITERATIONS_MESSAGE)
      .mockResolvedValueOnce(NO_INFO_MESSAGE);
    const clear = vi.spyOn(agent, "clearHistory");

    const results = await agent.batchSearch(["q1", "q2", "q3", "q4"]);
    expect(results.map((result) => result.status)).toEqual([
      "success",
      "error",
      "error",
      "error",
    ]);
    expect(search).toHaveBeenCalledTimes(4);
    expect(clear).toHaveBeenCalledTimes(4);
  });

  test.each([
    ["部分真实\n解释", false],
    ["不真实\n解释", false],
    ["真\n解释", true],
  ])("parses fact-check verdict %s", async (answer, expected) => {
    const agent = createAdvanced();
    vi.spyOn(agent, "searchAndAnswer").mockResolvedValue(answer);
    await expect(agent.factCheck("statement")).resolves.toMatchObject({
      is_true: expected,
      explanation: answer,
    });
  });
});

function createAdvanced(): AdvancedWebSearchAgent {
  return new AdvancedWebSearchAgent({
    apiKey: "test-key",
    client: unusedClient,
    fetchImpl: async () => new Response("{}"),
  });
}
