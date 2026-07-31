# Migration Context

## Background

- Old repository: `ai-agent-book/chapter1/context`
- New repository: `ai-agent-book-ts/packages/chapter1/context`
- Reason: provide a Node 24+ TypeScript implementation in a pnpm monorepo

## Migration Posture

- Selected posture: structure-preserving
- Reason: preserve Experiment 1.1 behavior and evidence contracts while changing language/runtime
- Default work unit: dependency-ordered module boundary

## Scope

- Included: provider resolution, tools, context modes, ReAct loop, CLI, ablation suite, strict experiment runner, fixtures, tests and historical evidence
- Not included: unrelated chapters, provider redesign, new model behavior claims, live credentials

## Constraints and Success Criteria

- Node.js `>=24`; pnpm workspace
- No Python runtime dependency in the target package
- All five context modes remain observable in exact provider request evidence
- Local build, typecheck and tests pass
- Python real-API baseline remains independently replayable by the target Judge

## Decision

- Proceed: completed
- Evidence: `16-verification-checklist.md`
