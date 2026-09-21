# @prism-system/tools

Published tooling for `@prism-system` design systems. It finds and inspects published
styles in the npm registry, explicitly installs one into a product, configures the
consumer contract, validates strict usage, and diagnoses the setup.

- **Executable:** `prism-ds` (`search`, `info`, `install`, `use`, `connect`,
  `check-usage`, `doctor`, `--help`).
- **Not a UI package:** it depends on no design system and on no `@prism-system/ui-*`
  package. TypeScript is its only runtime dependency.
- **Explicit boundaries:** `search`/`info` are network read-only; `install`/`use` are the
  only commands that mutate consumer dependencies; `connect`/`check-usage`/`doctor` are
  offline. No postinstall, no source copying, no publishing, no hidden package selection,
  and no access to the design-systems source repository.

## Install

Install it from npm alongside the design system your product consumes, exactly like any
other dependency:

```bash
npm install --save-dev @prism-system/tools
npm install @prism-system/ui-system-a
```

Then run it with `npx` (or from `node_modules/.bin`).

## Catalog lifecycle

```bash
# Find published styles (explicit network, read-only).
npx prism-ds search "calm editorial"
npx prism-ds search --json

# Inspect one style's shipped manifest (explicit network, read-only).
npx prism-ds info @prism-system/ui-system-a
npx prism-ds info system-a 1.0.0 --json

# Install it explicitly (mutates consumer dependencies), then connect.
npx prism-ds install @prism-system/ui-system-a --cwd . --save-dev --exact
npx prism-ds connect @prism-system/ui-system-a --cwd .

# Or do install → verify → connect → optional usage check in one step.
npx prism-ds use @prism-system/ui-system-a --cwd . --save-dev --check-usage
```

### `prism-ds search [query...]`

Explicit network, read-only npm Registry search (`GET /-/v1/search`) against the public
registry by default (`--registry <url>` to override). Results are always restricted to
supported `@prism-system/ui-*` names (tools, core, and foreign packages are excluded) and
sorted deterministically. `--size <1..250>` caps the request; `--json` emits stable JSON
(`name`, exact `version`, `description`, `keywords`).

### `prism-ds info <package-or-id> [version]`

Explicit network, read-only. Accepts only a supported `@prism-system/ui-*` name or a
lower-kebab system id and an optional exact semver (tags, ranges, aliases, and
git/file/workspace specs are rejected). It resolves an omitted version only through an
exact `dist-tags.latest`, validates `prismSystem.contract === "v2"` and
`exports["./manifest"] === "./design-system.json"`, downloads the tarball **in memory**
with SRI verification, and validates the shipped `design-system.json` identity, version,
schema, contract, and required shape. `--json` emits a stable allowlisted object that
includes the validated full manifest.

### `prism-ds install <package-or-id> [version] --cwd <root>`

The only command that mutates consumer dependencies. It resolves and validates the exact
version from the registry first; if that fails, the package manager is never invoked. The
manager is detected from a valid `packageManager` field (`npm@...`/`pnpm@...`) or exactly
one supported lockfile (`package-lock.json`/`pnpm-lock.yaml`); missing, unsupported, or
ambiguous managers fail closed (never a silent npm default). It runs a fixed command
(`npm install` / `pnpm add`) with one save mode (`--save-dev`/`--save-prod`, default
prod), optional `--save-exact` (`--exact`), always `--ignore-scripts`, `--registry=<url>`,
and the exact `<package>@<version>` argument. No user-supplied extra arguments, no shell
on POSIX, and a constrained `cmd.exe /d /s /c` adapter on Windows. After a zero exit it
verifies the installed package through the public `./manifest` export and exact
identity/version checks.

### `prism-ds use <package-or-id> [version] --cwd <root>`

The explicit one-step workflow: resolve registry → install → verify → `connect` with the
exact package. `--check-usage` runs the strict checker afterwards (`--ignore <glob>`
requires it). The target is always explicit; the package is never discovered. A completed
package-manager mutation is not rolled back automatically — failures report the boundary
(registry, package-manager, command, spawn, manager, verify, connect, check-usage).

## Offline commands

### `prism-ds connect [package] --cwd <consumer-root>`

Offline and configure-only. Writes `<root>/.design-system/config.json`,
`<root>/.design-system/AGENTS.md`, and an idempotent managed block in `<root>/AGENTS.md`
(your own content is preserved; re-running is byte-stable). Never installs packages, edits
dependencies, copies source, or mutates the design-system repo. Options: `--strict` /
`--no-strict`, `--check`, `--dry-run`.

### `prism-ds check-usage --cwd <consumer-root>`

Offline, deterministic AST-based validation of strict usage from the installed package's
shipped `./manifest`. It flags arbitrary colors/radius/shadows in class tokens, visual
inline-style overrides and unverifiable styles, and obvious local primitive replacements.
Strict findings exit non-zero; non-strict findings are warnings. `--ignore <glob>` adds a
root-relative ignore (repeatable). TypeScript is lazy-loaded only for this command.

### `prism-ds doctor [package] --cwd <consumer-root>`

Offline read-only diagnostics: realpath containment, package discovery, the installed
version resolved through Node package resolution, the public `./manifest` and its version,
exact identity/version invariants, and the consumer config state. It writes nothing and
exits non-zero when any check fails.

## Consumer contract

For a product repository, the public contract is:

1. `.design-system/config.json` (written by `connect`/`use`);
2. the installed package's manifest at `<package>/manifest`;
3. the installed package's `AGENTS.md`;
4. the installed package's `README.md`;
5. the public TypeScript API of the package.

The exact installed version, the manifest version, and any configured version must match.
Unknown manifest or config schema versions fail closed. The generated manifest remains the
authoritative design metadata; nothing duplicates it into `package.json`.

## Requirements

- Node.js `>= 20.19.0`.

## Maintainer tooling is separate

`pnpm ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`,
`ds:release`, and `ds:check-v3` are maintainer commands that operate on the design-systems
source repository. They are not part of this package and are not needed to consume a
published design system.

## License

MIT.
