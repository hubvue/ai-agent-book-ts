#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";

import { WebSearchAgent, runOfflineDemo } from "./agent.js";
import { Config } from "./config.js";
import type { SearchResult } from "./types.js";

export async function runCli(arguments_ = process.argv.slice(2)): Promise<void> {
  const { values, positionals } = parseArgs({
    args: arguments_,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      provider: { type: "string", default: "kimi" },
      model: { type: "string", default: Config.defaultModel },
      "max-steps": {
        type: "string",
        default: String(Config.maxSearchIterations),
      },
      "base-url": { type: "string", default: Config.kimiBaseUrl },
      "api-key": { type: "string" },
      output: { type: "string", short: "o" },
      quiet: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }
  if (values.provider !== "kimi" && values.provider !== "offline-demo") {
    throw new Error(`Invalid provider: ${values.provider}`);
  }
  const maxSteps = Number(values["max-steps"]);
  if (!Number.isInteger(maxSteps) || maxSteps <= 0) {
    throw new Error("--max-steps must be a positive integer");
  }
  const question = positionals.join(" ").trim();

  if (values.provider === "offline-demo") {
    const demoQuestion = question ||
      "Moonshot AI 的 Context Caching 是什么技术？";
    console.log("\n============================================================");
    console.log("🧪 离线演示模式（示例轨迹，非真实搜索结果）");
    console.log("============================================================");
    console.log(`问题: ${demoQuestion}`);
    console.log("------------------------------------------------------------");
    console.log("🔍 ReAct 轨迹（想 → 做 → 看）:\n");
    const result = runOfflineDemo(demoQuestion, !values.quiet);
    printAnswer(result.answer);
    if (values.output) {
      await saveOutput(values.output, result);
    }
    return;
  }

  const agent = new WebSearchAgent({
    apiKey: Config.getApiKey(values["api-key"]),
    baseUrl: values["base-url"],
    model: values.model,
    verbose: !values.quiet,
  });
  if (question) {
    await runSingleQuestion(agent, question, maxSteps, values.output);
    return;
  }
  await runInteractiveMode(agent, values.output);
}

export async function runSingleQuestion(
  agent: WebSearchAgent,
  question: string,
  maxIterations: number,
  output?: string,
): Promise<void> {
  console.log("\n============================================================");
  console.log("🤖 Kimi Web Search Agent");
  console.log("============================================================");
  console.log(`问题: ${question}`);
  console.log("------------------------------------------------------------");
  console.log("🔍 ReAct 轨迹（想 → 做 → 看）:\n");
  const answer = await agent.searchAndAnswer(question, maxIterations);
  printAnswer(answer);
  if (output) {
    await saveOutput(output, onlineResult(agent, question, answer));
  }
}

export async function runInteractiveMode(
  agent: WebSearchAgent,
  output?: string,
): Promise<void> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n🤖 Kimi Web Search Agent - 交互模式");
  console.log("输入问题；输入 quit/exit 退出，clear 清空历史。");
  try {
    while (true) {
      const question = (await terminal.question("您的问题: ")).trim();
      if (["quit", "exit", "q"].includes(question.toLowerCase())) {
        break;
      }
      if (question.toLowerCase() === "clear") {
        agent.clearHistory();
        console.log("✅ 对话历史已清空");
        continue;
      }
      if (!question) {
        console.log("❌ 请输入一个问题");
        continue;
      }
      const answer = await agent.searchAndAnswer(question);
      printAnswer(answer);
      if (output) {
        await saveOutput(output, onlineResult(agent, question, answer));
      }
    }
  } finally {
    terminal.close();
  }
}

async function saveOutput(path: string, payload: SearchResult): Promise<void> {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\n💾 结果已保存到: ${path}`);
}

function onlineResult(
  agent: WebSearchAgent,
  question: string,
  answer: string,
): SearchResult {
  return {
    question,
    trace: agent.getTrace(),
    answer,
    api_turns: agent.getApiTurns(),
    provider: agent.usingOpenRouter ? "openrouter" : "moonshot",
    model: agent.model,
    base_url: agent.baseUrl,
  };
}

function printAnswer(answer: string): void {
  console.log("\n📝 答案:");
  console.log("------------------------------------------------------------");
  console.log(answer);
  console.log("============================================================\n");
}

function printHelp(): void {
  console.log(`Kimi Web Search Agent（第一章 实验 1-2）

Usage:
  web-search-agent [question]
  web-search-agent --provider offline-demo [question]

Options:
  --provider <kimi|offline-demo>  default: kimi
  --model <model>                 default: ${Config.defaultModel}
  --max-steps <number>            default: ${Config.maxSearchIterations}
  --base-url <url>                default: ${Config.kimiBaseUrl}
  --api-key <key>                 default: MOONSHOT_API_KEY / KIMI_API_KEY
  --output, -o <path>             save question, trace, answer, and evidence
  --quiet                         do not print trace steps
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
