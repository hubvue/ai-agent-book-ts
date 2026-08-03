# Verification Checklist

## Judge Health

- Judge state: passing for portable/local scope
- Old-system baseline: Python real API evidence accepted
- Repeatability result: full local suite passed on repeated runs
- Safe negative-control result: invalid full-context fixture rejected
- Comparator limitations: no byte equality for interpreter language or chart format

## Parity Summary

- Local checks: 31 passed, 0 failed
- Preserved real-API arms: 5 passed, 0 failed
- Regressions: 0 known
- Inherited local failures: Python dependency imports unavailable in the current source environment
- Accepted differences: JavaScript interpreter, SVG visualization, consolidated manual scripts
- Unresolved gap: fresh TypeScript real-API run

- [x] CLI entry is reachable
- [x] Tool contracts behave correctly
- [x] Context modes and history guards behave correctly
- [x] Provider resolution and OpenRouter fallback behave correctly
- [x] Error capture and malformed tool JSON recovery behave correctly
- [x] Build and typecheck pass
- [x] pnpm lockfile exists
- [x] Old and target Judges evaluate the preserved evidence compatibly
- [x] Accepted differences have rationale in `07-rulebook.md`
- [x] Root README links to complete package documentation
- [x] Package README covers modes, tools, providers, CLI, API, outputs, evidence and limitations
- [ ] Fresh TypeScript live provider run completed

## Recommendation

The package is ready for local use and further chapter migration. Run the strict experiment with a direct provider credential before publishing new TypeScript-specific empirical claims.

## Chapter 1 Web Search Agent

### Judge Health

- Judge state: passing for portable behavior and preserved real evidence
- Old baseline: successful Python Experiment 1-2 evidence from `2026-07-29T16:36:23Z`
- Repeatability: focused package and full workspace checks pass
- Safe negative control: two successful Fibers placed in one search iteration are rejected
- Comparator limitation: source pytest was unavailable in the current Python environment; portable assertions were migrated from source test code

### Parity Summary

- Package checks: 37 passed, 0 failed
- Full workspace checks: 68 passed, 0 failed
- Preserved real evidence: accepted by the TypeScript Judge; SHA-256 matches
- Known regressions: 0
- Accepted difference: guided quickstart/example menu consolidated into CLI and exported helpers
- Unresolved gap: fresh TypeScript live Formula run requires a direct Moonshot credential

- [x] Formula declaration is fetched once per independent question
- [x] Formula Fiber receives the raw model argument string
- [x] Authorization headers and credential values are absent from evidence
- [x] ReAct trace, multiple tool calls, malformed JSON and terminal responses behave correctly
- [x] OpenRouter fallback omits Formula tools and network calls
- [x] CLI help and compiled offline end-to-end output are reachable
- [x] Typecheck, package build and full workspace build pass
- [x] Independent review findings are fixed and covered by regression tests
- [ ] Fresh TypeScript live Moonshot evidence generated

### Recommendation

The web-search package is ready for local/offline use and for a credentialed live run. Do not claim new provider results until `pnpm experiment:web-search` succeeds with a direct Moonshot key.
