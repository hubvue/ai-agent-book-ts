#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { ContextAwareAgent } from "./agent.js";
import {
  ContextMode,
  type AgentExecutionResult,
  type ApiTurn,
  type ToolCallRecord,
} from "./types.js";

export const EXPERIMENT_ID = "1-1";
export const MODES = Object.values(ContextMode);
export const CANONICAL_TASK = `According to the company's quarterly revenue:
- Q1: 2.5 million USD
- Q2: 2.1 million EUR
- Q3: 1.8 million GBP
- Q4: 380 million JPY

Use the available currency-conversion and calculation tools to convert every
non-USD quarter to USD, then calculate the annual total and quarterly average.
Report both values rounded to two decimal places. Do not estimate exchange
rates yourself; use the tool observations.`;
export const EXPECTED_NUMBERS = ["9602895.73", "2400723.93"] as const;

const DIRECT_KEY_VARIABLES: Readonly<Record<string, readonly string[]>> = {
  kimi: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
  moonshot: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
  doubao: ["ARK_API_KEY"],
  siliconflow: ["SILICONFLOW_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};

export interface ContextContract {
  has_provider_response_ids: boolean;
  turn_count: number;
  request_roles: string[][];
  required_checks: string[];
  passed: boolean;
  [key: string]: unknown;
}

export interface ExperimentArm {
  mode: ContextMode;
  provider?: string;
  model?: string;
  base_url?: string;
  using_openrouter: boolean;
  started_at: string | null;
  elapsed_seconds: number;
  success: boolean;
  iterations: number;
  error?: string;
  final_answer?: string | null;
  tool_calls: ToolCallRecord[];
  tool_call_signatures: string[];
  repeated_tool_calls: number;
  reasoning_steps: string[];
  api_turns: ApiTurn[];
  context_contract: ContextContract;
  behavior: {
    tool_action_count: number;
    has_repeated_tool_action: boolean;
    hit_iteration_ceiling: boolean;
    canonical_answer_correct: boolean;
  };
}

export function evaluateContextContract(
  mode: ContextMode,
  turns: ApiTurn[],
): ContextContract {
  const requests = turns.flatMap((turn) =>
    turn.request ? [turn.request] : [],
  );
  const realResponses = turns.filter((turn) => Boolean(turn.response?.id));
  const details: ContextContract = {
    has_provider_response_ids:
      realResponses.length === turns.length && turns.length > 0,
    turn_count: turns.length,
    request_roles: turns.map(requestRoles),
    required_checks: [],
    passed: false,
  };
  let requiredChecks: string[];

  if (mode === ContextMode.FULL) {
    details.tools_present_every_turn = requests.every(
      (request) => (request.tools?.length ?? 0) > 0,
    );
    details.history_present_after_first_turn =
      requests.length > 1 &&
      requests.slice(1).every((request) => {
        const roles = request.messages.map((message) => message.role);
        return roles.includes("assistant") && roles.includes("tool");
      });
    details.reasoning_retained_after_first_turn =
      requests.length > 1 &&
      requests[1]!.messages.some(
        (message) =>
          message.role === "assistant" &&
          Boolean(message.reasoning_content),
      );
    requiredChecks = [
      "has_provider_response_ids",
      "tools_present_every_turn",
      "history_present_after_first_turn",
      "reasoning_retained_after_first_turn",
    ];
  } else if (mode === ContextMode.NO_TOOL_CALLS) {
    details.tools_absent_every_turn = requests.every(
      (request) => !request.tools && !request.tool_choice,
    );
    requiredChecks = [
      "has_provider_response_ids",
      "tools_absent_every_turn",
    ];
  } else if (mode === ContextMode.NO_TOOL_RESULTS) {
    const laterMessages = requests
      .slice(1)
      .flatMap((request) => request.messages);
    const toolMessages = laterMessages.filter(
      (message) => message.role === "tool",
    );
    details.tool_calls_retained = laterMessages.some(
      (message) =>
        message.role === "assistant" &&
        (message.tool_calls?.length ?? 0) > 0,
    );
    details.tool_results_hidden =
      toolMessages.length > 0 &&
      toolMessages.every(
        (message) =>
          message.content === "[Tool result hidden due to context mode]",
      );
    requiredChecks = [
      "has_provider_response_ids",
      "tool_calls_retained",
      "tool_results_hidden",
    ];
  } else if (mode === ContextMode.NO_REASONING) {
    const laterMessages = requests
      .slice(1)
      .flatMap((request) => request.messages);
    const assistantHistory = laterMessages.filter(
      (message) => message.role === "assistant",
    );
    details.provider_generated_reasoning = turns.some((turn) =>
      Boolean(turn.response?.choices[0]?.message.reasoning_content),
    );
    details.reasoning_removed_from_history =
      assistantHistory.length > 0 &&
      assistantHistory.every(
        (message) => !message.reasoning_content,
      );
    details.tool_and_result_history_retained = requests
      .slice(1)
      .some((request) =>
        request.messages.some((message) => message.role === "tool"),
      );
    requiredChecks = [
      "has_provider_response_ids",
      "provider_generated_reasoning",
      "reasoning_removed_from_history",
      "tool_and_result_history_retained",
    ];
  } else if (mode === ContextMode.NO_HISTORY) {
    details.only_static_prefix_and_user_every_turn =
      requests.length > 0 &&
      requests.every(
        (request) =>
          JSON.stringify(request.messages.map((message) => message.role)) ===
          JSON.stringify(["system", "user"]),
      );
    details.tools_still_present = requests.every(
      (request) => (request.tools?.length ?? 0) > 0,
    );
    requiredChecks = [
      "has_provider_response_ids",
      "only_static_prefix_and_user_every_turn",
      "tools_still_present",
    ];
  } else {
    throw new Error(`Unknown mode: ${String(mode)}`);
  }

  details.required_checks = requiredChecks;
  details.passed = requiredChecks.every(
    (checkName) => details[checkName] === true,
  );
  return details;
}

export function summarizeArm(
  mode: ContextMode,
  result: AgentExecutionResult,
  elapsedSeconds: number,
): ExperimentArm {
  const toolCalls = result.trajectory.tool_calls;
  const signatures = toolCalls.map(
    (toolCall) =>
      `${toolCall.tool_name}:${stableStringify(toolCall.arguments)}`,
  );
  const repeatedToolCalls =
    signatures.length - new Set(signatures).size;
  const finalAnswer = result.final_answer;
  return {
    mode,
    provider: result.provider,
    model: result.model,
    base_url: result.base_url,
    using_openrouter: result.using_openrouter ?? false,
    started_at: null,
    elapsed_seconds: roundTo(elapsedSeconds, 6),
    success: result.success ?? false,
    iterations: result.iterations,
    error: result.error,
    final_answer: finalAnswer,
    tool_calls: toolCalls,
    tool_call_signatures: signatures,
    repeated_tool_calls: repeatedToolCalls,
    reasoning_steps: result.trajectory.reasoning_steps,
    api_turns: result.trajectory.api_turns,
    context_contract: evaluateContextContract(
      mode,
      result.trajectory.api_turns,
    ),
    behavior: {
      tool_action_count: toolCalls.length,
      has_repeated_tool_action: repeatedToolCalls > 0,
      hit_iteration_ceiling:
        result.iterations >= 5 && !(result.success ?? false),
      canonical_answer_correct: EXPECTED_NUMBERS.every((number) =>
        normalizeNumberText(finalAnswer).includes(number),
      ),
    },
  };
}

export function analyzeExperiment(arms: ExperimentArm[]): {
  exact_five_arms_present: boolean;
  all_context_contracts_passed: boolean;
  direct_real_api_evidence: boolean;
  experiment_execution_accepted: boolean;
  manuscript_behavior_claims: Record<string, boolean>;
  usage: Record<string, number>;
} {
  const armsByMode = new Map(arms.map((arm) => [arm.mode, arm]));
  const exactFiveArmsPresent =
    armsByMode.size === MODES.length &&
    MODES.every((mode) => armsByMode.has(mode));
  const allContextContractsPassed =
    exactFiveArmsPresent &&
    arms.every((arm) => arm.context_contract.passed);
  const directRealApiEvidence = arms.every(
    (arm) =>
      !arm.using_openrouter &&
      arm.api_turns.length > 0 &&
      arm.api_turns.every((turn) => Boolean(turn.response?.id)),
  );
  const behavior = {
    full_baseline_correct:
      armsByMode.get(ContextMode.FULL)?.behavior.canonical_answer_correct ??
      false,
    without_tool_definitions_no_tool_action:
      armsByMode.get(ContextMode.NO_TOOL_CALLS)?.behavior.tool_action_count ===
      0,
    without_tool_results_repeated_action:
      armsByMode.get(ContextMode.NO_TOOL_RESULTS)?.behavior
        .has_repeated_tool_action ?? false,
    without_history_repeated_action:
      armsByMode.get(ContextMode.NO_HISTORY)?.behavior
        .has_repeated_tool_action ?? false,
    without_reasoning_degraded: !(
      armsByMode.get(ContextMode.NO_REASONING)?.behavior
        .canonical_answer_correct ?? false
    ),
  };
  const allManuscriptBehaviorClaimsObserved = Object.values(behavior).every(
    Boolean,
  );

  return {
    exact_five_arms_present: exactFiveArmsPresent,
    all_context_contracts_passed: allContextContractsPassed,
    direct_real_api_evidence: directRealApiEvidence,
    experiment_execution_accepted:
      exactFiveArmsPresent &&
      allContextContractsPassed &&
      directRealApiEvidence &&
      behavior.full_baseline_correct,
    manuscript_behavior_claims: {
      ...behavior,
      all_manuscript_behavior_claims_observed:
        allManuscriptBehaviorClaimsObserved,
    },
    usage: tokenUsage(arms),
  };
}

export async function runExperiment(options: {
  provider: string;
  model: string;
  maxIterations: number;
  outputDirectory?: string;
}): Promise<number> {
  if (options.maxIterations < 2) {
    throw new Error("maxIterations must be at least 2");
  }
  const { apiKey, environmentVariable } = resolveDirectKey(options.provider);
  const stamp = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
  const outputDirectory =
    options.outputDirectory ?? path.join("validation", `real_${stamp}`);
  const arms: ExperimentArm[] = [];

  for (const mode of MODES) {
    const startedAt = new Date().toISOString();
    const agent = new ContextAwareAgent({
      apiKey,
      contextMode: mode,
      provider: options.provider,
      model: options.model,
      verbose: false,
    });
    const started = performance.now();
    const result = await agent.executeTask(
      CANONICAL_TASK,
      options.maxIterations,
    );
    const arm = summarizeArm(
      mode,
      result,
      (performance.now() - started) / 1_000,
    );
    arm.started_at = startedAt;
    arm.behavior.hit_iteration_ceiling =
      result.iterations >= options.maxIterations && !(result.success ?? false);
    arms.push(arm);
  }

  const analysis = analyzeExperiment(arms);
  const evidence = {
    schema_version: "1.0",
    experiment_id: EXPERIMENT_ID,
    evidence_mode: "real_api",
    created_at: new Date().toISOString(),
    canonical_source: "book/chapter1.md#实验-1-1-上下文的关键作用",
    task: CANONICAL_TASK,
    expected_numbers: EXPECTED_NUMBERS,
    command: process.argv,
    credential_source_env: environmentVariable,
    credential_value_recorded: false,
    host: {
      platform: `${os.platform()} ${os.release()}`,
      node: process.version,
      machine: os.arch(),
    },
    dependencies: {
      openai: packageVersion("openai"),
      package: packageVersion("@ai-agent-book/chapter1-context"),
    },
    repository: {
      commit: gitValue(["rev-parse", "HEAD"]),
      branch: gitValue(["branch", "--show-current"]),
      worktree_dirty: Boolean(gitValue(["status", "--porcelain"])),
    },
    arms,
    analysis,
  };
  const evidencePath = path.join(outputDirectory, "evidence.json");
  await writeJson(evidencePath, evidence);
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
  console.log(JSON.stringify(analysis, null, 2));
  console.log(`Evidence: ${evidencePath}`);
  console.log(`SHA-256: ${digest}`);
  return analysis.experiment_execution_accepted ? 0 : 1;
}

function requestRoles(turn: ApiTurn): string[] {
  return turn.request?.messages.map((message) => message.role) ?? [];
}

function tokenUsage(arms: ExperimentArm[]): Record<string, number> {
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedPromptTokens = 0;
  let reasoningTokens = 0;
  for (const arm of arms) {
    for (const turn of arm.api_turns) {
      const usage = turn.response?.usage ?? {};
      promptTokens += numericField(usage, "prompt_tokens", "input_tokens");
      completionTokens += numericField(
        usage,
        "completion_tokens",
        "output_tokens",
      );
      cachedPromptTokens += nestedNumericField(
        usage,
        ["prompt_tokens_details", "input_tokens_details"],
        "cached_tokens",
      );
      reasoningTokens += nestedNumericField(
        usage,
        ["completion_tokens_details", "output_tokens_details"],
        "reasoning_tokens",
      );
    }
  }
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    cached_prompt_tokens: cachedPromptTokens,
    reasoning_tokens: reasoningTokens,
  };
}

function numericField(
  record: Record<string, unknown>,
  ...fieldNames: string[]
): number {
  for (const fieldName of fieldNames) {
    const value = Number(record[fieldName] ?? 0);
    if (value) {
      return value;
    }
  }
  return 0;
}

function nestedNumericField(
  record: Record<string, unknown>,
  parentNames: string[],
  fieldName: string,
): number {
  for (const parentName of parentNames) {
    const parent = record[parentName];
    if (parent && typeof parent === "object") {
      const value = Number((parent as Record<string, unknown>)[fieldName] ?? 0);
      if (value) {
        return value;
      }
    }
  }
  return 0;
}

function resolveDirectKey(provider: string): {
  apiKey: string;
  environmentVariable: string;
} {
  const variableNames = DIRECT_KEY_VARIABLES[provider] ?? [];
  for (const variableName of variableNames) {
    const apiKey = process.env[variableName];
    if (apiKey) {
      return { apiKey, environmentVariable: variableName };
    }
  }
  throw new Error(
    `No direct credential for ${provider}; expected one of ${variableNames.join(", ")}`,
  );
}

function normalizeNumberText(value: string | null | undefined): string {
  return (value ?? "").replaceAll(",", "").replaceAll("$", "").replaceAll(
    " ",
    "",
  );
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sortedEntries = Object.entries(value as Record<string, unknown>).sort(
    ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
  );
  return JSON.stringify(Object.fromEntries(sortedEntries));
}

function roundTo(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gitValue(arguments_: string[]): string | null {
  try {
    return execFileSync("git", arguments_, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function packageVersion(packageName: string): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packageJson = require(`${packageName}/package.json`) as {
      version?: string;
    };
    return packageJson.version ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provider: { type: "string", default: "kimi" },
      model: { type: "string", default: "kimi-k3" },
      "max-iterations": { type: "string", default: "5" },
      "output-dir": { type: "string" },
    },
  });
  const exitCode = await runExperiment({
    provider: values.provider!,
    model: values.model!,
    maxIterations: Number(values["max-iterations"]),
    outputDirectory: values["output-dir"],
  });
  process.exitCode = exitCode;
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
