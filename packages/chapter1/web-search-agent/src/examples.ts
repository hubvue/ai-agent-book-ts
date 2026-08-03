import { writeFile } from "node:fs/promises";

import {
  WebSearchAgent,
  isFailureAnswer,
  type WebSearchAgentOptions,
} from "./agent.js";

export interface BatchSearchResult {
  question: string;
  answer: string;
  status: "success" | "error";
}

export interface FactCheckResult {
  statement: string;
  is_true: boolean;
  explanation: string;
}

export class AdvancedWebSearchAgent extends WebSearchAgent {
  constructor(options: WebSearchAgentOptions = {}) {
    super(options);
  }

  async batchSearch(questions: string[]): Promise<BatchSearchResult[]> {
    const results: BatchSearchResult[] = [];
    for (const question of questions) {
      try {
        const answer = await this.searchAndAnswer(question);
        results.push({
          question,
          answer,
          status: isFailureAnswer(answer) ? "error" : "success",
        });
      } catch (error) {
        results.push({
          question,
          answer: error instanceof Error ? error.message : String(error),
          status: "error",
        });
      }
      this.clearHistory();
    }
    return results;
  }

  searchWithContext(question: string, context: string): Promise<string> {
    return this.searchAndAnswer(`
背景信息：${context}

基于上述背景，请回答以下问题：
${question}
`);
  }

  comparativeSearch(items: string[], aspect: string): Promise<string> {
    return this.searchAndAnswer(
      `请搜索并比较 ${items.join("、")} 在 ${aspect} 方面的差异和优劣`,
    );
  }

  async factCheck(statement: string): Promise<FactCheckResult> {
    const answer = await this.searchAndAnswer(`
请验证以下陈述的真实性：
"${statement}"

请严格按以下格式作答：
- 第一行只输出判定结论，三选一：真 / 假 / 部分真实
- 之后另起一行给出相关事实、证据与信息来源
`);
    const firstLine = answer.split("\n").find((line) => line.trim())?.trim() ?? "";
    const partial = firstLine.includes("部分真实") ||
      firstLine.includes("部分正确");
    const negative = ["假", "不真实", "不属实", "不准确", "不正确", "错误"]
      .some((marker) => firstLine.includes(marker));
    const positive = ["真", "属实", "正确"]
      .some((marker) => firstLine.includes(marker));
    return {
      statement,
      is_true: !partial && !negative && positive,
      explanation: answer,
    };
  }
}

export async function runResearchAssistant(
  agent: AdvancedWebSearchAgent,
  topic: string,
  output = "research_report.json",
): Promise<Array<{ section: number; question: string; findings: string }>> {
  const questions = [
    `什么是${topic}？请提供详细定义`,
    `${topic}的关键里程碑和重要事件有哪些？`,
    `${topic}面临的主要挑战是什么？`,
    `${topic}的未来发展趋势如何？`,
  ];
  const report = [];
  for (const [index, question] of questions.entries()) {
    report.push({
      section: index + 1,
      question,
      findings: await agent.searchAndAnswer(question),
    });
    agent.clearHistory();
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}
