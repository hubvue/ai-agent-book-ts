#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";

import {
  getSampleTasks,
  runAblationStudy,
  runSingleTask,
} from "./ablation.js";
import { ContextAwareAgent } from "./agent.js";
import {
  PROVIDERS,
  SUPPORTED_PROVIDERS,
  canonicalProvider,
  getProviderApiKey,
  resolveBackend,
  type ProviderSpec,
} from "./providers.js";
import { createSamplePdfs } from "./sample-pdf.js";
import { ContextMode } from "./types.js";

const CONTEXT_MODES = Object.values(ContextMode);

export async function runCli(arguments_ = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: arguments_,
    allowPositionals: false,
    options: {
      help: { type: "boolean", short: "h" },
      mode: { type: "string", default: "interactive" },
      task: { type: "string" },
      "context-mode": { type: "string", default: ContextMode.FULL },
      "ablation-modes": { type: "string", multiple: true },
      cases: { type: "string", default: "1" },
      provider: { type: "string", default: "kimi" },
      model: { type: "string" },
      "api-key": { type: "string" },
      output: { type: "string" },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }

  const mode = validateRunMode(values.mode!);
  const provider = values.provider!;
  validateProvider(provider);
  const contextMode = validateContextMode(values["context-mode"]!);
  const ablationModes = values["ablation-modes"]?.map(validateContextMode);
  resolveBackend({
    provider,
    model: values.model,
    apiKey: values["api-key"],
  });

  if (mode === "single") {
    const task = values.task ?? (await selectSampleTask());
    const result = await runSingleTask({
      apiKey: values["api-key"],
      task,
      contextMode,
      provider,
      model: values.model,
      output: values.output,
    });
    printExecutionResult(result);
    return;
  }

  if (mode === "ablation") {
    await runAblationStudy({
      apiKey: values["api-key"],
      provider,
      model: values.model,
      contextModes: ablationModes,
      numberOfCases: Number(values.cases),
      output: values.output,
    });
    return;
  }

  await runInteractiveMode({
    apiKey: values["api-key"],
    provider,
    model: values.model,
  });
}

export async function runInteractiveMode(options: {
  apiKey?: string;
  provider: string;
  model?: string;
}): Promise<void> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let currentProvider = options.provider;
  let currentMode: ContextMode = ContextMode.FULL;
  let agent = createAgent();

  console.log("Context-Aware AI Agent");
  console.log(
    "Commands: help, samples, sample N, providers, provider NAME, modes, mode NAME, status, reset, create_pdfs, quit",
  );

  try {
    while (true) {
      const input = (await terminal.question("\nYou: ")).trim();
      if (!input) {
        continue;
      }
      if (["quit", "exit", "q"].includes(input.toLowerCase())) {
        break;
      }
      if (input.toLowerCase() === "help") {
        printHelp();
        continue;
      }
      if (input.toLowerCase() === "samples") {
        printSampleTasks();
        continue;
      }
      if (input.toLowerCase().startsWith("sample ")) {
        const sampleIndex = Number(input.slice("sample ".length)) - 1;
        const sample = getSampleTasks()[sampleIndex];
        if (!sample) {
          console.log("Invalid sample number");
          continue;
        }
        printExecutionResult(await agent.executeTask(sample.task));
        continue;
      }
      if (input.toLowerCase() === "providers") {
        printProviders(currentProvider);
        continue;
      }
      if (input.toLowerCase().startsWith("provider ")) {
        const requestedProvider = input.slice("provider ".length).trim();
        validateProvider(requestedProvider);
        resolveBackend({ provider: requestedProvider });
        currentProvider = requestedProvider;
        agent = createAgent();
        console.log(`Switched to provider: ${currentProvider}`);
        continue;
      }
      if (input.toLowerCase() === "modes") {
        console.log(CONTEXT_MODES.join("\n"));
        continue;
      }
      if (input.toLowerCase().startsWith("mode ")) {
        currentMode = validateContextMode(input.slice("mode ".length).trim());
        agent = createAgent();
        console.log(`Switched to context mode: ${currentMode}`);
        continue;
      }
      if (input.toLowerCase() === "status") {
        console.log({
          provider: currentProvider,
          model: agent.model,
          contextMode: currentMode,
          conversationMessages: agent.conversationHistory.length,
          toolCalls: agent.trajectory.tool_calls.length,
        });
        continue;
      }
      if (input.toLowerCase() === "reset") {
        agent.reset();
        console.log("Agent reset");
        continue;
      }
      if (input.toLowerCase() === "create_pdfs") {
        console.log(await createSamplePdfs());
        continue;
      }
      printExecutionResult(await agent.executeTask(input));
    }
  } finally {
    terminal.close();
  }

  function createAgent(): ContextAwareAgent {
    return new ContextAwareAgent({
      apiKey: options.apiKey,
      contextMode: currentMode,
      provider: currentProvider,
      model: options.model,
    });
  }
}

async function selectSampleTask(): Promise<string> {
  await ensureSamplePdfs();
  const samples = getSampleTasks();
  printSampleTasks();
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const selectedIndex =
      Number(await terminal.question(`Select a task (1-${samples.length}): `)) -
      1;
    const selectedTask = samples[selectedIndex];
    if (!selectedTask) {
      throw new Error("Invalid sample selection");
    }
    return selectedTask.task;
  } finally {
    terminal.close();
  }
}

async function ensureSamplePdfs(): Promise<void> {
  const samplePdfPath = path.resolve(
    "fixtures/pdfs/simple_expense_report.pdf",
  );
  try {
    await access(samplePdfPath);
  } catch {
    await createSamplePdfs();
  }
}

function printExecutionResult(result: {
  success?: boolean;
  iterations: number;
  final_answer?: string | null;
  error?: string;
  trajectory: { tool_calls: unknown[] };
}): void {
  console.log("\nTASK EXECUTION RESULT");
  console.log(`Success: ${result.success ?? false}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Tool Calls: ${result.trajectory.tool_calls.length}`);
  if (result.final_answer) {
    console.log(`\nFinal Answer:\n${result.final_answer}`);
  }
  if (result.error) {
    console.error(`\nError: ${result.error}`);
  }
}

function printSampleTasks(): void {
  for (const [index, sample] of getSampleTasks().entries()) {
    console.log(`${index + 1}. ${sample.name} — ${sample.description}`);
  }
}

function printProviders(currentProvider: string): void {
  for (const providerName of SUPPORTED_PROVIDERS) {
    const canonicalName = canonicalProvider(providerName);
    const provider = PROVIDERS[
      canonicalName as keyof typeof PROVIDERS
    ] as ProviderSpec;
    const keyStatus =
      provider.requiresKey === false
        ? "no API key needed"
        : getProviderApiKey(provider)
          ? "key set"
          : "key not set";
    const current = providerName === currentProvider ? " (current)" : "";
    console.log(
      `${providerName}: ${provider.defaultModel} [${keyStatus}]${current}`,
    );
  }
}

function validateRunMode(value: string): "single" | "ablation" | "interactive" {
  if (value === "single" || value === "ablation" || value === "interactive") {
    return value;
  }
  throw new Error(`Invalid mode: ${value}`);
}

function validateContextMode(value: string): ContextMode {
  if (CONTEXT_MODES.includes(value as ContextMode)) {
    return value as ContextMode;
  }
  throw new Error(
    `Invalid context mode: ${value}. Valid modes: ${CONTEXT_MODES.join(", ")}`,
  );
}

function validateProvider(provider: string): void {
  if (!SUPPORTED_PROVIDERS.includes(provider.toLowerCase())) {
    throw new Error(
      `Invalid provider: ${provider}. Valid providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
  }
}

function printHelp(): void {
  console.log(`上下文感知 AI Agent（第一章 实验 1.1）

Usage:
  context-agent --mode interactive
  context-agent --mode single --task "Convert $1000 to EUR" --provider doubao
  context-agent --mode ablation --cases 3 --provider kimi

Options:
  --mode <single|ablation|interactive>
  --task <text>
  --context-mode <${CONTEXT_MODES.join("|")}>
  --ablation-modes <mode> (repeatable)
  --cases <number>
  --provider <${SUPPORTED_PROVIDERS.join("|")}>
  --model <model>
  --api-key <key>
  --output <path>
`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
