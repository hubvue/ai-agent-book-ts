# System and Dependency Map

| Unit | Responsibility | Depends On | Target |
|---|---|---|---|
| U-001 | Monorepo runtime/build policy | Node 24, pnpm | root workspace files |
| U-002 | Provider registry and fallback | environment | `providers.ts`, `config.ts` |
| U-003 | PDF, currency, math, code tools | Node boundaries, pdfjs | `tools.ts`, `sample-pdf.ts` |
| U-004 | ReAct loop and context modes | U-002, U-003, OpenAI boundary | `agent.ts`, `openai-client.ts` |
| U-005 | Ablation and strict evidence | U-004 | `ablation.ts`, `experiment.ts`, `cli.ts` |
| U-006 | Judge and documentation | U-001..U-005 | tests, validation, migration docs |
| U-007 | Web-search package/config | U-001 | package files, `config.ts` |
| U-008 | Chat and Formula boundaries | U-007 | `openai-client.ts`, Formula fetch/Fiber methods |
| U-009 | Web-search ReAct loop | U-008 | `agent.ts`, offline demonstration |
| U-010 | CLI and advanced helpers | U-009 | `cli.ts`, `examples.ts` |
| U-011 | Strict Experiment 1-2 Judge | U-009 | `experiment.ts`, positive/negative-control tests |
| U-012 | Evidence and documentation | U-010, U-011 | Python baseline, package/root README |
| U-013 | Independent review and verification | U-007..U-012 | regression fixes, full workspace checks |

## Runtime Flow

`CLI -> provider resolution -> ContextAwareAgent -> ChatClient -> provider`

`ContextAwareAgent -> ToolRegistry -> PDF / currency / calculator / JavaScript interpreter`

`Experiment runner -> AgentTrajectory.api_turns -> context contract Judge -> evidence.json + SHA-256`

`Web-search CLI -> WebSearchAgent -> ChatClient -> Kimi Chat Completions`

`WebSearchAgent -> Formula declaration -> model tool call -> Formula Fiber -> tool message -> model`

`Experiment 1-2 -> trace + api_turns -> strict acceptance Judge -> evidence.json + SHA-256`

## Cycles and Packaging Constraints

- No source import cycles were found in the target graph.
- SDK response types are converted to local plain-data contracts at `OpenAIChatClient`.
- Historical Python evidence is immutable input under `validation/python-baseline`.
- The web-search package is self-contained and does not depend on the Context package.
