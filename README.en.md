# AI Agent-TypeScript

English | [简体中文](README.md)

A TypeScript monorepo containing companion examples for [*AI Agent*](https://github.com/bojieli/ai-agent-book). The repository uses pnpm workspaces to organize packages by chapter and requires Node.js 24 or later.

## Migrated Packages

| Chapter | Package | Status | Documentation |
|---|---|---|---|
| Chapter 1 — Context | `@ai-agent-book/chapter1-context` | Migrated and locally verified | [Complete usage guide](packages/chapter1/context/README.en.md) |
| Chapter 1 — Web Search Agent | `@ai-agent-book/chapter1-web-search-agent` | Migrated and locally verified | [Complete usage guide](packages/chapter1/web-search-agent/README.en.md) |

The Chapter 1 Context package includes:

- A context-aware ReAct agent.
- Five experiment modes: `full`, `no_history`, `no_reasoning`, `no_tool_calls`, and `no_tool_results`.
- PDF parsing, fixed-rate currency conversion, a calculator, and a JavaScript interpreter.
- Interactive, single-task, and ablation-study CLI modes.
- A strict Experiment 1.1 runner, request-contract validation, and evidence generation.
- 31 local tests across 5 test files.
- Preserved real-API baseline evidence from the Python implementation.

For capabilities, configuration, CLI options, programmatic APIs, experiment outputs, and known limitations, see the [Chapter 1 Context README](packages/chapter1/context/README.en.md).

The Chapter 1 Web Search Agent preserves the Kimi K3 + Moonshot Formula multi-round ReAct protocol, a credential-free offline trace, advanced batch/context/comparison/fact-check helpers, and the strict Experiment 1-2 evidence Judge. See its [usage guide](packages/chapter1/web-search-agent/README.en.md).

## Requirements

- Node.js `>=24`; the current `.nvmrc` selects `24.15.0`.
- pnpm `9.12.0`.

```bash
nvm use
pnpm install
```

## Common Commands

Run these commands from the repository root:

```bash
# Type-check, build, and test the entire repository
pnpm typecheck
pnpm build
pnpm test

# Start the Chapter 1 Context interactive CLI
pnpm start:context

# Start the Chapter 1 Web Search Agent
pnpm start:web-search

# Show Context CLI help
pnpm --filter @ai-agent-book/chapter1-context start --help
```

Run a single task:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode single \
  --provider doubao \
  --task 'Convert $1000 USD to EUR, GBP, and JPY.'
```

Run the five-arm ablation study:

```bash
pnpm --filter @ai-agent-book/chapter1-context start \
  --mode ablation \
  --provider kimi
```

Remote models require the corresponding API key. If no remote credentials are available, connect to a local Ollama instance instead. See [`env.example`](packages/chapter1/context/env.example) and the [provider guide](packages/chapter1/context/README.en.md#supported-model-providers).

## Monorepo Structure

```text
ai-agent-book-ts/
├── docs/
│   └── migration/              # Migration rules, logs, and verification records
├── packages/
│   └── chapter1/
│       ├── context/            # Chapter 1 Context TypeScript package
│       └── web-search-agent/   # Chapter 1 Kimi Web Search Agent
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Migration and Verification

The migration preserves observable structure and behavior while making language-specific adaptations and retaining evidence. Detailed records:

- [Current migration status](docs/migration/status.md)
- [System map](docs/migration/05-system-map.md)
- [Difference matrix](docs/migration/07-diff-matrix.md)
- [Migration rulebook](docs/migration/07-rulebook.md)
- [Execution log](docs/migration/14-execution-log.md)
- [Verification checklist](docs/migration/16-verification-checklist.md)

Local acceptance does not require an API key. Generating fresh TypeScript real-API evidence requires running the strict experiment with direct provider credentials.
