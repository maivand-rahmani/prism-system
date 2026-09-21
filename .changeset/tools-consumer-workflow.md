---
"@prism-system/tools": minor
---

Add `@prism-system/tools`, the published consumer-side tooling with the `prism-ds`
executable.

- New publishable workspace package under `packages/tools` (Node >= 20, ESM) that
  ships its runtime source, `README.md`, `AGENTS.md`, and `LICENSE`, and declares
  TypeScript as its own runtime dependency.
- `prism-ds connect [package] --cwd <consumer-root> [--strict|--no-strict] [--check]
[--dry-run]` writes `.design-system/config.json`, `.design-system/AGENTS.md`, and an
  idempotent managed block in the consumer root `AGENTS.md`.
- `prism-ds check-usage --cwd <consumer-root> [--strict|--no-strict] [--ignore <glob>]`
  runs deterministic strict usage validation from the shipped manifest rules.
- `prism-ds doctor [package] --cwd <consumer-root>` reports read-only diagnostics:
  containment, discovery, installed version, public `./manifest`, invariants, and config
  state.
- The installed design system and its public `./manifest` export are resolved through
  Node package resolution from the consumer root; nothing hardcodes the monorepo or
  imports package internals.
- No postinstall, no network calls, no package installation, no consumer
  dependency/`package.json` mutation, no source copying, and no runtime access to the
  design-systems source repository.
- The consumer implementation moves into this package. Root `scripts/design-system-consumer.mjs`
  and `scripts/design-system-usage.mjs` become compatibility re-exports, and
  `scripts/connect-design-system.mjs` / `scripts/check-design-system-usage.mjs` invoke the
  package CLI, so the `pnpm ds:connect` and `pnpm ds:check-usage` commands keep working
  with a single implementation.
- `pnpm ds:check-v3` now packs the `@prism-system/tools` artifact and drives the extracted
  `prism-ds` bin against an isolated TEMP consumer (connect, doctor, strict usage
  clean/failure, idempotent connect, exact version/identity, and no-mutation assertions).
- Maintainer commands (`ds:create`, `ds:register`, `ds:check`, `ds:manifest`,
  `ds:sync-versions`, `ds:release`, `ds:check-v3`) stay in the repository and are not
  published.
