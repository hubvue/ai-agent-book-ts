# Migration Rulebook

- Migration posture: structure-preserving
- Current revision: 1.1

| Rule ID | Area | Decision | Verification |
|---|---|---|---|
| R-001 | Context modes | Preserve exact five string values and request semantics | context contract tests |
| R-002 | Evidence | Store credential-free request/response snapshots for every API turn | experiment tests and preserved baseline |
| R-003 | Providers | Port the shared registry and OpenRouter precedence into the package | provider tests |
| R-004 | Boundaries | Core agent depends on local `ChatClient`, not SDK response types | graph review and fake-client tests |
| R-005 | Tools | Preserve tool names and result field names; adapt interpreter language to JavaScript | tool tests |
| R-006 | Target structure | Use ESM, strict TypeScript, Node 24 and pnpm workspace | typecheck and workspace files |

## Accepted Gaps

| Gap ID | Scope | Handling | Verification |
|---|---|---|---|
| G-001 | `code_interpreter` language | JavaScript sandbox replaces Python exec | interpreter test |
| G-002 | visualization format | SVG replaces Matplotlib PNG | build/API inspection |
| G-003 | fresh target live API evidence | deferred until a direct credential is available | old evidence replay + explicit command |

## Revision History

| Revision | Date | Change | Reason |
|---|---|---|---|
| 1.0 | 2026-07-31 | Initial source-to-target rules | migration implementation |
| 1.1 | 2026-07-31 | Flatten JS SDK custom body fields at the boundary | independent review found Python-style `extra_body` must not be sent literally |
