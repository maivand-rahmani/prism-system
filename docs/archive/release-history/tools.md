# @prism-system/tools

> **Archived release history.** Historical release notes of `@prism-system/tools`,
> preserved for reference. Not current guidance: see
> [the current specification](../../v4/README.md) and
> [the human guide](../../guide.md). New user-visible changes are recorded with
> Changesets.

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

- Release Prism V4: the visual system for whole interfaces, as an additive layer over the unchanged V2 contract.

  - `@prism-system/ui-core`: the V4 contract layer — 20 required components, 12 optional contracts, `DesignSystemComponentsV4`, separate required/optional lists, `defineDesignSystemV4`, and a separate V4 registry. The V2 types, exports, and registry stay unchanged.
  - `@prism-system/ui-system-a` / `@prism-system/ui-system-b`: all 20 required components, only the optional components each system actually declares (no stubs), `tokens.source.json` as the token source of truth, and a `schemaVersion: 2` / `contract: "v4"` manifest next to the generated ordinary `styles.css` and the Tailwind v4 `tailwind.css` bridge.
  - Manifest readers strictly distinguish `(schemaVersion: 1, contract: "v2")` from `(schemaVersion: 2, contract: "v4")`; a missing optional component key means "unavailable".
  - `@prism-system/tools`: offline `components`, `tokens`, `check`, and `setup-tailwind`, plus the explicit `upgrade <package> <exact-version>`; V2 and V4 are read by their own schema rules while existing command behavior and machine output stay compatible.

  The V4 manifest form and public contract are not backward compatible for the systems and `ui-core`, so they take a major bump; the new tooling commands are additive, so `@prism-system/tools` takes a minor bump.
