# Kimi Web Search Agent (TypeScript)

English | [简体中文](README.md)

This package is the TypeScript migration of Chapter 1, Experiment 1-2. It preserves the Python implementation's autonomous ReAct loop and uses Moonshot's official `moonshot/web-search:latest` Formula for multi-round live search.

## Protocol

For each independent question, the agent:

1. fetches Moonshot's authoritative `web_search` declaration;
2. sends it unchanged to Kimi Chat Completions;
3. forwards every model-produced tool name and raw argument string to a Formula Fiber;
4. returns a successful Fiber's output to the model as the matching tool message; and
5. repeats think → act → observe until it has a final answer or reaches the limit.

OpenRouter is a model-only fallback. It does not expose Moonshot Formula tools, so fallback answers are not live-search results and cannot pass strict Experiment 1-2 acceptance.

## Quick Start

```bash
nvm use
pnpm install
cp packages/chapter1/web-search-agent/env.example \
  packages/chapter1/web-search-agent/.env

# Live Kimi search (requires MOONSHOT_API_KEY)
pnpm start:web-search

# Credential-free deterministic trace demo
pnpm --filter @ai-agent-book/chapter1-web-search-agent start -- \
  --provider offline-demo --quiet --output result.json
```

Useful options are `--model`, `--max-steps`, `--base-url`, `--api-key`, `--output`/`-o`, and `--quiet`. Pass a positional question for one-shot mode; omit it for interactive mode.

## Programmatic API

```ts
import {
  AdvancedWebSearchAgent,
  WebSearchAgent,
} from "@ai-agent-book/chapter1-web-search-agent";

const agent = new WebSearchAgent({ verbose: true });
const answer = await agent.searchAndAnswer("What changed in AI today?");
console.log(answer, agent.getTrace());

const advanced = new AdvancedWebSearchAgent();
const results = await advanced.batchSearch(["Question one", "Question two"]);
```

The advanced class also exposes `searchWithContext()`, `comparativeSearch()`, and `factCheck()`.

## Experiment and Verification

Run strict Experiment 1-2 with a direct Moonshot credential:

```bash
pnpm --filter @ai-agent-book/chapter1-web-search-agent experiment
```

It writes checksummed evidence under `validation/real_<timestamp>/`. The successful Python baseline is preserved under `validation/python-baseline/`.

Local acceptance is credential-free:

```bash
pnpm --filter @ai-agent-book/chapter1-web-search-agent typecheck
pnpm --filter @ai-agent-book/chapter1-web-search-agent test
pnpm --filter @ai-agent-book/chapter1-web-search-agent build
```

Live behavior remains subject to Moonshot Formula service availability, account quota, and provider protocol changes.
