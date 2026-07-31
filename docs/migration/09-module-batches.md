# Module Batches

| Unit ID | Scope | Depends On | Required Judge Evidence | Status | Completion Evidence |
|---|---|---|---|---|---|
| U-001 | pnpm monorepo + Node 24 | — | engine/version and install | done | `.nvmrc`, workspace, lockfile |
| U-002 | provider/config registry | U-001 | provider tests | done | 5 provider tests |
| U-003 | tool layer + PDF fixtures | U-001 | tool and PDF smoke tests | done | 6 tool tests, generated PDFs |
| U-004 | agent/context loop | U-002, U-003 | agent regression tests | done | 14 agent/context-mode cases |
| U-005 | ablation/experiment/CLI | U-004 | contract tests + CLI smoke | done | 6 contract tests, CLI help |
| U-006 | evidence/docs/final review | U-001..U-005 | Python evidence replay + full suite | done | 31/31 tests |

## Queue Rules

- Readiness: every dependency unit must be `done`.
- Done: output exists, independent review is resolved, and required Judge evidence passes.
- Reconstruction source: this file, not chat history.
- Shared operation/result ID: `verify-2026-07-31-local-01`.
