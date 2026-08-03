# Kimi Web Search Agent（TypeScript）

[English](README.en.md) | 简体中文

《AI Agent》第一章实验 1-2 的 TypeScript 迁移。它保留 Python 版本的自主 ReAct 循环，并使用 Moonshot 官方 `moonshot/web-search:latest` Formula 完成多轮联网搜索与答案综合。

## 核心流程

每个独立问题执行以下协议：

1. `GET /v1/formulas/moonshot/web-search:latest/tools` 获取服务端权威 `web_search` 声明。
2. 将声明原样发送给 Kimi Chat Completions。
3. 将模型返回的工具名称与原始 JSON 参数传给 `POST /v1/formulas/moonshot/web-search:latest/fibers`。
4. 把成功 Fiber 的 `context.output` 或 `context.encrypted_output` 作为工具消息送回模型。
5. 重复“想 → 做 → 看”，直到模型给出最终答案或达到迭代上限。

OpenRouter 只作为无 Moonshot 凭证时的模型接口兜底；它不提供 Moonshot Formula，因此该模式不会进行实时搜索，也不能满足实验 1-2 的严格验收。

## 快速开始

在仓库根目录运行：

```bash
nvm use
pnpm install
cp packages/chapter1/web-search-agent/env.example \
  packages/chapter1/web-search-agent/.env
```

配置 `MOONSHOT_API_KEY` 后启动在线 Agent：

```bash
pnpm start:web-search
pnpm --filter @ai-agent-book/chapter1-web-search-agent start -- \
  "请搜索 Moonshot AI Context Caching 技术"
```

无需凭证的确定性离线演示：

```bash
pnpm --filter @ai-agent-book/chapter1-web-search-agent start -- \
  --provider offline-demo --quiet --output result.json
```

CLI 参数：

| 参数 | 说明 | 默认值 |
|---|---|---|
| 位置参数 `question` | 问题；省略进入交互模式 | 无 |
| `--provider` | `kimi` 或 `offline-demo` | `kimi` |
| `--model` | 模型名称 | `kimi-k3` |
| `--max-steps` | 最大 ReAct 轮数 | `5` |
| `--base-url` | Moonshot API 地址 | `https://api.moonshot.cn/v1` |
| `--api-key` | 显式 API Key | 环境变量 |
| `--output`, `-o` | 保存问题、轨迹、答案和在线证据 | 无 |
| `--quiet` | 不实时打印轨迹 | `false` |

## 编程接口

```ts
import {
  AdvancedWebSearchAgent,
  WebSearchAgent,
} from "@ai-agent-book/chapter1-web-search-agent";

const agent = new WebSearchAgent({ verbose: true });
const answer = await agent.searchAndAnswer("今天有哪些重要 AI 新闻？");
console.log(answer);
console.log(agent.getTrace());

const advanced = new AdvancedWebSearchAgent();
const results = await advanced.batchSearch(["问题一", "问题二"]);
```

`AdvancedWebSearchAgent` 还提供 `searchWithContext()`、`comparativeSearch()` 和 `factCheck()`。

## 实验 1-2

严格实验要求 Moonshot 直连凭证，并验证至少两轮不同的成功 Formula Fiber、推理轨迹、权威来源链接和指定事实：

```bash
pnpm --filter @ai-agent-book/chapter1-web-search-agent experiment
```

输出保存在 `validation/real_<timestamp>/`，包含 `evidence.json` 与 SHA-256。Python 版本的成功基线保存在 `validation/python-baseline/`。

## 验证

```bash
pnpm --filter @ai-agent-book/chapter1-web-search-agent typecheck
pnpm --filter @ai-agent-book/chapter1-web-search-agent test
pnpm --filter @ai-agent-book/chapter1-web-search-agent build
```

本地测试不访问网络，也不需要 API Key。实时搜索的可用性仍取决于 Moonshot Formula 服务、账户额度与提供商协议。
