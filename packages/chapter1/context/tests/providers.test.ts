import { describe, expect, test } from "vitest";

import {
  canonicalProvider,
  mapModelToOpenRouter,
  resolveBackend,
} from "../src/providers.js";

describe("provider resolution", () => {
  test("normalizes provider aliases", () => {
    expect(canonicalProvider(" Moonshot ")).toBe("kimi");
    expect(canonicalProvider("ark")).toBe("doubao");
    expect(canonicalProvider("google")).toBe("gemini");
  });

  test("uses a provider direct key before OpenRouter fallback", () => {
    const backend = resolveBackend({
      provider: "deepseek",
      environment: {
        DEEPSEEK_API_KEY: "direct-key",
        OPENROUTER_API_KEY: "fallback-key",
      },
    });

    expect(backend).toMatchObject({
      apiKey: "direct-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      usingOpenRouter: false,
    });
  });

  test("falls back to OpenRouter when a provider key is missing", () => {
    const backend = resolveBackend({
      provider: "deepseek",
      environment: { OPENROUTER_API_KEY: "fallback-key" },
    });

    expect(backend).toMatchObject({
      apiKey: "fallback-key",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "deepseek/deepseek-v4-flash",
      provider: "deepseek",
      usingOpenRouter: true,
    });
  });

  test("uses a placeholder credential for local Ollama", () => {
    expect(
      resolveBackend({ provider: "ollama", environment: {} }),
    ).toMatchObject({
      apiKey: "not-needed",
      baseUrl: "http://localhost:11434/v1",
      usingOpenRouter: false,
    });
  });

  test("maps model ids using the Python registry rules", () => {
    expect(mapModelToOpenRouter("gpt-5.4")).toBe("openai/gpt-5.4");
    expect(mapModelToOpenRouter("claude-sonnet-4")).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(mapModelToOpenRouter("kimi-k3")).toBe("moonshotai/kimi-k2.6");
  });
});
