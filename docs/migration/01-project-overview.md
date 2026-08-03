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

## Web Search Agent Boundary

- Python source: `agent.py`, `config.py`, `main.py`, `examples.py`, `quickstart.py`, `run_experiment_1_2.py`, pytest suites and real evidence
- Target package: `packages/chapter1/web-search-agent`
- Runtime boundaries: OpenAI-compatible Chat Completions plus Moonshot Formula declaration/Fiber HTTP endpoints
- Entrypoints: `web-search-agent`, `web-search-experiment-1-2`
- Local Judge: 37 Vitest checks, strict typecheck, package build and compiled offline CLI smoke
- Old baseline limitation: the current source Python environment has no installed `pytest`; saved successful Experiment 1-2 evidence is replayed by the target Judge
- Consolidation: the guided quickstart and standalone example menu become the main CLI plus exported `AdvancedWebSearchAgent` helpers
