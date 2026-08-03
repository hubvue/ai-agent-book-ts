# Migration Context

## Background

- Old repository boundaries: `ai-agent-book/chapter1/context`, `ai-agent-book/chapter1/web-search-agent`
- New repository boundaries: `ai-agent-book-ts/packages/chapter1/context`, `ai-agent-book-ts/packages/chapter1/web-search-agent`
- Reason: provide a Node 24+ TypeScript implementation in a pnpm monorepo

## Migration Posture

- Selected posture: structure-preserving
- Reason: preserve Experiment 1.1 and 1.2 behavior/evidence contracts while changing language/runtime
- Default work unit: dependency-ordered module boundary

## Scope

- Included: provider resolution, tools, context modes, ReAct loops, CLI, ablation/search experiments, fixtures, tests and historical evidence
- Not included: unrelated chapters, provider redesign, new model behavior claims, live credentials

## Constraints and Success Criteria

- Node.js `>=24`; pnpm workspace
- No Python runtime dependency in the target package
- All five context modes remain observable in exact provider request evidence
- Local build, typecheck and tests pass
- Python real-API baseline remains independently replayable by the target Judge
- Moonshot Formula declaration/Fiber protocol and raw tool arguments remain observable in target evidence

## Decision

- Proceed: completed
- Evidence: `16-verification-checklist.md`
