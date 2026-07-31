# Project Overview

## Old Boundary

- Python modules: `agent.py`, `config.py`, `main.py`, `run_experiment_1_1.py`, PDF generator
- Hidden repository dependency: `agentbook.providers`
- Runtime dependencies: OpenAI SDK, Requests, PyPDF2, dotenv, reportlab, matplotlib, tabulate
- Tests: tool/context unit tests, malformed tool JSON regression tests, experiment contract tests, manual provider scripts
- Old local baseline: test imports fail before collection because the current Python environment lacks `requests`
- Executable behavior baseline: preserved `validation/latest.json` from 2026-07-29, accepted by the old Judge

## Target Boundary

- Runtime: Node.js 24+
- Package manager: pnpm 9 workspace
- Language/build: TypeScript 5, NodeNext ESM, strict type checking
- Tests: Vitest
- Entrypoints: `context-agent`, `context-experiment-1-1`
- Package path: `packages/chapter1/context`

## Run and Build

- Install: `pnpm install`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`
- CLI: `pnpm --filter @ai-agent-book/chapter1-context start -- --help`
