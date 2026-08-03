import { describe, expect, test } from "vitest";

import {
  fiberIds,
  validateExperiment,
} from "../src/experiment.js";
import type { ExperimentPayload } from "../src/experiment.js";

describe("Experiment 1-2 Judge", () => {
  test("accepts only real succeeded Fiber receipts", () => {
    expect(fiberIds([
      {
        kind: "formula_fiber",
        http_status: 200,
        response: { id: "fiber-one", status: "succeeded" },
      },
      {
        kind: "formula_fiber",
        http_status: 200,
        response: { id: "fiber-failed", status: "failed" },
      },
      {
        kind: "chat_completion",
        http_status: 200,
        response: { id: "chat-one" },
      },
    ])).toEqual(["fiber-one"]);
  });

  test("accepts distinct sequential Formula searches with official links", () => {
    expect(validateExperiment(validPayload()).passed).toBe(true);
  });

  test("negative control rejects two Fibers from one search round", () => {
    const payload = validPayload();
    const action = payload.trace.find((step) =>
      step.type === "action" && step.iteration === 2
    );
    if (action) {
      action.iteration = 1;
    }
    const result = validateExperiment(payload);
    expect(result.checks.sequential_search_rounds_observed).toBe(false);
    expect(result.passed).toBe(false);
  });
});

function validPayload(): ExperimentPayload {
  const tool = {
    type: "function" as const,
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
  return {
    provider: "moonshot",
    base_url: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    answer: (
      "检索日期 2026-07-30：东盟现有 11（十一）个成员，" +
      "Timor-Leste（东帝汶）于 2025-10-26 加入。" +
      "雅加达 Jakarta 在总统令生效前仍是首都，Nusantara 为迁都目标。" +
      "https://asean.org/example https://inp.polri.go.id/example"
    ),
    trace: [
      { iteration: 1, type: "thought", content: "research" },
      {
        iteration: 1,
        type: "action",
        tool: "web_search",
        args: { query: "ASEAN members" },
      },
      {
        iteration: 1,
        type: "observation",
        tool: "web_search",
        content: "result",
      },
      {
        iteration: 2,
        type: "action",
        tool: "web_search",
        args: { query: "Indonesia capital law" },
      },
      {
        iteration: 2,
        type: "observation",
        tool: "web_search",
        content: "result",
      },
      { iteration: 3, type: "answer", content: "done" },
    ],
    api_turns: [
      {
        kind: "formula_tools",
        formula_uri: "moonshot/web-search:latest",
        request: { method: "GET", url: "https://example/tools" },
        http_status: 200,
        response: { tools: [tool] },
        elapsed_seconds: 0.01,
      },
      ...[1, 2, 3].map((index) => ({
        kind: "chat_completion" as const,
        request: { tools: [tool] },
        response: { id: `chat-${index}`, usage: {} },
        elapsed_seconds: 0.01,
      })),
      ...[1, 2].map((index) => ({
        kind: "formula_fiber" as const,
        formula_uri: "moonshot/web-search:latest",
        request: {
          method: "POST",
          url: "https://example/fibers",
          body: {
            name: "web_search",
            arguments: JSON.stringify({ query: index }),
          },
        },
        http_status: 200,
        response: { id: `fiber-${index}`, status: "succeeded" },
        elapsed_seconds: 0.01,
      })),
    ],
  };
}
