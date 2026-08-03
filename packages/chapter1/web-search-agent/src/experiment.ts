#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { WebSearchAgent, isFailureAnswer } from "./agent.js";
import { Config } from "./config.js";
import type { ApiTurn, SearchResult, TraceStep } from "./types.js";

export const FORMULA_URI = "moonshot/web-search:latest";

export const EXPERIMENT_QUESTION = `截至 2026 年 7 月 30 日，请核查东盟成员资格和印度尼西亚首都的最新状态。
请自主完成研究：先搜索东盟成员国的官方来源，确认当前成员数量、成员名单及东帝汶正式入盟日期；
检查第一轮证据还缺什么，然后至少再执行一次不同的后续搜索，核实雅加达与努山塔拉的当前法律地位以及总统令是否已生效。
最后给出结构化结论、检索日期和可点击的权威来源链接。不要依赖记忆作答。`;

type LooseRecord = Record<string, any>;

export interface ExperimentPayload {
  provider: string;
  base_url: string;
  model: string;
  answer: string;
  trace: TraceStep[] | LooseRecord[];
  api_turns: ApiTurn[] | LooseRecord[];
  question?: string;
}

export interface ExperimentValidation {
  checks: Record<string, boolean>;
  passed: boolean;
  formula_uri: string;
  fiber_ids: string[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cached_prompt_tokens: number;
    reasoning_tokens: number;
  };
}

export function responseIds(turns: LooseRecord[]): string[] {
  return turns
    .filter((turn) => turn.kind === "chat_completion")
    .map((turn) => turn.response?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function fiberIds(turns: LooseRecord[]): string[] {
  return turns
    .filter((turn) =>
      turn.kind === "formula_fiber" &&
      turn.http_status === 200 &&
      turn.response?.status === "succeeded"
    )
    .map((turn) => turn.response?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function hasWebSearchDeclaration(tools: unknown[]): boolean {
  return tools.some((tool) => {
    if (!isRecord(tool) || tool.type !== "function" || !isRecord(tool.function)) {
      return false;
    }
    return tool.function.name === "web_search" &&
      isRecord(tool.function.parameters);
  });
}

export function tokenUsage(turns: LooseRecord[]): ExperimentValidation["usage"] {
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedPromptTokens = 0;
  let reasoningTokens = 0;
  for (const turn of turns) {
    if (turn.kind !== "chat_completion") {
      continue;
    }
    const usage = turn.response?.usage ?? {};
    promptTokens += numeric(usage.prompt_tokens);
    completionTokens += numeric(usage.completion_tokens);
    cachedPromptTokens += numeric(usage.prompt_tokens_details?.cached_tokens);
    reasoningTokens += numeric(
      usage.completion_tokens_details?.reasoning_tokens,
    );
  }
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    cached_prompt_tokens: cachedPromptTokens,
    reasoning_tokens: reasoningTokens,
  };
}

export function validateExperiment(
  payload: ExperimentPayload,
): ExperimentValidation {
  const trace = payload.trace as LooseRecord[];
  const turns = payload.api_turns as LooseRecord[];
  const chatTurns = turns.filter((turn) => turn.kind === "chat_completion");
  const declarationTurns = turns.filter(
    (turn) => turn.kind === "formula_tools",
  );
  const fiberTurns = turns.filter((turn) => turn.kind === "formula_fiber");
  const ids = fiberIds(turns);
  const searchActions = trace.filter(
    (step) => step.type === "action" && step.tool === "web_search",
  );
  const answerLower = payload.answer.toLowerCase();
  const declarationTools = declarationTurns[0]?.response?.tools;

  const checks = {
    direct_moonshot_api: payload.provider === "moonshot" &&
      payload.base_url.replace(/\/$/, "") === "https://api.moonshot.cn/v1",
    exact_model: payload.model === "kimi-k3",
    one_real_formula_declaration_fetch: declarationTurns.length === 1 &&
      declarationTurns[0]?.formula_uri === FORMULA_URI &&
      declarationTurns[0]?.http_status === 200 &&
      !declarationTurns[0]?.error,
    provider_formula_declares_standard_web_search:
      declarationTurns.length === 1 &&
      Array.isArray(declarationTools) &&
      hasWebSearchDeclaration(declarationTools),
    provider_response_each_chat_turn:
      responseIds(turns).length === chatTurns.length && chatTurns.length >= 3,
    formula_tool_declared_each_chat_turn: chatTurns.length > 0 &&
      chatTurns.every((turn) =>
        Array.isArray(turn.request?.tools) &&
        hasWebSearchDeclaration(turn.request.tools)
      ),
    all_fibers_succeeded: fiberTurns.length >= 2 &&
      ids.length === fiberTurns.length,
    multiple_distinct_formula_fibers: ids.length >= 2 &&
      new Set(ids).size >= 2,
    fiber_requests_match_model_actions:
      fiberTurns.length === searchActions.length &&
      fiberTurns.every((turn) =>
        turn.formula_uri === FORMULA_URI &&
        turn.request?.body?.name === "web_search" &&
        typeof turn.request?.body?.arguments === "string"
      ),
    sequential_search_rounds_observed:
      new Set(searchActions.map((step) => step.iteration)).size >= 2,
    reasoning_observed: trace.some((step) => step.type === "thought"),
    final_answer_observed:
      trace.some((step) => step.type === "answer") &&
      !isFailureAnswer(payload.answer),
    source_links_in_answer: answerLower.includes("http://") ||
      answerLower.includes("https://"),
    official_sources_in_answer: answerLower.includes("asean.org") &&
      ["go.id", "polri.go.id", "mkri.id"].some((domain) =>
        answerLower.includes(domain)
      ),
    current_eleven_member_fact: ["11", "十一"].some((marker) =>
      answerLower.includes(marker)
    ) && ["timor-leste", "东帝汶"].some((marker) =>
      answerLower.includes(marker)
    ),
    timor_leste_admission_date: answerLower.includes("2025") &&
      ["10月26", "10 月 26", "10-26", "october 26"].some((marker) =>
        answerLower.includes(marker)
      ),
    indonesia_capital_transition_explained:
      ["jakarta", "雅加达"].some((marker) => answerLower.includes(marker)) &&
      ["nusantara", "努山塔拉"].some((marker) =>
        answerLower.includes(marker)
      ) &&
      ["presidential decree", "presidential decision", "总统令"].some(
        (marker) => answerLower.includes(marker),
      ),
    retrieval_date_reported: answerLower.includes("2026") &&
      ["7月30", "7 月 30", "2026-07-30"].some((marker) =>
        answerLower.includes(marker)
      ),
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
    formula_uri: FORMULA_URI,
    fiber_ids: ids,
    usage: tokenUsage(turns),
  };
}

export async function runExperiment(options: {
  model?: string;
  attempts?: number;
  timeoutSeconds?: number;
  outputDirectory?: string;
} = {}): Promise<{ evidencePath: string; validation: ExperimentValidation }> {
  const model = options.model ?? "kimi-k3";
  const attempts = options.attempts ?? 3;
  const timeoutSeconds = options.timeoutSeconds ?? 180;
  if (model !== "kimi-k3") {
    throw new Error("Experiment 1-2 requires the exact kimi-k3 model");
  }
  const apiKey = Config.apiKey;
  if (!apiKey) {
    throw new Error("MOONSHOT_API_KEY or KIMI_API_KEY is required");
  }

  const failures: LooseRecord[] = [];
  let run: ExperimentPayload | undefined;
  let validation: ExperimentValidation | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const candidate = await runOnce(apiKey, model, timeoutSeconds);
    const candidateValidation = validateExperiment(candidate);
    run = candidate;
    validation = candidateValidation;
    if (candidateValidation.passed) {
      break;
    }
    failures.push({
      attempt,
      answer: candidate.answer,
      validation: candidateValidation,
      api_turns: candidate.api_turns,
    });
    if (attempt < attempts) {
      await delay(2 ** attempt * 1_000);
    }
  }
  if (!run || !validation) {
    throw new Error("Experiment did not produce a run");
  }

  const stamp = new Date().toISOString().replaceAll(/[-:.]/g, "").slice(0, 15) + "Z";
  const outputDirectory = options.outputDirectory ??
    path.join("validation", `real_${stamp}`);
  await mkdir(outputDirectory, { recursive: true });
  const evidence = {
    schema_version: "2.0",
    experiment_id: "1-2",
    evidence_mode: "real_api",
    created_at: new Date().toISOString(),
    canonical_source: "book/chapter1.md#实验-1-2-kimi-k3-原生-agent-能力",
    credential_source_env: process.env.MOONSHOT_API_KEY
      ? "MOONSHOT_API_KEY"
      : "KIMI_API_KEY",
    credential_value_recorded: false,
    host: {
      platform: `${os.platform()} ${os.release()}`,
      node: process.version,
      machine: os.machine(),
    },
    repository: {
      commit: gitValue("rev-parse", "HEAD"),
      branch: gitValue("branch", "--show-current"),
      worktree_dirty: Boolean(gitValue("status", "--porcelain")),
    },
    transient_failed_attempts: failures,
    run,
    acceptance: validation,
  };
  const evidencePath = path.join(outputDirectory, "evidence.json");
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const digest = createHash("sha256")
    .update(await readFile(evidencePath))
    .digest("hex");
  await writeFile(
    path.join(outputDirectory, "evidence.sha256"),
    `${digest}  evidence.json\n`,
    "utf8",
  );
  await mkdir("validation", { recursive: true });
  await copyFile(evidencePath, path.join("validation", "latest.json"));
  return { evidencePath, validation };
}

async function runOnce(
  apiKey: string,
  model: string,
  timeoutSeconds: number,
): Promise<ExperimentPayload> {
  const agent = new WebSearchAgent({
    apiKey,
    model,
    verbose: true,
    requestTimeoutSeconds: timeoutSeconds,
  });
  const answer = await agent.searchAndAnswer(EXPERIMENT_QUESTION, 8);
  const result: SearchResult = {
    provider: agent.usingOpenRouter ? "openrouter" : "moonshot",
    model: agent.model,
    base_url: agent.baseUrl,
    question: EXPERIMENT_QUESTION,
    answer,
    trace: agent.getTrace(),
    api_turns: agent.getApiTurns(),
  };
  return result as ExperimentPayload;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      model: { type: "string", default: "kimi-k3" },
      attempts: { type: "string", default: "3" },
      timeout: { type: "string", default: "180" },
      "output-dir": { type: "string" },
    },
  });
  const result = await runExperiment({
    model: values.model,
    attempts: Number(values.attempts),
    timeoutSeconds: Number(values.timeout),
    outputDirectory: values["output-dir"],
  });
  console.log(JSON.stringify(result.validation, null, 2));
  console.log(`Evidence: ${result.evidencePath}`);
  return result.validation.passed ? 0 : 1;
}

function gitValue(...arguments_: string[]): string | null {
  try {
    return execFileSync("git", arguments_, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function numeric(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
