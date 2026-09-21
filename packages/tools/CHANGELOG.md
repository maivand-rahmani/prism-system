# @prism-system/tools

## 1.1.0

### Minor Changes

- dddfd2b: Add the `@prism-system/tools` catalog lifecycle: `search`, `info`, explicit `install`, and
  `use`.

  - `prism-ds search [query...] [--registry <url>] [--size <1..250>] [--json]` performs an
    explicit, read-only npm Registry search (`GET /-/v1/search`), always filtered to
    supported `@prism-system/ui-*` names and sorted deterministically.
  - `prism-ds info <package-or-id> [version] [--registry <url>] [--json]` accepts only a
    supported package/id and an exact semver, resolves an omitted version through an exact
    `dist-tags.latest`, validates `prismSystem.contract === "v2"` and
    `exports["./manifest"] === "./design-system.json"`, verifies `dist.integrity` (SRI), and
    reads the shipped manifest from the tarball in memory only.
  - `prism-ds install <package-or-id> [version] --cwd <root> [--save-dev|--save-prod]
[--exact] [--registry <url>]` is the only command that mutates consumer dependencies. It
    resolves/validates the registry version first, detects npm/pnpm from `packageManager` or
    exactly one supported lockfile (never a silent default), and runs a fixed command
    (`npm install`/`pnpm add`) with one save mode, optional `--save-exact`, always
    `--ignore-scripts`, `--registry=<url>`, and the exact `<package>@<version>` argument. No
    user-supplied extra args, no shell on POSIX, and a constrained `cmd.exe /d /s /c`
    adapter on Windows. It verifies the installed package before returning.
  - `prism-ds use <package-or-id> [version] --cwd <root> [install options]
[--strict|--no-strict] [--ignore <glob>...] [--check-usage]` installs, verifies, and
    connects one explicit package, then optionally runs the strict usage check. Failures
    report the boundary and never roll back a completed package-manager mutation.
  - `connect`, `check-usage`, and `doctor` stay offline with unchanged behavior; TypeScript
    remains lazy and loads only for `check-usage`. `install`/`use` are the only commands
    that change consumer dependencies; there is still no postinstall, no source copying, and
    no publishing.
  - Adds registry/catalog/package-manager modules using Node built-ins only (no new runtime
    dependency) and extends `pnpm ds:check-v3` with a local registry fixture that exercises
    the packed `search`/`info`/`install`/`use` boundary (fixed args, fail-closed untrusted
    registry data, package-manager ambiguity, no-network offline commands).

- 7275717: Add `@prism-system/tools`, the published consumer-side tooling with the `prism-ds`
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
