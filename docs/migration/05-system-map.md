# System and Dependency Map

| Unit | Responsibility | Depends On | Target |
|---|---|---|---|
| U-001 | Monorepo runtime/build policy | Node 24, pnpm | root workspace files |
| U-002 | Provider registry and fallback | environment | `providers.ts`, `config.ts` |
| U-003 | PDF, currency, math, code tools | Node boundaries, pdfjs | `tools.ts`, `sample-pdf.ts` |
| U-004 | ReAct loop and context modes | U-002, U-003, OpenAI boundary | `agent.ts`, `openai-client.ts` |
| U-005 | Ablation and strict evidence | U-004 | `ablation.ts`, `experiment.ts`, `cli.ts` |
| U-006 | Judge and documentation | U-001..U-005 | tests, validation, migration docs |

## Runtime Flow

`CLI -> provider resolution -> ContextAwareAgent -> ChatClient -> provider`

`ContextAwareAgent -> ToolRegistry -> PDF / currency / calculator / JavaScript interpreter`

`Experiment runner -> AgentTrajectory.api_turns -> context contract Judge -> evidence.json + SHA-256`

## Cycles and Packaging Constraints

- No source import cycles were found in the target graph.
- SDK response types are converted to local plain-data contracts at `OpenAIChatClient`.
- Historical Python evidence is immutable input under `validation/python-baseline`.
