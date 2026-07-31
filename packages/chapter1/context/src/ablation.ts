import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import Table from "cli-table3";

import { ContextAwareAgent } from "./agent.js";
import { ContextMode, type AgentExecutionResult } from "./types.js";

export interface SampleTask {
  name: string;
  description: string;
  task: string;
}

export interface AblationCase {
  name: string;
  task: string;
}

export interface AblationTestResult {
  test_name: string;
  case_name: string;
  context_mode: ContextMode;
  execution_time?: number;
  iterations?: number;
  num_tool_calls?: number;
  success: boolean;
  has_final_answer?: boolean;
  error?: string;
  reasoning_steps?: number;
  final_answer_preview?: string | null;
}

export interface AblationAnalysis {
  total_tests: number;
  successful_tests: number;
  context_mode_impact: Record<
    string,
    {
      success_maintained: boolean;
      execution_time_delta: number;
      iteration_delta: number;
      tool_call_delta: number;
      failure_reason: string | null;
    }
  >;
}

export interface RunSingleTaskOptions {
  apiKey?: string;
  task: string;
  contextMode?: ContextMode;
  provider?: string;
  model?: string;
  output?: string;
  verbose?: boolean;
}

const MODE_NAMES: Readonly<Record<ContextMode, string>> = {
  [ContextMode.FULL]: "Baseline - Full Context",
  [ContextMode.NO_HISTORY]: "Ablation 1 - No Historical Tool Calls",
  [ContextMode.NO_REASONING]: "Ablation 2 - No Reasoning Process",
  [ContextMode.NO_TOOL_CALLS]: "Ablation 3 - No Tool Call Commands",
  [ContextMode.NO_TOOL_RESULTS]: "Ablation 4 - No Tool Call Results",
};

export class AblationTestSuite {
  readonly #apiKey: string;
  readonly #provider: string;
  readonly #model?: string;
  readonly #delayMilliseconds: number;

  readonly testResults: AblationTestResult[] = [];

  constructor(options: {
    apiKey?: string;
    provider?: string;
    model?: string;
    delayMilliseconds?: number;
  }) {
    this.#apiKey = options.apiKey ?? "";
    this.#provider = options.provider ?? "siliconflow";
    this.#model = options.model;
    this.#delayMilliseconds = options.delayMilliseconds ?? 2_000;
  }

  createComplexFinancialTask(): string {
    return `Analyze the financial report from this PDF: https://www.berkshirehathaway.com/qtrly/1stqtr23.pdf

Please complete the following analysis:
1. Extract the total revenue figures from Q1 2023
2. Convert the revenue from USD to EUR, GBP, and JPY
3. Calculate the following metrics:
   - Average revenue across the three converted currencies
   - Percentage difference between highest and lowest converted values
   - If the company maintains a 15% profit margin, what would be the profit in each currency?

Provide a comprehensive financial summary with all calculations shown.`;
  }

  createMultinationalBudgetTask(): string {
    return `A multinational company has the following Q1 2024 expenses documented in this report:
https://raw.githubusercontent.com/adobe/pdfservices-node-sdk-samples/master/resources/extractPDFInput.pdf

Tasks to complete:
1. Parse the PDF and extract all monetary values mentioned
2. The company operates in 5 regions with expenses in different currencies:
   - US Office: $2,500,000 USD
   - UK Office: £1,800,000 GBP
   - Japan Office: ¥380,000,000 JPY
   - EU Office: €2,100,000 EUR
   - Singapore Office: $3,200,000 SGD
3. Convert all expenses to USD for consolidation
4. Calculate:
   - Total global expenses in USD
   - Average expense per region
   - What percentage each region represents of total expenses
   - If we apply a 8% cost reduction uniformly, what would be the new expense for each region in their local currency?

Present a detailed financial analysis with all conversions and calculations.`;
  }

  async runSingleTest(
    task: string,
    contextMode: ContextMode,
    testName: string,
    caseName = "default",
  ): Promise<AblationTestResult> {
    const agent = new ContextAwareAgent({
      apiKey: this.#apiKey,
      contextMode,
      provider: this.#provider,
      model: this.#model,
    });
    const startedAt = performance.now();
    const executionResult = await agent.executeTask(task);
    const executionTime = (performance.now() - startedAt) / 1_000;
    const result: AblationTestResult = {
      test_name: testName,
      case_name: caseName,
      context_mode: contextMode,
      execution_time: roundTo(executionTime, 2),
      iterations: executionResult.iterations,
      num_tool_calls: executionResult.trajectory.tool_calls.length,
      success: executionResult.success ?? false,
      has_final_answer: executionResult.final_answer != null,
      error: executionResult.error,
      reasoning_steps: executionResult.trajectory.reasoning_steps.length,
      final_answer_preview: executionResult.final_answer
        ? `${executionResult.final_answer.slice(0, 200)}...`
        : null,
    };
    return result;
  }

  async runAblationStudy(
    contextModes: ContextMode[] = Object.values(ContextMode),
    cases: AblationCase[] = [
      {
        name: "Multinational Budget",
        task: this.createMultinationalBudgetTask(),
      },
    ],
  ): Promise<AblationTestResult[]> {
    const results: AblationTestResult[] = [];
    for (const ablationCase of cases) {
      for (const contextMode of contextModes) {
        try {
          const result = await this.runSingleTest(
            ablationCase.task,
            contextMode,
            MODE_NAMES[contextMode],
            ablationCase.name,
          );
          results.push(result);
          this.testResults.push(result);
          if (this.#delayMilliseconds > 0) {
            await delay(this.#delayMilliseconds);
          }
        } catch (error) {
          const failedResult: AblationTestResult = {
            test_name: MODE_NAMES[contextMode],
            case_name: ablationCase.name,
            context_mode: contextMode,
            error: error instanceof Error ? error.message : String(error),
            success: false,
          };
          results.push(failedResult);
        }
      }
    }
    return results;
  }

  analyzeResults(results: AblationTestResult[]): AblationAnalysis {
    const analysis: AblationAnalysis = {
      total_tests: results.length,
      successful_tests: results.filter((result) => result.success).length,
      context_mode_impact: {},
    };
    const baseline = results.find(
      (result) => result.context_mode === ContextMode.FULL,
    );
    if (!baseline) {
      return analysis;
    }

    for (const result of results) {
      if (result.context_mode === ContextMode.FULL) {
        continue;
      }
      analysis.context_mode_impact[result.context_mode] = {
        success_maintained: result.success,
        execution_time_delta:
          (result.execution_time ?? 0) - (baseline.execution_time ?? 0),
        iteration_delta:
          (result.iterations ?? 0) - (baseline.iterations ?? 0),
        tool_call_delta:
          (result.num_tool_calls ?? 0) - (baseline.num_tool_calls ?? 0),
        failure_reason: result.success
          ? null
          : getFailureReason(result.context_mode),
      };
    }
    return analysis;
  }

  printResultsTable(results: AblationTestResult[]): void {
    const table = new Table({
      head: [
        "Case",
        "Context Mode",
        "Success",
        "Time",
        "Iterations",
        "Tool Calls",
        "Reasoning",
        "Final Answer",
      ],
    });
    for (const result of results) {
      table.push([
        result.case_name,
        result.context_mode,
        result.success ? "✓" : "✗",
        `${result.execution_time ?? 0}s`,
        result.iterations ?? 0,
        result.num_tool_calls ?? 0,
        result.reasoning_steps ?? 0,
        result.has_final_answer ? "Yes" : "No",
      ]);
    }
    console.log(table.toString());
  }

  printComparisonMatrix(results: AblationTestResult[]): void {
    const cases = [...new Set(results.map((result) => result.case_name))];
    const modes = [...new Set(results.map((result) => result.context_mode))];
    const table = new Table({ head: ["Context Mode", ...cases] });
    for (const mode of modes) {
      table.push([
        mode,
        ...cases.map((caseName) => {
          const result = results.find(
            (candidate) =>
              candidate.context_mode === mode &&
              candidate.case_name === caseName,
          );
          return result
            ? `${result.success ? "✓" : "✗"} ${result.iterations ?? 0}it/${result.num_tool_calls ?? 0}tc`
            : "-";
        }),
      ]);
    }
    console.log(table.toString());
  }

  async visualizeResults(
    results: AblationTestResult[],
    outputPath = "ablation_study_results.svg",
  ): Promise<void> {
    await writeFile(outputPath, createResultsSvg(results), "utf8");
  }

  generateReport(
    results: AblationTestResult[],
    analysis: AblationAnalysis,
  ): string {
    const performance = (mode: ContextMode): string => {
      const result = results.find(
        (candidate) => candidate.context_mode === mode,
      );
      if (!result) {
        return "N/A";
      }
      return `${result.success ? "SUCCESS" : "FAILURE"} - ${result.iterations ?? 0} iterations, ${result.execution_time ?? 0}s`;
    };
    const baseline = results.find(
      (result) => result.context_mode === ContextMode.FULL,
    );

    return `# Context Ablation Study Report

## Executive Summary
This ablation study explores the importance of context components in AI agent behavior.

## Test Configuration
- **Provider**: ${this.#provider}
- **Model**: ${this.#model ?? "default"}
- **Context Modes Tested**: ${results.length}

## Ablation Performance
- No history: ${performance(ContextMode.NO_HISTORY)}
- No reasoning: ${performance(ContextMode.NO_REASONING)}
- No tool definitions: ${performance(ContextMode.NO_TOOL_CALLS)}
- No tool results: ${performance(ContextMode.NO_TOOL_RESULTS)}

## Statistical Summary
- **Total Tests Run**: ${analysis.total_tests}
- **Successful Completions**: ${analysis.successful_tests}
- **Baseline Execution Time**: ${baseline?.execution_time ?? 0}s
- **Baseline Tool Calls**: ${baseline?.num_tool_calls ?? 0}
`;
  }
}

export async function runSingleTask(
  options: RunSingleTaskOptions,
): Promise<AgentExecutionResult> {
  const contextMode = options.contextMode ?? ContextMode.FULL;
  const agent = new ContextAwareAgent({
    apiKey: options.apiKey,
    contextMode,
    provider: options.provider ?? "siliconflow",
    model: options.model,
    verbose: options.verbose,
  });
  const result = await agent.executeTask(options.task);
  const outputPath = options.output ?? `task_result_${contextMode}.json`;
  await writeJson(outputPath, serializeExecutionResult(result, contextMode));
  return result;
}

export async function runAblationStudy(options: {
  apiKey?: string;
  provider?: string;
  model?: string;
  contextModes?: ContextMode[];
  numberOfCases?: number;
  output?: string;
}): Promise<{
  results: AblationTestResult[];
  analysis: AblationAnalysis;
}> {
  const suite = new AblationTestSuite({
    apiKey: options.apiKey,
    provider: options.provider,
    model: options.model,
  });
  const cases =
    (options.numberOfCases ?? 1) > 1
      ? getAblationCases(options.numberOfCases)
      : undefined;
  const results = await suite.runAblationStudy(
    options.contextModes,
    cases,
  );
  const analysis = suite.analyzeResults(results);
  suite.printResultsTable(results);
  suite.printComparisonMatrix(results);
  await suite.visualizeResults(results);
  await writeFile(
    "ablation_study_report.md",
    suite.generateReport(results, analysis),
    "utf8",
  );
  await writeJson(options.output ?? "ablation_results.json", results);
  return { results, analysis };
}

export function getSampleTasks(
  workingDirectory = process.cwd(),
): SampleTask[] {
  const localPdfPath = path.resolve(
    workingDirectory,
    "fixtures/pdfs/simple_expense_report.pdf",
  );
  const pdfUrl = pathToFileURL(localPdfPath).href;

  return [
    {
      name: "📊 Currency Conversion Task",
      description: "Convert between multiple currencies",
      task: `Convert $1000 USD to EUR, GBP, and JPY.
Then calculate the average value across all three converted currencies.`,
    },
    {
      name: "📄 PDF Analysis Task",
      description: "Extract and analyze data from the bundled PDF",
      task: `Analyze this PDF document: ${pdfUrl}
Extract any text content and provide a summary of what you found.`,
    },
    {
      name: "💰 Complex Financial Analysis",
      description: "Multi-step financial calculation",
      task: `A company has the following quarterly revenues:
- Q1: $2,500,000 USD
- Q2: €2,100,000 EUR
- Q3: £1,800,000 GBP
- Q4: ¥380,000,000 JPY

Please:
1. Convert all revenues to USD
2. Calculate the total annual revenue in USD
3. Determine the average quarterly revenue
4. Find which quarter had the highest revenue
5. If the company has a 20% profit margin, calculate the annual profit in USD`,
    },
    {
      name: "🌍 Multi-Currency Budget Planning",
      description: "International budget calculations",
      task: `An international conference has the following budget allocations:
- Venue (UK): £45,000
- Speakers (US): $75,000
- Catering (France): €38,000
- Technology (Japan): ¥8,500,000
- Marketing (Singapore): S$25,000

Tasks:
1. Convert all amounts to USD
2. Calculate the total budget
3. Determine what percentage each category represents
4. If we need to cut the budget by 15%, how much should each category be reduced to (in their original currencies)?`,
    },
    {
      name: "📈 Investment Portfolio Analysis",
      description: "Analyze international investment returns",
      task: `An investor has the following international investments:
- US Tech Stocks: $125,000 (purchased for $100,000)
- European Bonds: €85,000 (purchased for €90,000)
- UK Real Estate: £200,000 (purchased for £175,000)
- Japanese ETFs: ¥15,000,000 (purchased for ¥12,000,000)

Calculate current and purchase values in USD, profit/loss for each investment,
total portfolio value, overall return percentage, and the best performer.`,
    },
  ];
}

export function getAblationCases(numberOfCases = 1): AblationCase[] {
  const samples = getSampleTasks();
  const candidateIndexes = [0, 2, 3, 4];
  const candidates = candidateIndexes
    .map((index) => samples[index])
    .filter((sample): sample is SampleTask => sample !== undefined);
  const clampedCount = Math.max(
    1,
    Math.min(numberOfCases, candidates.length),
  );
  return candidates
    .slice(0, clampedCount)
    .map(({ name, task }) => ({ name, task }));
}

function getFailureReason(contextMode: ContextMode): string {
  const reasons: Record<ContextMode, string> = {
    [ContextMode.FULL]: "Baseline failed",
    [ContextMode.NO_HISTORY]: "May repeat actions or lose track of progress",
    [ContextMode.NO_REASONING]: "Lacks planning and strategic thinking",
    [ContextMode.NO_TOOL_CALLS]:
      "Cannot execute tools without tool call capability",
    [ContextMode.NO_TOOL_RESULTS]:
      "Cannot make informed decisions without tool results",
  };
  return reasons[contextMode];
}

function serializeExecutionResult(
  result: AgentExecutionResult,
  contextMode: ContextMode,
): Record<string, unknown> {
  return {
    success: result.success ?? false,
    iterations: result.iterations,
    final_answer: result.final_answer,
    error: result.error,
    context_mode: contextMode,
    tool_calls: result.trajectory.tool_calls,
    reasoning_steps: result.trajectory.reasoning_steps,
    api_turns: result.trajectory.api_turns,
    provider: result.provider,
    model: result.model,
    base_url: result.base_url,
    using_openrouter: result.using_openrouter ?? false,
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createResultsSvg(results: AblationTestResult[]): string {
  const width = 920;
  const height = 420;
  const chartHeight = 260;
  const maximumIterations = Math.max(
    1,
    ...results.map((result) => result.iterations ?? 0),
  );
  const barWidth = Math.max(28, Math.floor(720 / Math.max(1, results.length)));
  const bars = results
    .map((result, index) => {
      const barHeight =
        ((result.iterations ?? 0) / maximumIterations) * chartHeight;
      const x = 100 + index * barWidth;
      const y = 330 - barHeight;
      const fill = result.success ? "#2f855a" : "#c53030";
      return `<rect x="${x}" y="${y}" width="${barWidth - 8}" height="${barHeight}" fill="${fill}" rx="4"/>
<text x="${x + (barWidth - 8) / 2}" y="352" text-anchor="middle" font-size="11" fill="#334155">${escapeXml(result.context_mode)}</text>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#f8fafc"/>
<text x="40" y="45" font-family="sans-serif" font-size="24" font-weight="700" fill="#0f172a">Context Ablation Study</text>
<line x1="80" y1="330" x2="880" y2="330" stroke="#94a3b8"/>
<text x="30" y="190" transform="rotate(-90 30 190)" font-family="sans-serif" font-size="14" fill="#475569">Iterations</text>
<g font-family="sans-serif">${bars}</g>
</svg>
`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function roundTo(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
