# Migration Rulebook

- Migration posture: structure-preserving
- Current revision: 1.2

| Rule ID | Area | Decision | Verification |
|---|---|---|---|
| R-001 | Context modes | Preserve exact five string values and request semantics | context contract tests |
| R-002 | Evidence | Store credential-free request/response snapshots for every API turn | experiment tests and preserved baseline |
| R-003 | Providers | Port the shared registry and OpenRouter precedence into the package | provider tests |
| R-004 | Boundaries | Core agent depends on local `ChatClient`, not SDK response types | graph review and fake-client tests |
| R-005 | Tools | Preserve tool names and result field names; adapt interpreter language to JavaScript | tool tests |
| R-006 | Target structure | Use ESM, strict TypeScript, Node 24 and pnpm workspace | typecheck and workspace files |
| R-007 | Web-search protocol | Preserve Moonshot's Formula declaration and Fiber sequence; never replace it with a local search implementation | fake-fetch contract tests + preserved real evidence |
| R-008 | Raw tool arguments | Forward the model's serialized tool arguments unchanged to Formula Fibers, while parsing a detached copy for the readable trace | malformed-JSON and Fiber request tests |
| R-009 | Fallback semantics | Preserve OpenRouter as a model-only fallback and disable Formula tools whenever it is active | provider and request-shape tests |
| R-010 | Failure contract | Preserve the three Chinese failure fallbacks and the explicit truncation marker | Agent and advanced-example tests |
| R-011 | Evidence security | Persist request/response evidence without authorization headers or credential values | evidence schema review and experiment tests |
| R-012 | Package boundary | Keep the web-search package self-contained; do not couple it to the unrelated Context package | package manifest and import review |

## Accepted Gaps

| Gap ID | Scope | Handling | Verification |
|---|---|---|---|
| G-001 | `code_interpreter` language | JavaScript sandbox replaces Python exec | interpreter test |
| G-002 | visualization format | SVG replaces Matplotlib PNG | build/API inspection |
| G-003 | fresh target live API evidence | deferred until a direct credential is available | old evidence replay + explicit command |
| G-004 | source web-search test execution | source environment has no installed `pytest`; use test source plus preserved successful real evidence as the old baseline | record limitation; port all portable assertions to Vitest |
| G-005 | Python synchronous HTTP/SDK calls | use asynchronous `fetch` and OpenAI JS SDK behind injectable boundaries | strict typecheck and fake-client/fake-fetch tests |
| G-006 | guided quickstart and standalone example menu | consolidate into the primary CLI and exported advanced helper APIs; preserve capabilities rather than the duplicate menu shell | CLI tests, package exports and README examples |

## Revision History

| Revision | Date | Change | Reason |
|---|---|---|---|
| 1.0 | 2026-07-31 | Initial source-to-target rules | migration implementation |
| 1.1 | 2026-07-31 | Flatten JS SDK custom body fields at the boundary | independent review found Python-style `extra_body` must not be sent literally |
| 1.2 | 2026-07-31 | Add canonical Kimi Formula, fallback, failure, evidence, and package-boundary rules | start Chapter 1 web-search-agent migration |
