# Module Batches

| Unit ID | Scope | Depends On | Required Judge Evidence | Status | Completion Evidence |
|---|---|---|---|---|---|
| U-001 | pnpm monorepo + Node 24 | — | engine/version and install | done | `.nvmrc`, workspace, lockfile |
| U-002 | provider/config registry | U-001 | provider tests | done | 5 provider tests |
| U-003 | tool layer + PDF fixtures | U-001 | tool and PDF smoke tests | done | 6 tool tests, generated PDFs |
| U-004 | agent/context loop | U-002, U-003 | agent regression tests | done | 14 agent/context-mode cases |
| U-005 | ablation/experiment/CLI | U-004 | contract tests + CLI smoke | done | 6 contract tests, CLI help |
| U-006 | evidence/docs/final review | U-001..U-005 | Python evidence replay + full suite | done | 31/31 tests |
| U-007 | web-search package scaffold and configuration | U-001 | config/provider tests + typecheck | done | strict TS package and provider resolution checks pass |
| U-008 | OpenAI and Formula HTTP boundaries | U-007 | request-shape and receipt tests | done | declaration cache, raw Fiber body and credential-free evidence tests pass |
| U-009 | web-search ReAct loop and offline demo | U-008 | Agent trace/failure tests | done | trace, malformed JSON, limit, truncation and fallback tests pass |
| U-010 | advanced examples and CLI | U-009 | helper and offline CLI tests | done | advanced helpers pass; compiled offline CLI writes valid JSON |
| U-011 | experiment 1-2 Judge | U-009 | positive and negative-control tests | done | valid fixture accepted; same-round two-Fiber negative control rejected |
| U-012 | preserved evidence and package documentation | U-010, U-011 | checksum + documentation review | done | Python baseline accepted; SHA receipt and bilingual docs verified |
| U-013 | web-search independent review and full verification | U-007..U-012 | test/typecheck/build + restricted-context diff review | done | review findings fixed; 68/68 workspace tests pass |

## Queue Rules

- Readiness: every dependency unit must be `done`.
- Done: output exists, independent review is resolved, and required Judge evidence passes.
- Reconstruction source: this file, not chat history.
- Shared operation/result IDs: `verify-2026-07-31-local-01`, `web-search-verify-2026-07-31-local-01`.
