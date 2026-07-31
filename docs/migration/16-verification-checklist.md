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
