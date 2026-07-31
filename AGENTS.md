# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm monorepo for TypeScript versions of the *AI Agent* examples. Workspace packages live under `packages/<chapter>/<topic>`. The current implementation is `packages/chapter1/context`: production code is in `src/`, Vitest suites are in `tests/`, bundled PDFs are in `fixtures/pdfs/`, and preserved experiment evidence is in `validation/`. Migration decisions and verification records belong in `docs/migration/`. Treat `dist/`, coverage output, generated ablation files, and `.env` as local artifacts; do not commit them.

## Build, Test, and Development Commands

Use Node.js 24 (`nvm use`) and pnpm 9.12.0.

- `pnpm install` installs all workspace dependencies.
- `pnpm typecheck` runs strict TypeScript checks across packages.
- `pnpm build` emits package output to `dist/`.
- `pnpm test` runs all Vitest suites.
- `pnpm start:context` starts the interactive Chapter 1 agent.
- `pnpm --filter @ai-agent-book/chapter1-context test` limits a command to the context package.

Run type-checking, build, and tests before requesting review.

## Coding Style & Naming Conventions

Use strict TypeScript and NodeNext ESM. Follow existing formatting: two-space indentation, double quotes, semicolons, and trailing commas in multiline constructs. Relative imports must include the emitted `.js` suffix. Use `PascalCase` for classes and types, `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for module constants, and kebab-case filenames such as `openai-client.ts`. No formatter or linter is configured; match surrounding code and rely on `pnpm typecheck` for static enforcement.

## Testing Guidelines

Use Vitest and name suites `tests/<subject>.test.ts`. Add behavioral tests for every context-mode or provider change. Prefer injected fake `ChatClient` implementations over live API calls. Local tests must not require credentials or network access. There is no numeric coverage threshold; cover success, failure, and request-shape boundaries relevant to the change.

## Commit & Pull Request Guidelines

History uses Conventional Commit-style subjects such as `docs: add en README` and `chore: update name`. Continue with focused prefixes such as `feat:`, `fix:`, `test:`, `docs:`, or `chore:`. Pull requests should explain what changed and why, list validation commands, link the relevant issue when available, and call out changes to generated evidence or migration assumptions. Include representative CLI output or report/SVG samples when observable output changes.

## Security & Configuration

Copy `packages/chapter1/context/env.example` to `.env`; never commit keys. Currency rates are fixed demonstration data, not financial advice. Preserve baseline evidence unless intentionally running and documenting a new strict experiment with direct provider credentials.
