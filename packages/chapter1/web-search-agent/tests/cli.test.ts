import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { runCli } from "../src/cli.js";

describe("web-search CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("writes UTF-8 offline JSON without API credentials", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "web-search-cli-"));
    const outputPath = path.join(directory, "offline-result.json");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli([
      "한국어",
      "질문",
      "--provider",
      "offline-demo",
      "--quiet",
      "--output",
      outputPath,
    ]);

    const payload = JSON.parse(await readFile(outputPath, "utf8"));
    expect(payload.question).toBe("한국어 질문");
    expect(Object.keys(payload).sort()).toEqual(["answer", "question", "trace"]);
    expect(payload.trace.at(-1).type).toBe("answer");
    expect(payload.answer).toBe(payload.trace.at(-1).content);
    expect(log.mock.calls.flat().join("\n")).not.toContain("💭");
    expect(log.mock.calls.flat().join("\n")).toContain("结果已保存到");
  });

  test("uses the default offline question when none is provided", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runCli(["--provider", "offline-demo", "--quiet"]);
    expect(log.mock.calls.flat().join("\n")).toContain(
      "Moonshot AI 的 Context Caching 是什么技术？",
    );
  });

  test("rejects invalid providers and iteration limits", async () => {
    await expect(runCli(["--provider", "other"])).rejects.toThrow(
      "Invalid provider",
    );
    await expect(runCli([
      "--provider",
      "offline-demo",
      "--max-steps",
      "0",
    ])).rejects.toThrow("positive integer");
  });
});
