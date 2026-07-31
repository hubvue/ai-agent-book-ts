# Chapter 1 — Context

English | [简体中文](README.md)

This package is the TypeScript implementation of the “Critical Role of Context” example from Chapter 1 of *AI Agent*. It provides a context-aware agent with tool-calling support and five ablation modes for observing how conversation history, reasoning content, tool definitions, and tool results affect task execution.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Five Context Modes](#five-context-modes)
- [Built-in Tools](#built-in-tools)
- [Supported Model Providers](#supported-model-providers)
- [Requirements and Installation](#requirements-and-installation)
- [Quick Start](#quick-start)
- [CLI Options](#cli-options)
- [Interactive Mode](#interactive-mode)
- [Sample Tasks](#sample-tasks)
- [Ablation Study](#ablation-study)
- [Strict Experiment 1.1 and Real-API Evidence](#strict-experiment-11-and-real-api-evidence)
- [Programmatic API](#programmatic-api)
- [Testing and Verification](#testing-and-verification)
- [Project Structure](#project-structure)
- [Interpreting Results](#interpreting-results)
- [Limitations and FAQ](#limitations-and-faq)
- [Python-to-TypeScript Migration Notes](#python-to-typescript-migration-notes)

## Overview

The example centers on an agent that performs multi-step financial analysis. The agent can:

- Call PDF parsing, currency conversion, calculator, and JavaScript interpreter tools.
- Maintain message history and execution trajectories across multiple model requests.
- Switch among five context modes to construct comparable requests.
- Record each API request, response, tool call, reasoning segment, and final answer.
- Run a general ablation study that produces JSON, a Markdown report, and an SVG chart.
- Run strict Experiment 1.1, validate all five request shapes and the canonical answer, and generate evidence with a SHA-256 digest.

Use it to:

- Learn what makes up an agent’s context and how each part affects behavior.
- Demonstrate OpenAI-compatible tool calling.
- Compare behavior when specific context components are removed.
- Establish repeatable local tests and real-API evidence for the experiment in the book.

This package is not a production financial system, a live exchange-rate service, or a secure execution platform for untrusted code.

## How It Works

```text
CLI / TypeScript API
        │
        ▼
ContextAwareAgent
  ├─ Builds model requests and tool definitions
  ├─ Maintains conversationHistory
  ├─ Records trajectory
  └─ Removes or hides context according to ContextMode
        │
        ├──────────────► OpenAIChatClient ─► Model provider
        │
        └──────────────► ToolRegistry
                           ├─ parse_pdf
                           ├─ convert_currency
                           ├─ calculate
                           └─ code_interpreter
```

Each `executeTask()` call runs for at most the configured number of iterations. On every iteration, the model may answer directly or request one or more tools. After tool results are added to message history, the agent calls the model again. Execution stops when the agent receives a textual answer, encounters an error, or reaches the iteration limit.

The agent maintains two kinds of state:

- `conversationHistory`: messages that are actually used to construct subsequent model requests.
- `trajectory`: experiment records, including `reasoning_steps`, `tool_calls`, and `api_turns`.

An agent instance is stateful. Consecutive `executeTask()` calls reuse the existing history. Call `reset()` or create a new instance before starting an independent task.

## Five Context Modes

| Mode | Request behavior | Experiment intent |
|---|---|---|
| `full` | Preserves complete message history, reasoning fields, tool definitions, and actual tool results | Baseline |
| `no_history` | Sends only the system message and current user message on every API request; previous assistant and tool messages are not sent again | Observe repeated calls and interrupted task progress without cross-turn history |
| `no_reasoning` | Removes `reasoning_content` and `reasoning` before assistant messages are written back to history | Observe behavior when explicit reasoning content is no longer carried forward |
| `no_tool_calls` | Omits `tools` and `tool_choice` from the request | Observe behavior when the model cannot initiate tool calls |
| `no_tool_results` | Still executes tools, but replaces the tool message with `[Tool result hidden due to context mode]` | Observe behavior when actions are visible but observations are hidden |

Important details:

- `no_reasoning` removes explicit reasoning fields passed to subsequent turns. It does not disable the model’s internal reasoning capability.
- `no_history` is not a sliding window that retains a few recent messages. It strictly reduces the request to system + current user.
- `no_tool_results` still executes tools locally and stores results in `trajectory.tool_calls`. Only the tool message shown to the model is hidden.

## Built-in Tools

| Tool name | TypeScript method | Purpose | Important note |
|---|---|---|---|
| `parse_pdf` | `ToolRegistry.parsePdf()` | Reads a local path, `file:` URL, or HTTP(S) PDF and extracts text and metadata page by page | Text extraction does not preserve complex table layouts |
| `convert_currency` | `ToolRegistry.convertCurrency()` | Converts among built-in currencies such as USD, EUR, GBP, JPY, CNY, and SGD | Uses fixed rates defined in code, not live market data |
| `calculate` | `ToolRegistry.calculate()` | Evaluates restricted mathematical expressions with common `Math` functions and `^` exponent syntax | The result must be a finite number |
| `code_interpreter` | `ToolRegistry.codeInterpreter()` | Runs JavaScript in an isolated Node.js `vm` context | It is not Python and should not execute untrusted code |

The JavaScript interpreter exposes `console.log`, `Math`, and `JSON`. It attempts to select the primary result from the following variables:

```text
result → total → output → answer → final
```

Example:

```js
const revenues = [2_500_000, 2_100_000, 1_800_000];
const total = revenues.reduce((sum, value) => sum + value, 0);
console.log(total);
```

Do not send Python syntax, `import`, `require`, or code that depends on filesystem or network access to `code_interpreter`.

## Supported Model Providers

The following values are defaults from the current source code. They describe how this project constructs requests; they do not guarantee that an external service or model identifier will remain available indefinitely.

| `--provider` | Default model | API key environment variable | Optional base URL variable |
|---|---|---|---|
| `siliconflow` | `Qwen/Qwen3.5-397B-A17B` | `SILICONFLOW_API_KEY` | — |
| `doubao` | `doubao-seed-1-6-thinking-250715` | `ARK_API_KEY` | — |
| `kimi` | `kimi-k3` | `MOONSHOT_API_KEY` or `KIMI_API_KEY` | `KIMI_BASE_URL` |
| `deepseek` | `deepseek-v4-flash` | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` |
| `zhipu` | `glm-5.2` | `ZHIPU_API_KEY` | — |
| `openrouter` | `openai/gpt-5.6-luna` | `OPENROUTER_API_KEY` | `OPENROUTER_BASE_URL` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` | `OPENAI_BASE_URL` |
| `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | — |
| `ollama` | `qwen3:8b` | Not required; `OLLAMA_API_KEY` is optional | `OLLAMA_BASE_URL` |

Provider aliases:

- `moonshot` → `kimi`
- `ark` → `doubao`
- `google` → `gemini`

### OpenRouter Fallback

The general CLI and programmatic API support `OPENROUTER_API_KEY` as a universal fallback:

1. An explicit `--api-key` or the selected provider’s own key takes precedence.
2. If no direct provider key is available but `OPENROUTER_API_KEY` is set, the request is routed through OpenRouter with a mapped model identifier.
3. When a non-`openai` provider requests a `gpt-5*` model and an OpenRouter key is available, OpenRouter is preferred.
4. `ollama` does not require a key and defaults to `http://localhost:11434/v1`.

Strict Experiment 1.1 does not accept a universal fallback in place of direct credentials because the evidence must identify the direct provider unambiguously.

## Requirements and Installation

### Prerequisites

- Node.js `>=24`; the repository’s `.nvmrc` selects `24.15.0`.
- pnpm `9.12.0`.
- The corresponding provider API key when running a remote model.
- A running local service and downloaded target model when using Ollama.

### Install Dependencies

Run from the monorepo root:

```bash
nvm use
pnpm install
pnpm --filter @ai-agent-book/chapter1-context build
```

### Configure `.env`

```bash
cp packages/chapter1/context/env.example \
  packages/chapter1/context/.env
```

Then add only the credentials you need. For example:

```dotenv
MOONSHOT_API_KEY=your-key
```

Or use a local Ollama instance:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434/v1
```

### Configuration Precedence and Compatibility Variables

At runtime, `provider`, `model`, and `apiKey` supplied through the CLI or constructor take precedence. API keys and custom base URLs may also be read from the environment variables in the provider table above.

`env.example` also retains these configuration helper variables:

| Variable | Current behavior |
|---|---|
| `MAX_ITERATIONS` | Default used when `executeTask()` receives no explicit iteration count; defaults to `10` |
| `LLM_PROVIDER` | Default for `Config.llmProvider`; the CLI still uses `--provider` |
| `MODEL_NAME` | Override returned by `Config.getDefaultModel()`; use `--model` for the CLI |
| `MODEL_TEMPERATURE` | Value returned by `Config.getModelConfig()` |
| `MODEL_MAX_TOKENS` | Value returned by `Config.getModelConfig()` |

Current agent requests use a fixed `max_tokens: 8192`. Temperature is normally `0.3`, while Kimi K3 and GPT-5 models use the reasoning-compatible value `1`. Do not treat `MODEL_TEMPERATURE` or `MODEL_MAX_TOKENS` as CLI request options.

## Quick Start

Run all commands below from the monorepo root.

### Show Help

```bash
pnpm --filter @ai-agent-book/chapter1-context start --help
```

### Interactive Mode

The CLI defaults to `interactive` mode with the `doubao` provider:

```bash
pnpm --filter @ai-agent-book/chapter1-context start
```

Select a provider and model:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider kimi \
  --model kimi-k3
```

Use local Ollama:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider ollama \
  --model qwen3:8b
```

### Single Task

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode single \
  --provider doubao \
  --context-mode full \
  --task 'Convert $1000 USD to EUR, GBP, and JPY.'
```

Save the result:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode single \
  --provider kimi \
  --task 'Convert $1000 USD to EUR.' \
  --output task-result.json
```

If `--task` is omitted, the CLI displays the built-in tasks and prompts for a selection.

A single task writes to `task_result_<context-mode>.json` by default; for example, the baseline mode writes `task_result_full.json`. Use `--output` to override the path.

### Ablation Study

Run all five modes:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi
```

To run selected modes only, repeat the option:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi \
  --ablation-modes full \
  --ablation-modes no_history \
  --ablation-modes no_tool_results
```

Run multiple tasks:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi \
  --cases 4
```

`--cases` is clamped to the range `1`–`4`. The PDF example is excluded from batch ablation tasks.

## CLI Options

| Option | Values / type | Default | Description |
|---|---|---|---|
| `--mode` | `interactive`, `single`, or `ablation` | `interactive` | Run mode |
| `--task` | String | None | Task text in single mode; prompts for a sample when omitted |
| `--context-mode` | One of the five context modes | `full` | Context mode for a single task |
| `--ablation-modes` | Context mode; repeatable | All five | Selects ablation arms |
| `--cases` | Numeric string | `1` | Number of ablation tasks, effectively limited to 1–4 |
| `--provider` | Supported provider or alias | `doubao` | Model provider |
| `--model` | Model identifier | Provider default | Overrides the default model |
| `--api-key` | String | Read from the environment | Explicit credential; avoid storing it in shell history |
| `--output` | File path | Mode-specific default | JSON output path for single-task or ablation mode |
| `-h`, `--help` | — | — | Shows help |

Prefer environment variables for API keys so credentials do not appear in process lists or shell history.

## Interactive Mode

The prompt is `You:`. Available commands:

| Command | Action |
|---|---|
| `help` | Shows CLI help |
| `samples` | Lists built-in sample tasks |
| `sample N` | Runs sample N |
| `providers` | Lists providers and marks the current one |
| `provider NAME` | Switches provider and creates a new agent |
| `modes` | Lists the five context modes |
| `mode NAME` | Switches context mode and creates a new agent |
| `status` | Shows provider, model, context mode, message count, and tool-call count |
| `reset` | Clears the current agent’s history and trajectory |
| `create_pdfs` | Regenerates the two local sample PDFs |
| `quit`, `exit`, `q` | Exits |

Any other text is submitted to the current agent as a task. Switching the provider or context mode creates a new agent, so previous conversation state is not carried into the new configuration.

## Sample Tasks

The package includes five samples:

1. Multi-currency conversion: convert USD 1,000 to EUR, GBP, and JPY, then calculate the average of the three converted values.
2. PDF analysis: parse `fixtures/pdfs/simple_expense_report.pdf` and summarize the extracted text.
3. Complex financial analysis: convert four quarters of revenue in different currencies to USD, then calculate total revenue, average revenue, the highest quarter, and profit.
4. Multi-currency budget: normalize an event budget, calculate category percentages, and simulate a 15% reduction.
5. Investment portfolio analysis: compare current value, purchase cost, profit/loss, total return, and the best-performing international asset.

In interactive mode:

```text
samples
sample 1
```

You can also exercise the local PDF tools and tests without calling a remote model.

## Ablation Study

The general ablation runner uses `AblationTestSuite` to execute each task/context-mode combination. Results include:

- Whether the agent returned a non-empty final answer.
- Execution time and iteration count.
- Number of tool calls.
- The complete `trajectory`.
- Time, iteration, and tool-call deltas relative to the `full` baseline.

Default outputs:

| File | Contents |
|---|---|
| `ablation_results.json` | Raw results for each test; `--output` overrides only this path |
| `ablation_study_report.md` | Summary table, impact analysis, and conclusions |
| `ablation_study_results.svg` | Visualization of success, execution time, iterations, and tool calls |

These relative paths are resolved from the process working directory. When the command is run through `pnpm --filter ... start`, that is normally the package directory.

In the general ablation runner, `success` only means the agent returned a non-empty textual answer. It does not verify numerical correctness. Use the strict experiment below to validate the experiment hypothesis and canonical answer.

## Strict Experiment 1.1 and Real-API Evidence

The strict experiment always runs all five context modes against the canonical financial task from the book and checks:

- Exactly five experiment arms are present.
- The actual requests for each arm satisfy the corresponding context contract.
- The request uses a direct provider rather than an OpenRouter fallback.
- The baseline answer contains the expected annual total and quarterly average.
- Behaviors such as repeated tool calls, reaching the iteration ceiling, and making no tool calls are recorded.

Run the experiment:

```bash
pnpm --filter @ai-agent-book/chapter1-context experiment \
  --provider kimi \
  --model kimi-k3 \
  --max-iterations 5
```

Specify an output directory:

```bash
pnpm --filter @ai-agent-book/chapter1-context experiment \
  --provider kimi \
  --model kimi-k3 \
  --output-dir validation/my-run
```

Direct credentials supported by the strict experiment:

| Provider | Credential |
|---|---|
| `kimi` / `moonshot` | `MOONSHOT_API_KEY` or `KIMI_API_KEY` |
| `doubao` | `ARK_API_KEY` |
| `siliconflow` | `SILICONFLOW_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

Each run generates:

```text
validation/real_<timestamp>/
├── evidence.json
└── evidence.sha256
```

It also copies the latest evidence to `validation/latest.json`. The evidence records the command, runtime environment, dependency versions, Git state, request/response summaries for all five arms, tool trajectories, and Judge results. It does not record the API key value.

### Preserved Python Real-API Baseline

The migration preserves direct Kimi K3 evidence from July 29, 2026:

```text
validation/python-baseline/
├── latest.json
└── real_20260729T153329Z/
    ├── evidence.json
    └── evidence.sha256
```

The TypeScript Judge accepts all five context contracts in this evidence. Observed results:

| Mode | Iterations | Tool actions | Repeated actions | Canonical answer correct |
|---|---:|---:|---|---|
| `full` | 3 | 4 | No | Yes |
| `no_history` | 5 | 15 | Yes | No |
| `no_reasoning` | 3 | 4 | No | Yes |
| `no_tool_calls` | 1 | 0 | No | No |
| `no_tool_results` | 5 | 7 | Yes | No |

For this evidence, `experiment_execution_accepted` is `true`, while `all_manuscript_behavior_claims_observed` is `false` because the `no_reasoning` arm still produced the correct answer. The record therefore supports the experiment execution and request contracts, but it does not support an absolute claim that removing explicit reasoning must reduce performance.

Migration verification did not use user credentials to call a remote model again. Before publishing new empirical claims about the TypeScript implementation, rerun the strict experiment with a direct provider key.

## Programmatic API

The package entry point exports the agent, tools, context types, provider resolution, ablation APIs, and strict experiment APIs.

### Create an Agent

```ts
import {
  ContextAwareAgent,
  ContextMode,
} from "@ai-agent-book/chapter1-context";

const agent = new ContextAwareAgent({
  apiKey: process.env.MOONSHOT_API_KEY,
  provider: "kimi",
  model: "kimi-k3",
  contextMode: ContextMode.FULL,
  verbose: false,
});

const result = await agent.executeTask(
  "Convert $1000 USD to EUR, GBP, and JPY.",
  5,
);

console.log(result.final_answer);
console.log(result.trajectory.tool_calls);

agent.reset();
```

`ContextAwareAgentOptions` supports:

| Field | Purpose |
|---|---|
| `apiKey` | Explicit API key |
| `provider` | Provider; defaults to `siliconflow` in the programmatic API |
| `model` | Model identifier |
| `contextMode` | Context mode; defaults to `full` |
| `verbose` | Prints each request and response when enabled; defaults to `true` |
| `client` | Injects a custom `ChatClient` for tests or another SDK |
| `tools` | Injects a custom `ToolRegistry` |

Note that the CLI defaults to `doubao`, while a directly constructed `ContextAwareAgent` defaults to `siliconflow`. Always pass `provider` explicitly to avoid environment-dependent behavior.

### Call Tools Directly

```ts
import { ToolRegistry } from "@ai-agent-book/chapter1-context";

const tools = new ToolRegistry();

console.log(tools.convertCurrency(1000, "USD", "EUR"));
console.log(tools.calculate("(12 + 8) * 3"));
console.log(
  tools.codeInterpreter(`
    const values = [10, 20, 30];
    const result = values.reduce((sum, value) => sum + value, 0);
  `),
);

const pdf = await tools.parsePdf(
  "fixtures/pdfs/simple_expense_report.pdf",
);
console.log(pdf);
```

### Run an Ablation Study

```ts
import {
  ContextMode,
  runAblationStudy,
} from "@ai-agent-book/chapter1-context";

const { results, analysis } = await runAblationStudy({
  provider: "kimi",
  model: "kimi-k3",
  contextModes: [
    ContextMode.FULL,
    ContextMode.NO_HISTORY,
    ContextMode.NO_TOOL_RESULTS,
  ],
  numberOfCases: 2,
  output: "ablation-results.json",
});

console.log(results.length, analysis);
```

### Main Exports

| API | Purpose |
|---|---|
| `ContextAwareAgent` | Executes multi-turn tasks with tool calling |
| `ContextMode` | Constants for the five context modes |
| `ToolRegistry` | Built-in tool implementations |
| `Config` | Environment configuration helpers |
| `PROVIDERS` / `SUPPORTED_PROVIDERS` | Provider metadata |
| `resolveBackend()` | Resolves a direct or OpenRouter backend |
| `getSampleTasks()` / `getAblationCases()` | Returns built-in tasks |
| `AblationTestSuite` / `runAblationStudy()` | General ablation study |
| `runSingleTask()` | Single-task wrapper |
| `evaluateContextContract()` | Validates one arm’s API request shape |
| `analyzeExperiment()` / `runExperiment()` | Strict Experiment 1.1 |
| `createSamplePdfs()` | Generates local sample PDFs |

## Testing and Verification

Run from the monorepo root:

```bash
pnpm typecheck
pnpm build
pnpm test
```

Verify only this package:

```bash
pnpm --filter @ai-agent-book/chapter1-context typecheck
pnpm --filter @ai-agent-book/chapter1-context build
pnpm --filter @ai-agent-book/chapter1-context test
```

The current migration baseline contains 31 tests across 5 test files:

| Test file | Coverage |
|---|---|
| `tests/agent.test.ts` | Agent loop, message history, error handling, and trajectory |
| `tests/context-contract.test.ts` | Request shapes for all five modes and negative fixtures |
| `tests/providers.test.ts` | Providers, aliases, model mapping, and OpenRouter fallback |
| `tests/python-baseline.test.ts` | Replay of preserved Python real-API evidence |
| `tests/tools.test.ts` | PDF, currency, calculator, and JavaScript interpreter behavior |

Local tests do not require a remote API key. Real model requests from the CLI and the strict experiment require the corresponding credentials or a local Ollama instance.

## Project Structure

```text
packages/chapter1/context/
├── env.example
├── fixtures/
│   └── pdfs/
│       ├── sample_financial_report_q1_2024.pdf
│       └── simple_expense_report.pdf
├── src/
│   ├── ablation.ts       # General ablation suite, sample tasks, and reports
│   ├── agent.ts          # ContextAwareAgent and context-mode behavior
│   ├── cli.ts            # interactive / single / ablation CLI
│   ├── config.ts         # Environment configuration
│   ├── experiment.ts     # Strict Experiment 1.1 and evidence generation
│   ├── index.ts          # Package exports
│   ├── openai-client.ts  # OpenAI SDK adapter
│   ├── providers.ts      # Providers and OpenRouter routing
│   ├── sample-pdf.ts     # Sample PDF generation
│   ├── tools.ts          # Four built-in tools
│   └── types.ts          # Public types
├── tests/
│   ├── agent.test.ts
│   ├── context-contract.test.ts
│   ├── providers.test.ts
│   ├── python-baseline.test.ts
│   └── tools.test.ts
├── validation/
│   └── python-baseline/
├── package.json
├── README.md
├── README.en.md
└── tsconfig.json
```

Migration procedures, rules, Judge design, and verification checklists are available under the repository-level [`docs/migration`](../../../docs/migration/status.md).

## Interpreting Results

### `success` Does Not Mean the Answer Is Correct

In a general agent result, `success` means only that a non-empty final answer was returned. A model may produce a well-formatted but numerically incorrect answer. Therefore:

- Use `success`, iteration count, and trajectory when debugging agent control flow.
- Inspect `trajectory.tool_calls` when comparing tool behavior.
- Use `canonical_answer_correct` and the context contracts from the strict experiment when validating conclusions.

### One Run Does Not Establish a Stable Rule

Model behavior depends on the provider, model version, sampling, and server-side implementation. A single success or failure in `no_reasoning` cannot establish a universal rule. Research usage should at minimum:

- Fix the task, model, iteration limit, and direct provider.
- Record request shapes, not only final text.
- Run repeated trials and report variance or success rates.
- Distinguish “the experiment executed validly” from “all expected behaviors were observed.”

### Recommended Observations

- Whether `no_history` repeatedly requests the same tool.
- Whether `no_tool_results` keeps calling a tool after it has already executed.
- Whether `no_tool_calls` refuses to invent values that depend on external data.
- Whether `no_reasoning` changes iteration count, tool-call count, or answer accuracy.
- Token usage, execution time, and error types across modes.

## Limitations and FAQ

### Known Limitations

- Exchange rates come from a fixed table in `tools.ts`. They are suitable only for repeatable demonstrations, not trading, quoting, or financial decisions.
- The PDF tool concatenates page text and does not restore complex tables, reading order, images, or OCR for scanned documents.
- The JavaScript interpreter disables dynamic code generation and enforces a timeout, but Node.js `vm` is not a security boundary for hostile code.
- Provider APIs, model identifiers, and custom reasoning fields are external dependencies and may change as services evolve.
- `buildContext()` remains available as a context-summary helper. Current agent requests are primarily controlled through `conversationHistory` and per-mode message transformations.
- General ablation outputs use paths relative to the process working directory.
- The repository preserves real Python evidence but does not yet contain a fresh TypeScript real-API baseline.

### FAQ

#### The CLI Says No API Key Is Available

The CLI defaults to `doubao` and therefore needs `ARK_API_KEY`, an explicit `--api-key`, or an `OPENROUTER_API_KEY` fallback. Without remote credentials, use:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider ollama
```

#### I Set `LLM_PROVIDER`, but the CLI Still Uses doubao

The CLI default is defined by `--provider`; it does not use `Config.llmProvider` as its CLI default. Pass the provider explicitly:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider kimi
```

#### `--ablation-modes full no_history` Fails

This is a repeatable single-value option. Use:

```bash
--ablation-modes full --ablation-modes no_history
```

#### The Code Interpreter Reports a Syntax Error

It runs JavaScript, not Python. Use `const`, `let`, array methods, and `console.log()`.

#### The Second Independent Task Is Affected by the First

An agent instance retains history. Call `agent.reset()` or create a new instance for an independent task.

#### `success: true` but the Answer Is Clearly Wrong

`success` checks only whether final text exists. Inspect the tool trajectory and answer content; canonical experiments should use the strict Judge’s correctness fields.

#### The Strict Experiment Rejects an OpenRouter Fallback

This is intentional evidence design. The strict experiment requires direct credentials so a proxy route cannot be recorded as a direct result from the selected provider.

## Python-to-TypeScript Migration Notes

This package was migrated from the Python `chapter1/context` example. It preserves the tasks, context modes, tool contracts, CLI usage, and evidence structure where practical, while using corresponding TypeScript and Node.js implementations.

Major adaptations:

- Python agent and data structures became strictly typed TypeScript.
- The OpenAI-compatible SDK boundary is wrapped by `OpenAIChatClient`.
- The Python `code_interpreter` became an isolated JavaScript interpreter.
- PyMuPDF parsing became `pdfjs-dist`.
- ReportLab PDF generation became `pdfkit`.
- Matplotlib PNG output became SVG without an additional runtime.
- Several manual provider test scripts were consolidated into one CLI and Vitest tests.
- The repository-level implicit `agentbook.providers` dependency was moved into `providers.ts`.
- Original Python real-API evidence is preserved unchanged and replayed by the TypeScript Judge.

Migration acceptance status:

- Node.js policy is `>=24`.
- The pnpm workspace, lockfile, and TypeScript build are ready.
- `typecheck`, `build`, and all 31 local tests pass.
- All 5/5 context contracts pass against the preserved evidence.
- Fresh TypeScript real-API evidence remains an explicit follow-up.
