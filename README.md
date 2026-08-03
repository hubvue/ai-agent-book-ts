# AI Agent-TypeScript

[English](README.en.md) | 简体中文

[《AI Agent》](https://github.com/bojieli/ai-agent-book)配套示例的 TypeScript monorepo。项目使用 pnpm workspace 管理各章节包，要求 Node.js 24 或更高版本。

## 当前迁移内容

| 章节 | 包 | 状态 | 文档 |
|---|---|---|---|
| Chapter 1 — Context | `@ai-agent-book/chapter1-context` | 已迁移并通过本地验证 | [完整使用手册](packages/chapter1/context/README.md) |
| Chapter 1 — Web Search Agent | `@ai-agent-book/chapter1-web-search-agent` | 已迁移并通过本地验证 | [完整使用手册](packages/chapter1/web-search-agent/README.md) |

Chapter 1 Context 包包含：

- 上下文感知 ReAct Agent。
- `full`、`no_history`、`no_reasoning`、`no_tool_calls`、`no_tool_results` 五组实验模式。
- PDF 解析、固定汇率换算、计算器和 JavaScript 解释器。
- 交互式、单任务和消融实验 CLI。
- 严格实验 1.1、上下文请求契约校验和证据生成。
- 5 个测试文件、31 个本地测试。
- 从 Python 版本保留的真实 API 基线证据。

功能、配置、CLI 参数、编程接口、实验输出和已知限制请阅读 [Chapter 1 Context README](packages/chapter1/context/README.md)。

Chapter 1 Web Search Agent 包保留 Kimi K3 + Moonshot Formula 的多轮 ReAct 搜索协议、离线轨迹演示、高级批量/上下文/比较/事实核查接口，以及实验 1-2 的严格证据 Judge。详情见 [Web Search Agent README](packages/chapter1/web-search-agent/README.md)。

## 环境要求

- Node.js `>=24`；`.nvmrc` 当前为 `24.15.0`。
- pnpm `9.12.0`。

```bash
nvm use
pnpm install
```

## 常用命令

在仓库根目录执行：

```bash
# 全仓类型检查、构建和测试
pnpm typecheck
pnpm build
pnpm test

# 启动 Chapter 1 Context 交互式 CLI
pnpm start:context

# 启动 Chapter 1 Web Search Agent
pnpm start:web-search

# 查看 Context CLI 帮助
pnpm --filter @ai-agent-book/chapter1-context start --help
```

单任务示例：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode single \
  --provider doubao \
  --task 'Convert $1000 USD to EUR, GBP, and JPY.'
```

运行五组消融实验：

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi
```

远程模型需要相应的 API Key；没有远程凭证时可以连接本地 Ollama。配置方式见包内的 [`env.example`](packages/chapter1/context/env.example) 和[提供商说明](packages/chapter1/context/README.md#支持的模型提供商)。

## Monorepo 结构

```text
ai-agent-book-ts/
├── docs/
│   └── migration/              # 迁移规则、执行日志与验证记录
├── packages/
│   └── chapter1/
│       ├── context/            # Chapter 1 Context TypeScript 包
│       └── web-search-agent/   # Chapter 1 Kimi Web Search Agent
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 迁移与验证

迁移遵循结构保留、语言适配和证据驱动的原则。完整材料：

- [当前迁移状态](docs/migration/status.md)
- [系统映射](docs/migration/05-system-map.md)
- [差异矩阵](docs/migration/07-diff-matrix.md)
- [迁移规则](docs/migration/07-rulebook.md)
- [执行日志](docs/migration/14-execution-log.md)
- [验证清单](docs/migration/16-verification-checklist.md)

本地验收不需要 API Key。若要生成新的 TypeScript 真实 API 证据，需要使用直连提供商凭证运行严格实验。
