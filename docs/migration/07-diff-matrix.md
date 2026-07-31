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
