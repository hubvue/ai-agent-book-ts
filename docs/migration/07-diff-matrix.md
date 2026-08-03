# Diff Matrix

| Dimension | Python | TypeScript | Handling |
|---|---|---|---|
| Runtime | Python 3 | Node 24+ | direct language migration |
| Package management | `requirements.txt` / root Python project | pnpm workspace + lockfile | target-native |
| Provider registry | hidden `agentbook.providers` dependency | package-local typed registry | dependency internalized |
| OpenAI calls | synchronous Python SDK | asynchronous JS SDK behind `ChatClient` | boundary adapter |
| PDF parsing | PyPDF2 | pdfjs-dist | public result shape preserved |
| Calculator | restricted Python `eval` | allow-listed Node VM expression | behavior preserved for supported expressions |
| Code interpreter | Python | isolated JavaScript | accepted language-specific difference |
| Visualization | Matplotlib PNG | generated SVG | accepted output-format difference |
| Manual scripts | many one-off files | consolidated CLI commands | capability preserved |
| Tests | unittest/pytest | Vitest | assertions ported and expanded |
| Evidence | raw request/response JSON + SHA | same evidence contract + SHA | direct preservation |

## Chapter 1 Web Search Agent

| Dimension | Python source | TypeScript target | Handling |
|---|---|---|---|
| Runtime | synchronous Python 3 | asynchronous Node 24 ESM | language adapter; preserve observable ordering |
| Chat SDK | OpenAI Python SDK | OpenAI JavaScript SDK behind `ChatClient` | injectable boundary for offline tests |
| Formula HTTP | `requests.get/post` | Node `fetch` behind an injectable function | preserve exact URLs, bodies, and evidence fields |
| Tool protocol | provider declaration + raw Fiber arguments | same protocol and raw arguments | direct preservation (R-007/R-008) |
| Provider fallback | shared Python provider registry | package-local Kimi/OpenRouter resolver | remove hidden cross-package dependency |
| CLI | `argparse`, sync stdin | `node:util.parseArgs`, async readline | target-native adapter |
| Tests | pytest + mocks | Vitest + injected fakes | port public behavior; no network/credentials |
| Historical evidence | four real Python attempts plus `latest.json` | canonical successful baseline under `validation/python-baseline` | preserve one checksummed baseline |
