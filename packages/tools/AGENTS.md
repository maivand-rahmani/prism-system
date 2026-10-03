# AGENTS.md — @prism-system/tools

Package-local instructions. Read the repository root `AGENTS.md` first.

## Identity

`@prism-system/tools` is the **published tooling** for `@prism-system` design systems. It
ships the `prism-ds` executable with seventeen root commands:

```text
search         npm Registry search for supported @prism-system/ui-* styles (network, read-only)
info           fetch and validate a published style's manifest (network, read-only)
install        explicitly install a style into a consumer (mutates consumer dependencies)
use            install, verify, connect, optional usage check, optional Tailwind setup (mutates dependencies)
upgrade        explicitly upgrade to an exact version, diff the manifest, re-connect (mutates dependencies)
switch         move a consumer to another exact system release after a compatibility review (mutates dependencies; retains the previous dependency)
remove         remove the selected system and its attributable integration once no active references remain (mutates dependencies)
connect        configure an already-installed style in a consumer (offline; writes config/AGENTS only)
components     read the installed style's component catalog (offline, manifest-only)
tokens         read the installed style's token catalog (offline, manifest-only)
check          one offline read-only consumer health report (offline)
setup-tailwind make one explicit consumer CSS file load the Tailwind v4 bridge (offline; edits that file only)
check-usage    deterministic strict usage validation (offline; TypeScript AST + manifest)
doctor         read-only consumer diagnostics (offline)
skills         list/add/update/remove official Prism and curated design skills (list offline; add/update/remove may bootstrap pinned npx and mutate skill directories)
self-update    check for or explicitly install a newer CLI release (network; installs only with --yes)
recover        turn project-state diagnostics into applicable recovery actions (default offline read-only; --action mutates only with --yes)
```

`skills` is one root command with `list`/`add`/`update`/`remove` subcommands; the
subcommands are not separate root command names. A bare `prism-ds` invocation starts the
inline TUI.

It reads the current manifest shape (`schemaVersion: 5`, numeric `contractVersion: 4`)
and rejects anything else. The package-owned source descriptor `design-system.source.json`
is `schemaVersion: 4`, is repository-only, and is never read from a consumer. The
manifest's `entrypoints`/`extensions`/`effects` metadata drives the extension catalog
and selected-entry peer planning; custom exports are never inferred from a name. It is
not a UI package, not `@prism-system/ui-core`, and not a
design system. It ships no colors, tokens, styling, or components of its own — the catalog
commands only read an installed package's public `./manifest`.

## Ownership

This package owns:

- the consumer contract implementation (`connect`) and generated config/AGENTS content;
- the strict usage checker (`check-usage`) and its rule catalog;
- read-only diagnostics (`doctor`) and the aggregated offline health report (`check`);
- the offline component catalog (`components`) and the token catalog (`tokens`);
- the extension catalog and the selected-entry prerequisite scan/peer planning
  (`--with-entry`, `--peer`, `--entry`);
- the Tailwind v4 setup planner/writer (`setup-tailwind`);
- the npm Registry client, catalog orchestration, and in-memory tarball/manifest
  validation (`search`, `info`);
- package-manager detection and fixed install-command construction (`install`, `use`,
  `upgrade`), including the exact-version manifest/capability diff;
- the usage-aware compatibility scanner and planner for `switch` (literal imports,
  entrypoints, extensions, variants/sizes/compound members, token names) and the
  attributable-removal planner for `remove`;
- the skills catalog, offline inventory, and pinned Skills CLI planning
  (`skills list/add/update/remove`);
- the CLI self-update planner and installation-context detection (`self-update`);
- the recovery planner (`recover`), which reuses the existing connect and Tailwind
  planners for explicitly selected actions;
- the published `prism-ds` CLI and its argument handling.

This package must never:

- import `@prism-system/ui-core` or any `@prism-system/ui-*` design system;
- import from `apps/*`, `scripts/*`, `templates/*`, or another package's internals;
- read, assume, or hardcode the design-systems source repository at runtime;
- run a postinstall, install anything at import time, or make network calls outside an
  explicit `search`/`info`/`install`/`use`/`upgrade`/`switch`/`remove`/`skills`/
  `self-update` invocation — the one automatic exception is the bounded, nonblocking,
  read-only TUI startup update check (`PRISM_DS_UPDATE_CHECK=0` disables it);
- edit consumer files outside an explicit command's owned surface (`connect`'s config and
  AGENTS files, `setup-tailwind`'s explicitly named CSS file, `switch`'s reviewed literal
  module/CSS substitutions, `remove`'s attributable integration cleanup);
- replace or delete a skill installation without confirmed, verified managed content, or
  write skills outside the explicitly selected scope and agent;
- execute installed skill instructions, install product dependencies for them, or invent
  skill popularity or usage statistics;
- guess a package manager, registry target, CSS file, version, or self-update context;
- copy component source or styling into a consumer;
- publish or version a package.

The installed design-system package is resolved through Node package resolution from the
consumer root and read only through its public `exports` (notably `./manifest`).

## Network and mutation boundaries

- `search`/`info` are explicit network, read-only. They never write to the consumer or
  repository and never install. The only other network access is explicit
  `self-update`, the pinned Skills CLI bootstrap of `skills add/update/remove`, and the
  bounded TUI startup update check below; `skills list` stays offline.
- `install`/`use`/`upgrade`/`switch`/`remove` are the **only** commands allowed to
  mutate consumer dependencies. They resolve and validate the exact version from the
  registry first, detect npm/pnpm (never a silent default), run a fixed command with
  `--ignore-scripts`, no user-supplied extra arguments, and no shell on POSIX (a
  constrained `cmd.exe /d /s /c` adapter on Windows), then verify the installed package
  before they connect. `switch` retains the previous dependency and additionally applies
  only the reviewed literal module/CSS import substitutions and managed integration
  changes; `remove` removes only the selected dependency plus unchanged, attributable
  integration, never product UI or arbitrary files. `--dry-run` resolves and plans
  without spawning or writing, and a mutation is never rolled back automatically. None of
  them touch the design-systems source repository.
- `connect` stays offline and writes only the consumer config/AGENTS files; it never edits
  dependencies.
- `setup-tailwind` stays offline and edits only the explicitly named `--css` file inside
  `--cwd`; it never installs or edits dependencies, and its `--dry-run`/read-only check
  never writes.
- `components`/`tokens`/`check`/`check-usage`/`doctor` stay offline and never edit
  dependencies. `check` never scans for or guesses a CSS file: its import-order check runs
  only with an explicit, read-only `--css`, and its entry prerequisite scan runs only with
  an explicit `--entry`; `install`/`use`/`upgrade`/`check`/`doctor` never scan a repository
  to guess entries: `install`/`use`/`upgrade` plan peers only for an explicitly selected
  entry (`--with-entry`/`--entry`, including a named consumer file), and `check`/`doctor`
  validate only the requirements of the entry selected with `--entry`. `switch`
  additionally auto-selects entries:
  its bounded literal active-usage scan automatically includes every extension it found
  imported and the target declares with the same name and entrypoint (deduplicated by
  name) in the same peer planning, and the plan reports them as `autoSelectedEntries`
  (`--json`); explicit `--with-entry` still adds entries beyond detected usage. Peer
  actions always come from the same safe planner — a satisfying installed peer is
  retained, a missing peer with an exact declared range is installed at that exact
  version, and a missing peer with a non-exact range requires an explicit satisfying
  `--peer name@exact-version` — and selected peers are verified afterward against the
  declared ranges.
- `recover` defaults to offline, read-only structured advice. Only an explicitly selected
  `--action <id>` may mutate, reusing the applicable existing connect/Tailwind planner
  with `--dry-run`/`--yes`; no CSS file or version is guessed, and a completed action is
  reported separately from a repaired or healthy project.
- `skills list` is offline and read-only, and observes actual files in both scopes
  including installations made outside Prism; a lock entry never establishes existence or
  integrity. `skills add/update/remove` may bootstrap the pinned `npx skills@1.7.0`
  (network/npm cache) and write only the selected skill in the explicitly selected
  scope/agent; they require confirmation, never silently replace local modifications, and
  block unknown/unmanaged updates. Installing a skill installs instructions only: it never
  executes them or installs product dependencies. The shared canonical placement is
  reported instead of promising per-agent isolation.
- `self-update` is explicit network and separate from `upgrade` (which upgrades a design
  system). `--check` is read-only; mutation requires `--yes` and an identified or
  explicitly selected supported installation with fixed exact package-manager arguments.
  Unknown, source, and ephemeral contexts receive advice instead of a guessed global
  update; an unverified post-install state is partial, never success.
- The bare-TUI startup may perform one bounded (2500 ms), nonblocking, read-only update
  check. `PRISM_DS_UPDATE_CHECK=0` disables it. It never mutates, never writes to the
  consumer, and never blocks startup when the network is unavailable.
- Registry URLs are http(s), credential-free, redirect-rejected, timeout- and size-limited.
  Tarballs are read and parsed in memory only; SRI `dist.integrity` is verified when
  present, and manifest identity/version/contract/schema/shape fail closed.

## Runtime dependencies

- TypeScript is declared as a runtime dependency and is lazy-loaded only for
  scanner-backed operations: the strict usage checker (`check-usage`, and the usage step
  of `check`/`use --check-usage`), the explicit selected-entry scan (`--entry`,
  `--with-entry`), the `switch` compatibility scan, and any `recover` scan that needs it.
  `connect`, `doctor`, `components`, `tokens`, `check` without scanner steps,
  `setup-tailwind`, `search`, `info`, `install`, `use` without `--check-usage`, `upgrade`,
  `remove`, `skills`, and `self-update` must not require it eagerly.
- The pinned Skills CLI bootstrap is resolved at explicit `skills add/update/remove` time
  (`npx skills@1.7.0`); it is never a package dependency, never runs at import time, and
  never runs for `skills list`.
- No other runtime dependency may be added without updating the published package. The
  registry/tarball/manager/skills/update/recovery code uses Node built-ins only.

## Consumer contract

- `.design-system/config.json` schema version is authoritative (`CONSUMER_SCHEMA_VERSION`).
- The shipped manifest export subpath and target (`./manifest` →
  `./design-system.json`) are the public contract. Never import package internals.
- The current schema/contract shape (`schemaVersion: 5`, numeric `contractVersion: 4`)
  is supported; every other shape fails closed. There is one shipped manifest shape, so
  schema-4 readers must be upgraded in lockstep: an older `prism-ds` cannot read a
  schema-5 manifest, and this tooling rejects schema 4 and older. Availability is only
  the presence of a key in `manifest.components`; the generated `capabilities.categories`
  inventory (composition, forms, data-display) is canonical category membership, not a
  second availability list, and category availability is derived by intersecting the two.
  Custom extensions are available only as declared in `manifest.extensions`; their
  entrypoint `requirements` are the only source for selected-entry peer checks.
  `tokens` reads the token catalog of the installed current-contract system.
- Exact version/identity equality fails closed; unknown schema versions fail closed.
- Writes are contained to the real `--cwd` root, atomic, and idempotent. Malformed managed
  markers fail closed. Skill installations live in the selected agent scope, never in the
  consumer contract files; `connect`/`switch`/`remove` neither read nor write them.

## Maintainer commands stay out

`ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`, `ds:release`,
`ds:check-tools`, `ds:check-docs`, and `ds:check-all` are maintainer tooling that operates
on the source repository or validates packed artifacts. They must not move into this
package. The root `scripts/design-system-*.mjs` and
`scripts/*-design-system-*.mjs` files are compatibility wrappers around this package.

## Changing this package

1. Keep the CLI behavior and the exported helper surface backward compatible.
2. Run `pnpm lint`, `pnpm typecheck`, and `pnpm ds:check-tools` before finishing.
   `ds:check-all` runs the full packed acceptance gate.
3. Record user-visible changes with `pnpm changeset`.
4. Never publish from a local command; publishing is a human-controlled step.
