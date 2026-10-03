# @prism-system/tools

Published tooling for `@prism-system` design systems. It finds and inspects published
styles in the npm registry, explicitly installs or upgrades one in a product, configures
the consumer contract, reads the installed component and token catalogs, validates strict
usage, sets up the Tailwind v4 bridge, and diagnoses the result.

- **Executable:** `prism-ds` with seventeen root commands (`search`, `info`, `install`,
  `use`, `upgrade`, `switch`, `remove`, `connect`, `components`, `tokens`, `check`,
  `check-usage`, `setup-tailwind`, `doctor`, `skills`, `self-update`, `recover`,
  `--help`). `skills` has `list`/`add`/`update`/`remove` subcommands; they are not
  separate root command names.
- **Interactive by default:** bare `prism-ds` (no arguments) renders an inline interactive
  TUI in the current terminal, in place, and never spawns a child terminal or window.
  Argument commands and `--help` remain plain CLI invocations. Startup may perform one
  bounded (2500 ms), nonblocking, read-only update check; `PRISM_DS_UPDATE_CHECK=0`
  disables it.
- **Not a UI package:** it depends on no design system and on no `@prism-system/ui-*`
  package. TypeScript and the Runeframe/Ink TUI runtime are its only runtime dependencies.
- **One current contract:** it reads the current manifest shape (`schemaVersion: 5`,
  numeric `contractVersion: 4`) and rejects any other shape. The package-owned
  `design-system.source.json` descriptor is `schemaVersion: 4` and is never shipped;
  this tooling never sees it. The manifest's `entrypoints`, `extensions`, and `effects`
  metadata is the only source for the custom-extension catalog and selected-entry
  requirements; nothing is inferred from a name.
- **Explicit boundaries:** `search`/`info` are network read-only; `install`/`use`/
  `upgrade`/`switch`/`remove` mutate consumer dependencies (`switch` retains the previous
  dependency and `remove` is a separate explicit operation); `self-update` installs a
  newer CLI only with `--yes`; `skills add/update/remove` may bootstrap the pinned
  `npx skills@1.7.0` and mutate only the selected skill directory; `setup-tailwind`
  mutates only the explicitly named consumer CSS file; `connect` writes only the consumer
  config and agent instructions; `components`/`tokens`/`check`/`check-usage`/`doctor`,
  default `recover`, and `skills list` are offline (`check-usage` and other
  scanner-backed steps may lazy-load TypeScript). The bare-TUI startup update check is
  the only automatic network read and can be disabled with `PRISM_DS_UPDATE_CHECK=0`.
  No postinstall, no source copying, no publishing, no hidden package selection, and no
  access to the design-systems source repository. A regular-CSS consumer needs no
  Tailwind; only the token bridge does.

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
required and optional components, declared custom extensions with their entrypoint
requirements and effects, token groups and artifacts, docs, and the Showcase
route. `--json` emits a stable allowlisted object that includes the validated full
manifest.

## Dependency-mutating commands

### `prism-ds install <package-or-id> [version] --cwd <root>`

One of the commands that mutate consumer dependencies. It resolves and
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

With `--with-entry <extension|entrypoint|consumer-file>` it additionally selects one or
more entries and plans their declared requirements: an installed peer that satisfies the
range is retained, a missing peer with an exact declared range is installed at that exact
version, and a missing peer with a non-exact range requires an explicit
`--peer name@exact-version` (repeatable) that satisfies the declared range. Selected
peers are verified after install. Without `--with-entry`, no entry requirements are
planned and the ordinary package install is unchanged.

### `prism-ds use <package-or-id> [version] --cwd <root>`

The explicit one-step workflow: resolve registry → install → verify → `connect` with the
exact package. `--check-usage` runs the strict checker afterwards (`--ignore <glob>`
requires it). `--tailwind --css <file>` additionally performs the Tailwind v4 setup after a
successful install and connect: it requires an installed Tailwind v4 target and preflights
the named CSS file before any dependency mutation, then edits only that file.
`--with-entry <extension|entrypoint|consumer-file>` and `--peer name@exact-version` plan
and verify the selected entry's declared requirements during the same install step.
`--dry-run` resolves the exact target and the exact manager command (and, with `--tailwind`,
the planned CSS import diff; with `--with-entry`, the entry selection and normalized peer
plan) without spawning or writing. The target is always explicit;
the package is never discovered. A completed package-manager mutation is not rolled back
automatically — failures report the boundary (registry, package-manager, command,
preflight, spawn, manager, verify, connect, check-usage, setup-tailwind).

### `prism-ds upgrade <package-or-id> <exact-version> --cwd <root>`

Explicitly upgrade an installed design system to an exact registry version. The exact
version is required. Before any dependency mutation it validates the registry target and
compares its valid manifest against the installed one, reporting deterministic component
and token name additions/removals, changes to existing component variants/sizes/members
and effects, custom-extension additions/removals and `apiVersion`/`entrypoint`/effects
changes, entrypoint requirement additions/removals/changes, schema/contract metadata, and
public export targets. JSON output keeps the existing `components.added/removed` and
`tokens.added/removed` fields and adds `components.changed`, `extensions`, `entrypoints`,
`metadata`, and `exports`. Component, token, and extension names are compared as sets, so
reordering does not report a change. The manifest contains token names rather than token
values, so the diff cannot report value changes. On a real run it uses the same fixed
npm/pnpm path as `use`, verifies the exact installed identity/version, then reconnects;
`--with-entry`/`--peer` plan and verify the selected entry's declared requirements.
`--dry-run` resolves the target and manager and returns the exact command plus the planned
consumer file effects without spawning or writing. It only mutates consumer dependencies
and never the design-systems source repository; a manager mutation is never rolled back.

### `prism-ds switch <target> [version] --cwd <root>`

Explicitly move a connected consumer from its current system to another exact release.
The target is resolved and validated from the registry first; then the installed and
target public manifests are compared and the consumer's actual usage is scanned —
literal imports and entrypoints, extensions, and supported literal variant, size,
compound-member, and token-name references. Missing target support for actively used
APIs is a **blocker**; dynamic or otherwise unsupported usage is reported as
**unverified** rather than compatible. Nothing beyond reviewed literal module/CSS import
substitutions and managed integration changes is rewritten: component structure, props,
and application source are never rewritten, and controls are never restyled.
`--css <file>` explicitly names the one CSS file whose literal package-name imports may
be substituted (never guessed). The bounded literal active-usage scan also auto-selects
entries: every target extension it found imported (deduplicated by name; compatibility
has already proved the target declares the same name and entrypoint) is included in peer
planning automatically, and the plan reports them as `autoSelectedEntries` in `--json`
output. Only literally detected usage is selected — installed-but-unused extensions and
arbitrary entry files are never selected.
`--with-entry <extension|entrypoint|consumer-file>` explicitly adds target entries beyond
detected usage, and `--peer name@exact-version` resolves a missing peer with a non-exact
declared range. Selected-entry requirements use the same safe planner as
`install`/`use`/`upgrade`: a satisfying installed peer is retained, a missing peer with
an exact declared range is installed at that exact version, and a missing peer with a
non-exact range requires the explicit satisfying `--peer`. Selected peers are verified
afterward against the declared ranges. `--dry-run` resolves the target, the exact manager
command, and the planned substitutions without spawning or writing.
A real run uses the same fixed npm/pnpm path as `use` (`--ignore-scripts`,
no user-supplied extra arguments), verifies the installed target, applies the reviewed
substitutions, and reconnects. The previous dependency is **retained**; removing it is
the separate `remove` operation. A completed package-manager mutation is never rolled
back automatically, and partial effects are reported precisely.

Token names do not reveal token values: the manifest diff cannot establish visual
equality, rendering behavior, accessibility, or runtime compatibility.

### `prism-ds remove [package] --cwd <root>`

Explicitly remove the selected system once it is unused. It refuses while active source
or style references remain, and previews removal of the selected dependency plus only
unchanged, attributable integration files/managed blocks. Unrelated dependencies, peers,
instructions, consumer CSS, and edited generated files are preserved; any required
manual cleanup is explained instead of guessed. `--css <file>` explicitly names the CSS
file inspected for residual imports. `--dry-run` resolves and previews without spawning
or writing; `--yes` is required to mutate. It never deletes product UI, whole
configuration directories, or arbitrary files, and it verifies the dependency and the
planned owned integration are absent afterward.

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
by intersecting its names with those keys. Declared `manifest.extensions` are listed as a
separate group with their `apiVersion`, import path, description, docs/example, declared
effects, and entrypoint requirements; an undeclared extension does not exist. `[name]`
selects one known component or declared extension, including an unavailable optional; an
unknown name is rejected. The example route is
derived from the validated manifest `id` as `/showcase/<id>`. The TUI Components view reads
the same catalog and shows its extension section only for a system that declares one.

### `prism-ds tokens [group] --cwd <consumer-root>`

Offline, read-only catalog of semantic token names mapped to the CSS custom properties and
Tailwind bridge names the installed system actually generates. Prefixes come only from
`manifest.tokens.names` (`cssVariablePrefix`, `tailwindUtilityPrefix`); token values are
never published, and generated CSS/TypeScript artifacts are never read or executed.
`[group]` selects one of the nine token groups.

### `prism-ds check --cwd <consumer-root> [--css <file>] [--entry <path-or-extension>]`

Offline, read-only health report for a connected consumer. It aggregates, with each check
captured independently and a stable status (`passed`, `failed`, `not_checked`,
`not_applicable`): the consumer config, the full `doctor` diagnostics (including the
`./tailwind.css` bridge), the public `./styles.css` export, the Tailwind v4 prerequisite,
the CSS import order, strict usage, and required/optional component availability. The CSS
import order is checked **only** when an explicit `--css <file>` is given; with no `--css`
the report never scans for or guesses a CSS file and marks the imports `not_checked`. The
named `--css` check is read-only. It never writes, installs, executes package code, or runs
project scripts, and exits non-zero only when a required check fails.

With `--entry <extension|entrypoint|consumer-file>` it additionally resolves the selected
entry, scans it literally (string `import`/`import()`/`require()` specifiers only), and
validates every declared requirement against the installed version and the declared range.
Without `--entry` the prerequisite scan is reported as skipped; the command never scans the
repository to guess entries. Only peer failures are consumer-actionable; dependency-kind
requirements are informational.

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
root-relative ignore (repeatable). TypeScript is lazy-loaded for scanner-backed
operations: this command, `check --entry`/`--with-entry` planning, the `switch`
compatibility scan, and `recover` when it needs the same scanner.

### `prism-ds doctor [package] --cwd <consumer-root> [--entry <path-or-extension>]`

Offline read-only diagnostics: realpath containment, package discovery, the installed
version resolved through Node package resolution, the public `./manifest` and its version,
exact identity/version invariants, the Tailwind bridge advertisement/export/file, and
the consumer config state. With `--entry` it adds the same selected-entry prerequisite
validation as `check`; without it no entry is scanned. It writes nothing and exits non-zero
when any check fails. When it finds an applicable project-state issue, it points at the
matching `recover` action; `doctor` and `check` remain offline and read-only.

## Skills commands

`prism-ds skills` manages two independent catalog types: **first-party Prism lifecycle
instructions** and **curated general-design instructions** (UI, UX, accessibility,
component composition, motion, 3D). Technology names in the catalog are tags, not
additional lifecycle contracts. Installation scope (project or global) and the target
agent are separate, explicit choices from a bounded allowlist.

### `prism-ds skills list --cwd <root> [--global]`

Offline, read-only inventory of the selected scope. It reports what is actually on disk,
including installations made outside Prism — a lock entry alone never establishes
existence or integrity — and reports the shared canonical placement instead of promising
per-agent isolation. It contains no invented popularity or usage statistics.

### `prism-ds skills add <id> --cwd <root> --agent <id> [--global] [--dry-run] [--yes]`

### `prism-ds skills update <id> --cwd <root> --agent <id> [--global] [--dry-run] [--yes]`

### `prism-ds skills remove <id> --cwd <root> --agent <id> [--global] [--dry-run] [--yes]`

Explicit, confirmed operations against the trusted catalog. The first-party source is the
approved `maivand-rahmani/prism-system` repository, resolved to an immutable commit during
explicit planning and frozen into the confirmed operation; the tooling never reads a local
design-systems checkout at runtime. `add`/`update` may bootstrap the pinned
`npx skills@1.7.0` executable (network and npm cache). An existing installation is never
silently replaced: `update` requires verified, unchanged managed content, and a modified
or unverifiable installation is blocked with manual-preservation guidance. `--dry-run`
previews without invoking the installer; `--yes` confirms the mutation. Installing skills
installs **instructions only** — it never executes them and never installs Three.js, GSAP,
or any other product dependency.

The four first-party skills are `use-design-system` and `switch-design-system` (consumer
instructions) and `create-design-system` and `modify-design-system` (author-workspace
instructions). Each ships portable, self-contained references and never requires the
design-systems checkout. `use` may include the consumer skill in its visible setup plan
only when an agent is explicitly selected with `--skill-agent <id>` (repeatable) or
reliably identified; `--no-skills` opts out. No provider is guessed and no authoring
skills are installed automatically.

## CLI self-update

### `prism-ds self-update [--check] [--cwd <root>] [--global] [--manager npm|pnpm] [--registry <url>] [--dry-run] [--yes] [--json]`

Checks for or explicitly installs a newer release of this CLI. It is deliberately separate
from `upgrade`, which upgrades a design-system package. The invocation context is
classified as local, global, ephemeral, source, or unknown; only an identified or
explicitly selected supported installation is updated, through fixed exact
package-manager arguments. Unknown, source, and ephemeral contexts receive accurate
advice instead of a guessed global mutation. `--check` is a read-only report;
`--dry-run` previews the exact command; `--yes` is required to mutate. A post-install
verification that cannot run is reported as partial, never as success, and a completed
package-manager mutation is never rolled back automatically.

**TUI startup exception:** bare `prism-ds` may perform one bounded (2500 ms),
nonblocking, read-only update check when it starts. Set `PRISM_DS_UPDATE_CHECK=0` to
disable it. The check never mutates the installation, never writes to the consumer, and
never blocks startup when the network is unavailable. It is the only automatic network
access in the package; every other network call requires an explicit command.

## Recovery

### `prism-ds recover [package] --cwd <root> [--css <file>] [--entry <entry>]`

### `prism-ds recover [package] --cwd <root> --action <id> [--css <file>] [--dry-run] [--yes]`

Turns project-state diagnostics into applicable recovery actions. The default run is
offline, read-only, and structured: it reports the observed state and only actions valid
for it. An optional `[package]` positional (or `--package <name>`) names the installed
system explicitly when discovery is ambiguous. Missing or malformed configuration,
multiple candidates, missing peers, and schema
mismatches receive distinct guidance; an upgrade is not recommended as a universal
repair, and no CSS file or version is guessed. `--action <id>` selects one reported
action; the applicable existing connect and Tailwind planners are reused, and `--dry-run`
previews while `--yes` confirms the mutation. Completing an action is not the same as
repairing the issue or making the project healthy: the targeted diagnosis is rechecked and
unresolved postchecks remain visible. Unknown errors stay manual with their reason
visible.

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
(`schemaVersion: 5`, numeric `contractVersion: 4`) is accepted. There is one shipped
manifest shape, so readers of `schemaVersion: 4` and older must be upgraded in lockstep:
an older `prism-ds` cannot read a schema-5 manifest, and this tooling rejects schema 4 and
older. The manifest's top-level `capabilities.categories` inventory (composition, forms,
data-display) is canonical category membership, not availability: per-system support is
only the presence of a key in `manifest.components`, and category availability is derived
by intersecting the two. Custom extensions are available only as declared in
`manifest.extensions`, and their entrypoint `requirements` are the only source for the
selected-entry peer checks; nothing is inferred from a name. Never edit or repeat
`capabilities` in the package-owned `design-system.source.json`, which is
`schemaVersion: 4`. The generated manifest
remains the authoritative design metadata; nothing duplicates it into `package.json`.

## Requirements

- Node.js `>= 22.0.0` (the inline interactive TUI requires the Runeframe/Ink runtime).
  The `skills` commands use the pinned `npx skills@1.7.0`, which requires Node.js
  `>= 22.20.0`; on older Node those commands are blocked gracefully with a clear message,
  and every other command keeps working.
- Tailwind CSS v4 only when a product uses the token bridge; regular CSS consumers need
  none.

## Maintainer tooling is separate

`pnpm ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`,
`ds:release`, `ds:check-tools`, `ds:check-docs`, and `ds:check-all` are maintainer
commands that operate on the design-systems source repository. They are not part of this
package and are not needed to consume a published design system.

## License

MIT.
