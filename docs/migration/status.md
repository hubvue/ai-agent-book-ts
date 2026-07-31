# Context Migration Status

## Current Status

- Current phase: verify / cleanup
- Phase goal: prove the TypeScript package preserves the observable context-ablation behavior
- Migration posture: structure-preserving, with language-specific adapters
- Inputs: Python `chapter1/context`, shared `agentbook.providers`, Python tests, real API evidence from 2026-07-29
- Key assumptions: API credentials are not required for local acceptance; a new TypeScript real-API evidence run is an explicit follow-up
- Confirmed facts: Node 24 monorepo builds; 31 local tests pass; the TypeScript Judge accepts all five preserved Python evidence arms; root and package usage documentation are reconciled with the TypeScript implementation
- Unknowns to verify: provider-specific live API compatibility after future SDK/provider changes

## Loop State

- Judge state: passing for portable behavior and preserved real evidence; limited for a fresh target real-API run
- Rulebook revision: 1.1
- Queue summary: 6 done
- Current operation / result ID: `verify-2026-07-31-local-01`
- Parity summary: 31/31 local checks passed; 5/5 Python real-API arms accepted
- Systemic issues / affected rules: none

## Phase Results

| Phase | Output | Status |
|---|---|---|
| intake | `00-context.md` | complete |
| audit / map | `01-project-overview.md`, `05-system-map.md` | complete |
| diff / plan | `07-diff-matrix.md`, `07-rulebook.md`, `08-judge-plan.md` | complete |
| pilot / execute | `09-module-batches.md`, `14-execution-log.md` | complete |
| verify | `16-verification-checklist.md` | complete with one explicit live-API follow-up |
| cleanup | `17-cleanup-plan.md` | complete |
| documentation | root `README.md`, package `README.md` | complete |

## Risks

- A fresh TypeScript real-API run was not performed because no provider credential was supplied for migration verification.
- `code_interpreter` intentionally executes JavaScript rather than Python.
- Provider model ids and custom request fields can change outside this repository.

## Exit Criteria

- [x] Node version policy is `>=24`
- [x] pnpm workspace and lockfile exist
- [x] Context Agent, tools, provider resolution, CLI and experiment runner are implemented in TypeScript
- [x] Portable characterization tests pass
- [x] Preserved Python real-API evidence passes the migrated Judge
- [x] Independent review findings are resolved
- [x] Root navigation and package-level usage documentation cover the migrated surface

## Next Step

- Recommended next phase: run `pnpm --filter @ai-agent-book/chapter1-context experiment -- --provider <provider> --model <model>` with a direct provider credential when fresh TypeScript real-API evidence is desired.
