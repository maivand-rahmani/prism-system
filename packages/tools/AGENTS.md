# AGENTS.md — @prism-system/tools

Package-local instructions. Read the repository root `AGENTS.md` first.

## Identity

`@prism-system/tools` is the **published tooling** for `@prism-system` design systems. It
ships the `prism-ds` executable with twelve commands:

```text
search         npm Registry search for supported @prism-system/ui-* styles (network, read-only)
info           fetch and validate a published style's manifest, V2 or V4 (network, read-only)
install        explicitly install a style into a consumer (mutates consumer dependencies)
use            install, verify, connect, optional usage check, optional Tailwind setup (mutates dependencies)
upgrade        explicitly upgrade to an exact version, diff the manifest, re-connect (mutates dependencies)
connect        configure an already-installed style in a consumer (offline; writes config/AGENTS only)
components     read the installed style's component catalog (offline, manifest-only)
tokens         read the installed V4 style's token catalog (offline, manifest-only)
check          one offline read-only consumer health report (offline)
setup-tailwind make one explicit consumer CSS file load the Tailwind v4 bridge (offline; edits that file only)
check-usage    deterministic strict usage validation (offline; TypeScript AST + manifest)
doctor         read-only consumer diagnostics (offline)
```

It reads both the published `(schemaVersion: 1, contract: "v2")` and
`(schemaVersion: 2, contract: "v4")` manifest shapes and rejects any other pair; V2
remains fully supported. It is not a UI package, not `@prism-system/ui-core`, and not a
design system. It ships no colors, tokens, styling, or components of its own — the catalog
commands only read an installed package's public `./manifest`.

## Ownership

This package owns:

- the consumer contract implementation (`connect`) and generated config/AGENTS content;
- the strict usage checker (`check-usage`) and its rule catalog;
- read-only diagnostics (`doctor`) and the aggregated offline health report (`check`);
- the offline component catalog (`components`) and the V4 token catalog (`tokens`);
- the Tailwind v4 setup planner/writer (`setup-tailwind`);
- the npm Registry client, catalog orchestration, and in-memory tarball/manifest
  validation (`search`, `info`);
- package-manager detection and fixed install-command construction (`install`, `use`,
  `upgrade`), including the exact-version manifest/capability diff;
- the published `prism-ds` CLI and its argument handling.

This package must never:

- import `@prism-system/ui-core` or any `@prism-system/ui-*` design system;
- import from `apps/*`, `scripts/*`, `templates/*`, or another package's internals;
- read, assume, or hardcode the design-systems source repository at runtime;
- run a postinstall, install anything at import time, or make network calls outside an
  explicit `search`/`info`/`install`/`use`/`upgrade` invocation;
- edit consumer files outside an explicit command's owned surface (`connect`'s config and
  AGENTS files, `setup-tailwind`'s explicitly named CSS file);
- copy component source or styling into a consumer;
- publish or version a package.

The installed design-system package is resolved through Node package resolution from the
consumer root and read only through its public `exports` (notably `./manifest`).

## Network and mutation boundaries

- `search`/`info` are explicit network, read-only. They never write to the consumer or
  repository and never install.
- `install`/`use`/`upgrade` are the **only** commands allowed to mutate consumer
  dependencies. They resolve and validate the exact version from the registry first,
  detect npm/pnpm (never a silent default), run a fixed command with `--ignore-scripts`,
  no user-supplied extra arguments, and no shell on POSIX (a constrained
  `cmd.exe /d /s /c` adapter on Windows), then verify the installed package before they
  connect. `--dry-run` resolves and plans without spawning or writing, and a mutation is
  never rolled back automatically. None of them touch the design-systems source repository.
- `connect` stays offline and writes only the consumer config/AGENTS files; it never edits
  dependencies.
- `setup-tailwind` stays offline and edits only the explicitly named `--css` file inside
  `--cwd`; it never installs or edits dependencies, and its `--dry-run`/read-only check
  never writes.
- `components`/`tokens`/`check`/`check-usage`/`doctor` stay offline and never edit
  dependencies. `check` never scans for or guesses a CSS file: its import-order check runs
  only with an explicit, read-only `--css`.
- Registry URLs are http(s), credential-free, redirect-rejected, timeout- and size-limited.
  Tarballs are read and parsed in memory only; SRI `dist.integrity` is verified when
  present, and manifest identity/version/contract/schema/shape fail closed.

## Runtime dependencies

- TypeScript is declared as a runtime dependency and is lazy-loaded only for the strict
  usage checker (`check-usage`, and the usage step of `check`/`use --check-usage`);
  `connect`, `doctor`, `components`, `tokens`, `check`, `setup-tailwind`, `search`, `info`,
  `install`, `use`, and `upgrade` must not require it eagerly.
- No other runtime dependency may be added without updating the published package. The
  registry/tarball/manager code uses Node built-ins only.

## Consumer contract

- `.design-system/config.json` schema version is authoritative (`CONSUMER_SCHEMA_VERSION`).
- The shipped manifest export subpath and target (`./manifest` →
  `./design-system.json`) are the public contract. Never import package internals.
- Both the `(1, "v2")` and `(2, "v4")` schema/contract pairs are supported; every other
  pair fails closed. V2 ships no token catalog, so `tokens` reports `supported: false`
  honestly rather than failing.
- Exact version/identity equality fails closed; unknown schema versions fail closed.
- Writes are contained to the real `--cwd` root, atomic, and idempotent. Malformed managed
  markers fail closed.

## Maintainer commands stay out

`ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`, `ds:release`,
`ds:check-v3`, and `ds:check-v4-tools` are maintainer tooling that operates on the source
repository or validates packed artifacts. They must not move into this package. The root
`scripts/design-system-*.mjs` and
`scripts/*-design-system-*.mjs` files are compatibility wrappers around this package.

## Changing this package

1. Keep the CLI behavior and the exported helper surface backward compatible.
2. Run `pnpm lint`, `pnpm typecheck`, and `pnpm ds:check-v4-tools` before finishing. The
   unchanged `ds:check-v3` harness is historical and still assumes V2 live packages/template;
   do not use it as the current V4 acceptance gate. The V4 tools harness carries separate
   packed/static V2 coverage.
3. Record user-visible changes with `pnpm changeset`.
4. Never publish from a local command; publishing is a human-controlled step.
