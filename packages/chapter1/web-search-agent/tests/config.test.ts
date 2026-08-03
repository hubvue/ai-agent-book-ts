import { describe, expect, test } from "vitest";

import {
  mapModelToOpenRouter,
  reasoningSafeTemperature,
  resolveLlmBackend,
} from "../src/config.js";

describe("web-search configuration", () => {
  test.each([
    ["openai/gpt-5.6-luna", "openai/gpt-5.6-luna"],
    ["gpt-5.6-luna", "openai/gpt-5.6-luna"],
    ["o3-mini", "openai/o3-mini"],
    ["claude-sonnet-4.6", "anthropic/claude-sonnet-4.6"],
    ["claude-haiku-4.5", "anthropic/claude-haiku-4.5"],
    ["claude-opus-4.8", "anthropic/claude-opus-4.8"],
    ["kimi-k3", "moonshotai/kimi-k2.6"],
  ])("maps %s to %s", (model, expected) => {
    expect(mapModelToOpenRouter(model)).toBe(expected);
  });

  test("keeps the primary Moonshot backend when its key exists", () => {
    expect(resolveLlmBackend(
      "moonshot-key",
      "https://moonshot.test/v1",
      "kimi-k3",
      {},
    )).toEqual({
      apiKey: "moonshot-key",
      baseUrl: "https://moonshot.test/v1",
      model: "kimi-k3",
      usingOpenRouter: false,
    });
  });

  test("uses OpenRouter when the primary key is missing", () => {
    expect(resolveLlmBackend(
      undefined,
      "https://moonshot.test/v1",
      "kimi-k3",
      {
        OPENROUTER_API_KEY: "openrouter-key",
        OPENROUTER_BASE_URL: "https://openrouter.test/v1",
      },
    )).toEqual({
      apiKey: "openrouter-key",
      baseUrl: "https://openrouter.test/v1",
      model: "moonshotai/kimi-k2.6",
      usingOpenRouter: true,
    });
  });

  test("prefers OpenRouter for GPT-5 and requires at least one key", () => {
    expect(resolveLlmBackend(
      "primary-key",
      "https://primary.test/v1",
      "gpt-5.6-luna",
      { OPENROUTER_API_KEY: "openrouter-key" },
    ).usingOpenRouter).toBe(true);
    expect(() => resolveLlmBackend(
      undefined,
      "https://moonshot.test/v1",
      "kimi-k3",
      {},
    )).toThrow("No API key found");
  });

  test("forces supported temperatures for reasoning models", () => {
    expect(reasoningSafeTemperature("kimi-k3", 0.2)).toBe(1);
    expect(reasoningSafeTemperature("openai/gpt-5.6-luna", 0.2)).toBe(1);
    expect(reasoningSafeTemperature("deepseek-chat", 0.2)).toBe(0.2);
  });
});
