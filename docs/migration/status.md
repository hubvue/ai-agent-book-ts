# Chapter 1 Migration Status

## Current Status

- Current phase: verify / cleanup
- Phase goal: prove the TypeScript Context and Web Search Agent packages preserve their observable experiment behavior
- Migration posture: structure-preserving, with language-specific adapters
- Inputs: Python `chapter1/context`, Python `chapter1/web-search-agent`, shared provider rules, source tests and preserved real API evidence
- Key assumptions: local acceptance does not require credentials; fresh target real-API evidence is an explicit follow-up
- Confirmed facts: Node 24 pnpm workspace builds; 68 local tests pass; both preserved Python evidence sets pass the target Judges; bilingual package/root docs cover the migrated surfaces
- Unknowns to verify: provider-specific live compatibility after future SDK, Formula, or model changes

## Loop State

- Judge state: passing for portable behavior and preserved real evidence; limited only for fresh target live runs
- Rulebook revision: 1.2
- Queue summary: 13 done
- Current operation / result ID: `web-search-verify-2026-07-31-local-01`
- Parity summary: 68/68 workspace checks passed; Context 5/5 evidence arms and Web Search Experiment 1-2 baseline accepted
- Systemic issues / affected rules: none

## Phase Results

| Boundary | Output | Status |
|---|---|---|
| Chapter 1 Context | `packages/chapter1/context` | complete |
| Chapter 1 Web Search Agent | `packages/chapter1/web-search-agent` | complete |
| intake / audit / map | context, overview and system-map artifacts | complete |
| diff / plan | diff matrix, Rulebook 1.2, Judge and durable queue | complete |
| execute | U-001..U-013 outputs and execution log | complete |
| verify | local tests, typecheck/build, CLI smoke and preserved evidence replay | complete with live-API follow-ups |
| cleanup / documentation | cleanup plan and bilingual root/package guides | complete |

## Risks

- Fresh TypeScript real-API runs were not performed because no direct provider credential was supplied.
- Kimi Formula availability, provider model ids and custom fields can change outside this repository.
- Source web-search pytest could not run in the current Python environment because `pytest` is not installed; source tests were ported and successful real evidence was replayed.
- The development `tsx` CLI cannot open its IPC socket inside the current sandbox; the compiled Node CLI passed help and offline end-to-end smoke checks.

## Exit Criteria

- [x] Node version policy is `>=24` and the pnpm lockfile includes both packages
- [x] Context Agent, Web Search Agent, CLIs and strict experiment runners are implemented in TypeScript
- [x] Formula declaration/Fiber protocol, raw arguments and credential-free evidence are preserved
- [x] Portable characterization tests pass with no network or credentials
- [x] Preserved Python real-API evidence passes the migrated Judges
- [x] Independent review findings are resolved
- [x] Root navigation and package-level usage documentation cover both migrated packages

## Next Step

- Recommended next phase: with a direct Moonshot credential, run `pnpm experiment:web-search` to generate fresh TypeScript Experiment 1-2 evidence. This is optional for the completed local migration and required before making new live-provider claims.
