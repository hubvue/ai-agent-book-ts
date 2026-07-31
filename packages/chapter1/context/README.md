# Chapter 1 — Context

[English](README.en.md) | 简体中文

《AI Agent》第一章“上下文的关键作用”示例的 TypeScript 实现。本包提供一个带工具调用能力的上下文感知 Agent，并通过五组消融模式观察对话历史、推理内容、工具定义和工具结果对任务执行的影响。

> English summary: this package is the TypeScript migration of the Chapter 1 context-aware agent and five-arm ablation experiment. It requires Node.js 24+, uses pnpm, supports OpenAI-compatible providers, and includes local tests plus preserved real-API evidence from the Python implementation.

## 目录

- [项目概述](#项目概述)
- [工作原理](#工作原理)
- [五种上下文模式](#五种上下文模式)
- [内置工具](#内置工具)
- [支持的模型提供商](#支持的模型提供商)
- [环境与安装](#环境与安装)
- [快速开始](#快速开始)
- [CLI 参数](#cli-参数)
- [交互模式](#交互模式)
- [示例任务](#示例任务)
- [消融实验](#消融实验)
- [严格实验 1.1 与真实 API 证据](#严格实验-11-与真实-api-证据)
- [编程接口](#编程接口)
- [测试与验证](#测试与验证)
- [项目结构](#项目结构)
- [结果解读](#结果解读)
- [限制与常见问题](#限制与常见问题)
- [Python 到 TypeScript 的迁移说明](#python-到-typescript-的迁移说明)

## 项目概述

该示例围绕一个多步财务分析 Agent 展开。Agent 可以：

- 调用 PDF 解析、货币换算、计算器和 JavaScript 解释器。
- 在多轮模型请求之间维护消息历史和执行轨迹。
- 切换五种上下文模式，构造可比较的请求。
- 记录每轮 API 请求、响应、工具调用、推理内容和最终答案。
- 运行普通消融研究，输出 JSON、Markdown 报告和 SVG 图表。
- 运行严格的实验 1.1，校验五组请求形状和规范答案，并生成带 SHA-256 摘要的证据。

适合用于：

- 学习 Agent 上下文的组成与作用。
- 演示 OpenAI-compatible tool calling。
- 比较不同上下文缺失条件下的行为。
- 为书中实验建立可重复的本地测试与真实 API 证据。

它不是生产级金融系统、实时汇率服务或面向不可信代码的安全执行平台。

## 工作原理

```text
CLI / TypeScript API
        │
        ▼
ContextAwareAgent
  ├─ 构造模型请求与工具定义
  ├─ 维护 conversationHistory
  ├─ 记录 trajectory
  └─ 根据 ContextMode 删除或隐藏上下文
        │
        ├──────────────► OpenAIChatClient ─► 模型提供商
        │
        └──────────────► ToolRegistry
                           ├─ parse_pdf
                           ├─ convert_currency
                           ├─ calculate
                           └─ code_interpreter
```

一次 `executeTask()` 最多运行指定轮数。每轮模型可以直接给出答案，也可以请求一个或多个工具。工具执行结果被写入消息历史后，Agent 再次请求模型，直到得到文本答案、发生错误或达到迭代上限。

Agent 同时维护两类状态：

- `conversationHistory`：实际用于构造后续模型请求的消息。
- `trajectory`：实验记录，包括 `reasoning_steps`、`tool_calls` 和 `api_turns`。

同一个 Agent 实例是有状态的。连续调用 `executeTask()` 会继续使用已有历史；开始独立任务前应调用 `reset()`，或创建新实例。

## 五种上下文模式

| 模式 | 请求行为 | 实验意图 |
|---|---|---|
| `full` | 保留完整消息历史、推理字段、工具定义和真实工具结果 | 基线组 |
| `no_history` | 每轮 API 请求只发送系统消息和当前用户消息；之前的 assistant/tool 消息不会再次发送 | 观察缺少跨轮历史时的重复调用与任务中断 |
| `no_reasoning` | 将 assistant 消息写回历史前删除 `reasoning_content` / `reasoning` 字段 | 观察显式推理内容不再传递时的行为 |
| `no_tool_calls` | 请求中不发送 `tools` 和 `tool_choice` | 观察模型无法发起工具调用时的行为 |
| `no_tool_results` | 工具仍会执行，但写回模型的内容固定为 `[Tool result hidden due to context mode]` | 观察只有调用动作、没有观察结果时的行为 |

需要注意：

- `no_reasoning` 删除的是传递给后续轮次的显式推理字段，不等价于关闭模型内部推理能力。
- `no_history` 不是“保留最近几条消息”的滑动窗口；它严格收缩为 system + 当前 user。
- `no_tool_results` 仍会在本地执行工具，也会在 `trajectory.tool_calls` 中保存工具结果；隐藏的是后续模型看到的 tool 消息内容。

## 内置工具

| 工具名 | TypeScript 方法 | 作用 | 重要说明 |
|---|---|---|---|
| `parse_pdf` | `ToolRegistry.parsePdf()` | 读取本地路径、`file:` URL 或 HTTP(S) PDF，逐页提取文本和元数据 | 文本提取不保留复杂表格布局 |
| `convert_currency` | `ToolRegistry.convertCurrency()` | 在 USD、EUR、GBP、JPY、CNY、SGD 等内置币种之间换算 | 使用代码内固定汇率，不是实时行情 |
| `calculate` | `ToolRegistry.calculate()` | 执行受限数学表达式，支持常用 `Math` 函数和 `^` 幂运算写法 | 结果必须是有限数值 |
| `code_interpreter` | `ToolRegistry.codeInterpreter()` | 在隔离的 Node.js `vm` 上下文中运行 JavaScript | 不是 Python；不应执行不可信代码 |

JavaScript 解释器提供 `console.log`、`Math` 和 `JSON`，并尝试从以下变量中提取主要结果：

```text
result → total → output → answer → final
```

示例：

```js
const revenues = [2_500_000, 2_100_000, 1_800_000];
const total = revenues.reduce((sum, value) => sum + value, 0);
console.log(total);
```

不要向 `code_interpreter` 发送 Python 语法、`import`、`require` 或依赖文件系统/网络访问的代码。

## 支持的模型提供商

以下值是当前代码中的默认配置。它们描述本项目如何构造请求，不保证外部服务或模型名称永远可用。

| `--provider` | 默认模型 | API Key 环境变量 | 可选 Base URL 变量 |
|---|---|---|---|
| `siliconflow` | `Qwen/Qwen3.5-397B-A17B` | `SILICONFLOW_API_KEY` | — |
| `doubao` | `doubao-seed-1-6-thinking-250715` | `ARK_API_KEY` | — |
| `kimi` | `kimi-k3` | `MOONSHOT_API_KEY` 或 `KIMI_API_KEY` | `KIMI_BASE_URL` |
| `deepseek` | `deepseek-v4-flash` | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` |
| `zhipu` | `glm-5.2` | `ZHIPU_API_KEY` | — |
| `openrouter` | `openai/gpt-5.6-luna` | `OPENROUTER_API_KEY` | `OPENROUTER_BASE_URL` |
| `openai` | `gpt-4o` | `OPENAI_API_KEY` | `OPENAI_BASE_URL` |
| `gemini` | `gemini-2.5-flash` | `GEMINI_API_KEY` 或 `GOOGLE_API_KEY` | — |
| `ollama` | `qwen3:8b` | 不要求；可选 `OLLAMA_API_KEY` | `OLLAMA_BASE_URL` |

提供商别名：

- `moonshot` → `kimi`
- `ark` → `doubao`
- `google` → `gemini`

### OpenRouter 回退

普通 CLI 和编程接口支持将 `OPENROUTER_API_KEY` 作为通用回退：

1. 优先使用显式 `--api-key` 或所选提供商自己的 Key。
2. 如果没有提供商直连 Key，但设置了 `OPENROUTER_API_KEY`，则通过 OpenRouter 请求映射后的模型。
3. 非 `openai` 提供商请求 `gpt-5*` 模型且存在 OpenRouter Key 时，会优先走 OpenRouter。
4. `ollama` 不要求 Key，默认地址为 `http://localhost:11434/v1`。

严格实验 1.1 不接受通用回退代替直连凭证，因为证据需要明确记录直连提供商。

## 环境与安装

### 前置条件

- Node.js `>=24`；仓库的 `.nvmrc` 固定为 `24.15.0`。
- pnpm `9.12.0`。
- 运行远程模型时，需要对应提供商的 API Key。
- 使用 Ollama 时，需要本地服务和目标模型已经启动。

### 初始化依赖

从 monorepo 根目录执行：

```bash
nvm use
pnpm install
pnpm --filter @ai-agent-book/chapter1-context build
```

### 配置 `.env`

```bash
cp packages/chapter1/context/env.example \
  packages/chapter1/context/.env
```

然后只填写需要使用的提供商凭证，例如：

```dotenv
MOONSHOT_API_KEY=your-key
```

或使用本地 Ollama：

```dotenv
OLLAMA_BASE_URL=http://localhost:11434/v1
```

### 配置优先级与兼容变量

运行时优先使用 CLI / 构造函数中的 `provider`、`model` 和 `apiKey`。API Key 与自定义 Base URL 也可以从上表的环境变量读取。

`env.example` 还保留了以下配置辅助变量：

| 变量 | 当前作用 |
|---|---|
| `MAX_ITERATIONS` | `executeTask()` 未显式传入迭代数时的默认值，默认 `10` |
| `LLM_PROVIDER` | `Config.llmProvider` 的默认值；CLI 仍以 `--provider` 为准 |
| `MODEL_NAME` | `Config.getDefaultModel()` 的覆盖值；CLI 建议直接使用 `--model` |
| `MODEL_TEMPERATURE` | `Config.getModelConfig()` 的配置值 |
| `MODEL_MAX_TOKENS` | `Config.getModelConfig()` 的配置值 |

当前 Agent 请求固定使用 `max_tokens: 8192`，温度通常为 `0.3`；Kimi K3 和 GPT-5 系列会使用兼容推理模型的温度 `1`。因此不要把 `MODEL_TEMPERATURE` 或 `MODEL_MAX_TOKENS` 当作 CLI 请求参数。

## 快速开始

以下命令均从 monorepo 根目录执行。

### 查看帮助

```bash
pnpm --filter @ai-agent-book/chapter1-context start --help
```

### 交互模式

CLI 默认使用 `interactive` 模式和 `doubao` 提供商：

```bash
pnpm --filter @ai-agent-book/chapter1-context start
```

指定提供商与模型：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider kimi \
  --model kimi-k3
```

本地 Ollama：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider ollama \
  --model qwen3:8b
```

### 单任务

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode single \
  --provider doubao \
  --context-mode full \
  --task 'Convert $1000 USD to EUR, GBP, and JPY.'
```

保存执行结果：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode single \
  --provider kimi \
  --task 'Convert $1000 USD to EUR.' \
  --output task-result.json
```

如果省略 `--task`，CLI 会显示内置任务并要求选择。

单任务默认把结果写入 `task_result_<context-mode>.json`；例如基线模式对应 `task_result_full.json`。`--output` 可以覆盖该路径。

### 消融实验

运行全部五种模式：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi
```

只运行指定模式时，需要重复传入参数：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi \
  --ablation-modes full \
  --ablation-modes no_history \
  --ablation-modes no_tool_results
```

运行多个任务：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi \
  --cases 4
```

`--cases` 会被限制在 `1` 到 `4` 之间；PDF 示例不参与批量消融任务。

## CLI 参数

| 参数 | 可选值 / 类型 | 默认值 | 说明 |
|---|---|---|---|
| `--mode` | `interactive`、`single`、`ablation` | `interactive` | 运行方式 |
| `--task` | 字符串 | 无 | 单任务内容；省略时交互选择样例 |
| `--context-mode` | 五种上下文模式之一 | `full` | 单任务模式使用的上下文 |
| `--ablation-modes` | 上下文模式，可重复 | 全部五种 | 指定消融组 |
| `--cases` | 数字字符串 | `1` | 消融任务数量，实际限制为 1–4 |
| `--provider` | 支持的提供商或别名 | `doubao` | 模型提供商 |
| `--model` | 模型 ID | 提供商默认模型 | 覆盖默认模型 |
| `--api-key` | 字符串 | 从环境变量读取 | 显式凭证；不建议写入 shell 历史 |
| `--output` | 文件路径 | 按模式生成默认文件 | 单任务或消融 JSON 输出路径 |
| `-h`、`--help` | — | — | 显示帮助 |

建议使用环境变量保存 API Key，避免通过 `--api-key` 暴露在进程列表或 shell 历史中。

## 交互模式

启动后提示符为 `You:`。可用命令：

| 命令 | 作用 |
|---|---|
| `help` | 显示 CLI 帮助 |
| `samples` | 列出内置示例任务 |
| `sample N` | 运行第 N 个示例 |
| `providers` | 列出提供商并标记当前项 |
| `provider NAME` | 切换提供商并创建新 Agent |
| `modes` | 列出五种上下文模式 |
| `mode NAME` | 切换上下文模式并创建新 Agent |
| `status` | 显示提供商、模型、上下文模式、消息数和工具调用数 |
| `reset` | 清空当前 Agent 的历史和轨迹 |
| `create_pdfs` | 重新生成两个本地示例 PDF |
| `quit`、`exit`、`q` | 退出 |

普通文本会作为任务交给当前 Agent。切换提供商或上下文模式会创建新实例，因此旧会话状态不会带到新配置中。

## 示例任务

本包内置五个样例：

1. 多币种换算：将 1000 USD 转换为 EUR、GBP、JPY，并计算三个换算值的平均数。
2. PDF 分析：解析 `fixtures/pdfs/simple_expense_report.pdf` 并总结文本。
3. 复杂财务分析：把四个季度的不同币种收入转换为 USD，计算总收入、平均值、最高季度和利润。
4. 多币种预算：统一换算会议预算、计算分类占比并模拟削减 15%。
5. 投资组合分析：比较国际资产的当前价值、买入成本、盈亏、整体回报和最佳表现项。

在交互模式中输入：

```text
samples
sample 1
```

也可以只运行本地 PDF 工具和测试，不调用远程模型。

## 消融实验

普通消融研究通过 `AblationTestSuite` 对任务与上下文模式的组合逐一执行。结果包含：

- 是否得到非空最终答案。
- 执行时间和迭代数。
- 工具调用次数。
- 完整 `trajectory`。
- 相对 `full` 基线的时间、迭代和工具调用差值。

默认输出：

| 文件 | 内容 |
|---|---|
| `ablation_results.json` | 每次测试的原始结果；`--output` 只会覆盖这个路径 |
| `ablation_study_report.md` | 汇总表、影响分析和结论 |
| `ablation_study_results.svg` | 成功状态、执行时间、迭代数和工具调用数的可视化 |

这些相对路径以进程工作目录为基准；通过 `pnpm --filter ... start` 运行时通常位于该包目录。

普通消融中的 `success` 只表示 Agent 返回了非空文本答案，不验证答案中的数字是否正确。需要验证实验假设和规范答案时，应使用下一节的严格实验。

## 严格实验 1.1 与真实 API 证据

严格实验固定运行五组上下文模式和书中的规范财务任务，并检查：

- 是否恰好存在五组实验。
- 每组实际请求是否满足相应的上下文契约。
- 是否通过提供商直连，而非 OpenRouter 回退。
- 基线答案是否包含预期的年度总额和季度平均值。
- 重复工具调用、迭代上限和无工具调用等行为是否出现。

运行示例：

```bash
pnpm --filter @ai-agent-book/chapter1-context experiment \
  --provider kimi \
  --model kimi-k3 \
  --max-iterations 5
```

指定输出目录：

```bash
pnpm --filter @ai-agent-book/chapter1-context experiment \
  --provider kimi \
  --model kimi-k3 \
  --output-dir validation/my-run
```

严格实验支持的直连凭证：

| Provider | 凭证 |
|---|---|
| `kimi` / `moonshot` | `MOONSHOT_API_KEY` 或 `KIMI_API_KEY` |
| `doubao` | `ARK_API_KEY` |
| `siliconflow` | `SILICONFLOW_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |

每次运行会生成：

```text
validation/real_<timestamp>/
├── evidence.json
└── evidence.sha256
```

同时把最新证据复制到 `validation/latest.json`。证据文件记录命令、运行环境、依赖版本、Git 状态、五组请求/响应摘要、工具轨迹和 Judge 结果；不会记录 API Key 的值。

### 保留的 Python 真实 API 基线

迁移时保留了 2026-07-29 的 Kimi K3 直连证据：

```text
validation/python-baseline/
├── latest.json
└── real_20260729T153329Z/
    ├── evidence.json
    └── evidence.sha256
```

TypeScript Judge 对该证据的五组上下文契约全部接受。观测结果：

| 模式 | 迭代 | 工具动作 | 重复动作 | 规范答案正确 |
|---|---:|---:|---|---|
| `full` | 3 | 4 | 否 | 是 |
| `no_history` | 5 | 15 | 是 | 否 |
| `no_reasoning` | 3 | 4 | 否 | 是 |
| `no_tool_calls` | 1 | 0 | 否 | 否 |
| `no_tool_results` | 5 | 7 | 是 | 否 |

该次证据的 `experiment_execution_accepted` 为 `true`，但 `all_manuscript_behavior_claims_observed` 为 `false`：`no_reasoning` 组仍得到正确答案。因此，这份记录支持实验执行与请求契约，却不支持“删除显式推理必然导致性能下降”这一绝对表述。

迁移验证没有使用用户凭证重新调用远程模型。若要发布 TypeScript 版本的新实证结论，应使用直连 Key 重新运行严格实验。

## 编程接口

包入口导出 Agent、工具、上下文类型、提供商解析、消融和严格实验相关 API。

### 创建 Agent

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

`ContextAwareAgentOptions` 支持：

| 字段 | 作用 |
|---|---|
| `apiKey` | 显式 API Key |
| `provider` | 提供商；编程接口未传入时默认为 `siliconflow` |
| `model` | 模型 ID |
| `contextMode` | 上下文模式，默认 `full` |
| `verbose` | 是否打印每轮请求与响应，默认 `true` |
| `client` | 注入自定义 `ChatClient`，适合测试或接入其他 SDK |
| `tools` | 注入自定义 `ToolRegistry` |

注意：CLI 默认提供商是 `doubao`，而直接创建 `ContextAwareAgent` 的默认提供商是 `siliconflow`。为避免环境差异，建议始终显式传入 `provider`。

### 直接调用工具

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

### 运行消融研究

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

### 主要导出

| API | 用途 |
|---|---|
| `ContextAwareAgent` | 执行带工具调用的多轮任务 |
| `ContextMode` | 五种上下文模式常量 |
| `ToolRegistry` | 内置工具实现 |
| `Config` | 环境配置辅助方法 |
| `PROVIDERS` / `SUPPORTED_PROVIDERS` | 提供商元数据 |
| `resolveBackend()` | 解析直连或 OpenRouter 后端 |
| `getSampleTasks()` / `getAblationCases()` | 获取内置任务 |
| `AblationTestSuite` / `runAblationStudy()` | 普通消融研究 |
| `runSingleTask()` | 单任务封装 |
| `evaluateContextContract()` | 校验单组 API 请求形状 |
| `analyzeExperiment()` / `runExperiment()` | 严格实验 1.1 |
| `createSamplePdfs()` | 生成本地示例 PDF |

## 测试与验证

从 monorepo 根目录执行：

```bash
pnpm typecheck
pnpm build
pnpm test
```

只验证当前包：

```bash
pnpm --filter @ai-agent-book/chapter1-context typecheck
pnpm --filter @ai-agent-book/chapter1-context build
pnpm --filter @ai-agent-book/chapter1-context test
```

当前迁移基线为 5 个测试文件、31 个测试：

| 测试文件 | 覆盖范围 |
|---|---|
| `tests/agent.test.ts` | Agent 循环、消息历史、错误处理和轨迹 |
| `tests/context-contract.test.ts` | 五种模式的请求形状与负向样例 |
| `tests/providers.test.ts` | 提供商、别名、模型映射和 OpenRouter 回退 |
| `tests/python-baseline.test.ts` | 保留的 Python 真实 API 证据回放 |
| `tests/tools.test.ts` | PDF、汇率、计算器和 JavaScript 解释器 |

本地测试不需要远程 API Key。CLI 的真实模型请求和严格实验需要相应凭证或本地 Ollama。

## 项目结构

```text
packages/chapter1/context/
├── env.example
├── fixtures/
│   └── pdfs/
│       ├── sample_financial_report_q1_2024.pdf
│       └── simple_expense_report.pdf
├── src/
│   ├── ablation.ts       # 普通消融套件、样例任务与报告
│   ├── agent.ts          # ContextAwareAgent 与上下文模式实现
│   ├── cli.ts            # interactive / single / ablation CLI
│   ├── config.ts         # 环境配置
│   ├── experiment.ts     # 严格实验 1.1 与证据生成
│   ├── index.ts          # 包导出
│   ├── openai-client.ts  # OpenAI SDK 适配
│   ├── providers.ts      # 提供商与 OpenRouter 路由
│   ├── sample-pdf.ts     # 示例 PDF 生成
│   ├── tools.ts          # 四种工具
│   └── types.ts          # 公共类型
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

迁移过程、规则、Judge 设计和验证清单位于仓库根目录的 [`docs/migration`](../../../docs/migration/status.md)。

## 结果解读

### `success` 不等于答案正确

普通 Agent 结果中的 `success` 定义为“返回了非空最终答案”。模型可能给出格式完整但数字错误的答案，因此：

- 调试 Agent 流程时可使用 `success`、迭代数和轨迹。
- 比较工具行为时应检查 `trajectory.tool_calls`。
- 验证实验结论时应使用严格实验的 `canonical_answer_correct` 和上下文契约。

### 单次结果不等于稳定规律

模型行为受到提供商、模型版本、采样和服务端实现影响。一次 `no_reasoning` 成功或失败都不能证明普遍规律。研究用途至少应：

- 固定任务、模型、迭代上限和直接提供商。
- 记录请求形状，而不只记录最终文本。
- 多次运行并报告方差或成功率。
- 区分“实验执行有效”与“预期行为全部出现”。

### 建议重点观察

- `no_history` 是否重复请求同一工具。
- `no_tool_results` 是否在已经执行工具后仍反复调用。
- `no_tool_calls` 是否拒绝编造依赖外部数据的数值。
- `no_reasoning` 是否改变迭代数、工具调用数或答案准确度。
- 不同模式的 token usage、执行时间和错误类型。

## 限制与常见问题

### 已知限制

- 汇率来自 `tools.ts` 内的固定表，只适合可重复演示，不能用于交易、报价或财务决策。
- PDF 工具按页拼接文本，不恢复复杂表格、阅读顺序、图片或扫描件 OCR。
- JavaScript 解释器限制了动态代码生成并设置超时，但 Node.js `vm` 不应被视为执行恶意代码的安全边界。
- 提供商接口、模型 ID 和自定义推理字段属于外部依赖，可能随服务升级而变化。
- `buildContext()` 保留为可调用的上下文摘要辅助方法；当前 Agent 请求主要由 `conversationHistory` 和各模式的消息变换控制。
- 普通消融输出路径是进程工作目录下的相对路径。
- 本仓库保留了 Python 真实证据，但尚未生成新的 TypeScript 真实 API 基线。

### 常见问题

#### 启动时提示没有 API Key

CLI 默认为 `doubao`，需要 `ARK_API_KEY`、显式 `--api-key`，或 `OPENROUTER_API_KEY` 回退。没有远程凭证时可使用：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider ollama
```

#### 已设置 `LLM_PROVIDER`，CLI 仍使用 doubao

CLI 默认值由 `--provider` 参数定义，不读取 `Config.llmProvider` 作为 CLI 默认值。请显式传入：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --provider kimi
```

#### `--ablation-modes full no_history` 报错

该参数是可重复的单值参数，正确写法是：

```bash
--ablation-modes full --ablation-modes no_history
```

#### 代码解释器出现语法错误

它执行 JavaScript，不执行 Python。使用 `const`、`let`、数组方法和 `console.log()`。

#### 第二个独立任务受到了第一个任务影响

同一个 Agent 会保留历史。调用 `agent.reset()`，或为独立任务创建新实例。

#### `success: true` 但答案明显不对

`success` 只判断是否存在最终文本。请检查工具轨迹和答案内容；规范实验应查看严格 Judge 的正确性字段。

#### 严格实验拒绝 OpenRouter 回退

这是证据设计的一部分。严格实验需要直连凭证，以避免把代理路由误记为指定提供商的直连结果。

## Python 到 TypeScript 的迁移说明

本包从 `chapter1/context` 的 Python 示例迁移而来，尽量保持任务、上下文模式、工具契约、CLI 使用方式和实验证据结构，同时采用 TypeScript/Node.js 对应实现。

主要适配：

- Python Agent 与数据结构改为严格类型的 TypeScript。
- OpenAI-compatible SDK 边界封装在 `OpenAIChatClient`。
- Python `code_interpreter` 改为隔离的 JavaScript 解释器。
- PyMuPDF 解析改为 `pdfjs-dist`。
- ReportLab PDF 生成改为 `pdfkit`。
- Matplotlib PNG 图表改为无需额外运行时的 SVG。
- 多个手工提供商测试脚本合并为统一 CLI 和 Vitest 测试。
- 原仓库级 `agentbook.providers` 隐式依赖内聚到 `providers.ts`。
- 原 Python 真实 API 证据按原样保留，并由 TypeScript Judge 回放。

迁移验收状态：

- Node.js 版本策略：`>=24`。
- pnpm workspace、lockfile 和 TypeScript 构建已就绪。
- `typecheck`、`build` 和 31 个本地测试通过。
- 保留证据的 5/5 上下文契约通过。
- 新 TypeScript 真实 API 证据仍是显式后续项。
