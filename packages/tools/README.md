# @prism-system/tools

Published tooling for `@prism-system` design systems. It finds and inspects published
styles in the npm registry, explicitly installs or upgrades one in a product, configures
the consumer contract, reads the installed component and token catalogs, validates strict
usage, sets up the Tailwind v4 bridge, and diagnoses the result.

- **Executable:** `prism-ds` (`search`, `info`, `install`, `use`, `upgrade`, `connect`,
  `components`, `tokens`, `check`, `check-usage`, `setup-tailwind`, `doctor`, `--help`).
- **Not a UI package:** it depends on no design system and on no `@prism-system/ui-*`
  package. TypeScript is its only runtime dependency.
- **One current contract:** it reads the current manifest shape (`schemaVersion: 4`,
  numeric `contractVersion: 4`) and rejects any other shape. The package-owned
  `design-system.source.json` descriptor stays `schemaVersion: 3` and is never shipped;
  this tooling never sees it.
- **Explicit boundaries:** `search`/`info` are network read-only; `install`/`use`/
  `upgrade` are the only commands that mutate consumer dependencies; `setup-tailwind`
  mutates only the explicitly named consumer CSS file; `connect` writes only the consumer
  config and agent instructions; `components`/`tokens`/`check`/`check-usage`/`doctor` are
  offline (`check-usage` may lazy-load TypeScript). No postinstall, no source copying, no
  publishing, no hidden package selection, and no access to the design-systems source
  repository. A regular-CSS consumer needs no Tailwind; only the token bridge does.

## Install

Install it from npm alongside the design system your product consumes, exactly like any
other dependency:

```bash
npm install --save-dev @prism-system/tools
npm install @prism-system/ui-system-a
```

Then run it with `npx` (or from `node_modules/.bin`).

## Quick path

```bash
# 1. Find a published style (explicit network, read-only).
npx prism-ds search "calm editorial"

# 2. Inspect its shipped manifest (explicit network, read-only).
npx prism-ds info @prism-system/ui-system-a

# 3. Install, connect, and verify usage in one explicit step (mutates dependencies).
npx prism-ds use @prism-system/ui-system-a --cwd . --check-usage

# 4. One offline read-only health report for CI and agents.
npx prism-ds check --cwd .
```

## Network commands

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
exact `dist-tags.latest`, validates the numeric `contractVersion: 4` and
`exports["./manifest"] === "./design-system.json"`, downloads the tarball **in memory**
with SRI verification, and validates the shipped `design-system.json` identity, version,
schema, contract, and required shape. Output includes the visual direction, the available
required and optional components, token groups and artifacts, docs, and the Showcase
route. `--json` emits a stable allowlisted object that includes the validated full
manifest.

## Dependency-mutating commands

### `prism-ds install <package-or-id> [version] --cwd <root>`

One of the only three commands that mutate consumer dependencies. It resolves and
validates the exact version from the registry first; if that fails, the package manager is
never invoked. The manager is detected from a valid `packageManager` field
(`npm@...`/`pnpm@...`) or exactly one supported lockfile
(`package-lock.json`/`pnpm-lock.yaml`); missing, unsupported, or ambiguous managers fail
closed (never a silent npm default). It runs a fixed command (`npm install` / `pnpm add`)
with one save mode (`--save-dev`/`--save-prod`, default prod), optional `--save-exact`
(`--exact`), always `--ignore-scripts`, `--registry=<url>`, and the exact
`<package>@<version>` argument. No user-supplied extra arguments, no shell on POSIX, and a
constrained `cmd.exe /d /s /c` adapter on Windows. After a zero exit it verifies the
installed package through the public `./manifest` export and exact identity/version checks.

### `prism-ds use <package-or-id> [version] --cwd <root>`

The explicit one-step workflow: resolve registry → install → verify → `connect` with the
exact package. `--check-usage` runs the strict checker afterwards (`--ignore <glob>`
requires it). `--tailwind --css <file>` additionally performs the Tailwind v4 setup after a
successful install and connect: it requires an installed Tailwind v4 target and preflights
the named CSS file before any dependency mutation, then edits only that file.
`--dry-run` resolves the exact target and the exact manager command (and, with `--tailwind`,
the planned CSS import diff) without spawning or writing. The target is always explicit;
the package is never discovered. A completed package-manager mutation is not rolled back
automatically — failures report the boundary (registry, package-manager, command,
preflight, spawn, manager, verify, connect, check-usage, setup-tailwind).

### `prism-ds upgrade <package-or-id> <exact-version> --cwd <root>`

Explicitly upgrade an installed design system to an exact registry version. The exact
version is required. Before any dependency mutation it validates the registry target and
compares its valid manifest against the installed one, reporting deterministic component
and token name additions/removals, changes to existing component variants/sizes/members,
schema/contract metadata, and public export targets. JSON output keeps the existing
`components.added/removed` and `tokens.added/removed` fields and adds `components.changed`,
`metadata`, and `exports`. Component and token names are compared as sets, so reordering
does not report a change. The manifest contains token names rather than token values, so
the diff cannot report value changes. On a real run it uses the same fixed npm/pnpm path as `use`,
verifies the exact installed identity/version, then reconnects. `--dry-run` resolves the
target and manager and returns the exact command plus the planned consumer file effects
without spawning or writing. It only mutates consumer dependencies and never the
design-systems source repository; a manager mutation is never rolled back.

## Offline commands

### `prism-ds connect [package] --cwd <consumer-root>`

Offline and configure-only. Writes only `<root>/.design-system/config.json`,
`<root>/.design-system/AGENTS.md`, and an idempotent managed block in `<root>/AGENTS.md`
(your own content is preserved; re-running is byte-stable). Never installs packages, edits
dependencies, copies source, or mutates the design-system repo. Options: `--strict` /
`--no-strict`, `--check`, `--dry-run`.

### `prism-ds components [name] --cwd <consumer-root>`

Offline, read-only component catalog for the installed design system, read only through its
public `./manifest` (no package code is executed, nothing is written). It lists the 29
required components plus all 17 known optional contracts, where an undeclared optional
is reported unavailable with no fabricated metadata. Availability is decided only by the
presence of the component key in `manifest.components`; the generated
`capabilities.categories` inventory (composition, forms, data-display) is canonical
category membership, not a second availability list, and category availability is derived
by intersecting its names with those keys. `[name]` selects one known component,
including an unavailable optional; an unknown name is rejected. The example route is
derived from the validated manifest `id` as `/showcase/<id>`.

### `prism-ds tokens [group] --cwd <consumer-root>`

Offline, read-only catalog of semantic token names mapped to the CSS custom properties and
Tailwind bridge names the installed system actually generates. Prefixes come only from
`manifest.tokens.names` (`cssVariablePrefix`, `tailwindUtilityPrefix`); token values are
never published, and generated CSS/TypeScript artifacts are never read or executed.
`[group]` selects one of the nine token groups.

### `prism-ds check --cwd <consumer-root> [--css <file>]`

Offline, read-only health report for a connected consumer. It aggregates, with each check
captured independently and a stable status (`passed`, `failed`, `not_checked`,
`not_applicable`): the consumer config, the full `doctor` diagnostics (including the
`./tailwind.css` bridge), the public `./styles.css` export, the Tailwind v4 prerequisite,
the CSS import order, strict usage, and required/optional component availability. The CSS
import order is checked **only** when an explicit `--css <file>` is given; with no `--css`
the report never scans for or guesses a CSS file and marks the imports `not_checked`. The
named `--css` check is read-only. It never writes, installs, executes package code, or runs
project scripts, and exits non-zero only when a required check fails.

### `prism-ds setup-tailwind --cwd <consumer-root> --css <file>`

Offline. It verifies an installed current-contract system and an installed Tailwind v4, and
that the package's `./tailwind.css` and `./styles.css` export targets exist, then makes
exactly one explicitly named CSS file inside `--cwd` load, in order:

```css
@import "tailwindcss";
@import "<package>/tailwind.css";
@import "<package>/styles.css";
```

Every other line is preserved byte-for-byte, a second design-system bridge fails closed,
and re-running is idempotent. It never installs Tailwind or the design system and never
edits dependencies. `--dry-run` previews the planned change and exits 0 even when imports
are pending. `--check` is a read-only pass/fail gate: it exits non-zero when imports need
adding or reordering, and succeeds only when the CSS file is already correctly configured.

### `prism-ds check-usage --cwd <consumer-root>`

Offline, deterministic AST-based validation of strict usage from the installed package's
shipped `./manifest`. It flags arbitrary colors/radius/shadows in class tokens, visual
inline-style overrides and unverifiable styles, and obvious local primitive replacements.
Strict findings exit non-zero; non-strict findings are warnings. `--ignore <glob>` adds a
root-relative ignore (repeatable). TypeScript is lazy-loaded only for this command.

### `prism-ds doctor [package] --cwd <consumer-root>`

Offline read-only diagnostics: realpath containment, package discovery, the installed
version resolved through Node package resolution, the public `./manifest` and its version,
exact identity/version invariants, the Tailwind bridge advertisement/export/file, and
the consumer config state. It writes nothing and exits non-zero when any check fails.

## Consumer contract

For a product repository, the public contract is:

1. `.design-system/config.json` (written by `connect`/`use`/`upgrade`);
2. the installed package's manifest at `<package>/manifest`;
3. the installed package's `AGENTS.md`;
4. the installed package's `README.md`;
5. the public TypeScript API of the package;
6. the public `./styles.css` and `./tailwind.css` subpaths.

The exact installed version, the manifest version, and any configured version must match.
Unknown manifest or config schema versions fail closed; only the current shape
(`schemaVersion: 4`, numeric `contractVersion: 4`) is accepted. There is one shipped
manifest shape, so readers of `schemaVersion: 3` must be upgraded in lockstep: an older
`prism-ds` cannot read a schema-4 manifest, and this tooling rejects schema 3. The
manifest's top-level `capabilities.categories` inventory (composition, forms,
data-display) is canonical category membership, not availability: per-system support is
only the presence of a key in `manifest.components`, and category availability is derived
by intersecting the two. Never edit or repeat `capabilities` in the package-owned
`design-system.source.json`, which stays `schemaVersion: 3`. The generated manifest
remains the authoritative design metadata; nothing duplicates it into `package.json`.

## Requirements

- Node.js `>= 20.19.0`.
- Tailwind CSS v4 only when a product uses the token bridge; regular CSS consumers need
  none.

## Maintainer tooling is separate

`pnpm ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`,
`ds:release`, `ds:check-tools`, `ds:check-docs`, and `ds:check-all` are maintainer
commands that operate on the design-systems source repository. They are not part of this
package and are not needed to consume a published design system.

## License

MIT.
