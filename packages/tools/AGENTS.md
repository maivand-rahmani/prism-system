# AGENTS.md — @prism-system/tools

Package-local instructions. Read the repository root `AGENTS.md` first.

## Identity

`@prism-system/tools` is the **published tooling** for `@prism-system` design systems. It
ships the `prism-ds` executable with seven commands:

```text
search       npm Registry search for supported @prism-system/ui-* styles (network, read-only)
info         fetch and validate a published style's manifest (network, read-only)
install      explicitly install a style into a consumer (mutates consumer dependencies)
use          install, verify, connect, optional strict usage check (mutates dependencies)
connect      configure an already-installed style in a consumer (offline)
check-usage  deterministic strict usage validation (offline; TypeScript AST + manifest)
doctor       read-only consumer diagnostics (offline)
```

It is not a UI package, not `@prism-system/ui-core`, and not a design system. It has no
colors, tokens, styling, or components.

## Ownership

This package owns:

- the consumer contract implementation (`connect`) and generated config/AGENTS content;
- the strict usage checker (`check-usage`) and its rule catalog;
- read-only diagnostics (`doctor`);
- the npm Registry client, catalog orchestration, and in-memory tarball/manifest
  validation (`search`, `info`);
- package-manager detection and fixed install-command construction (`install`, `use`);
- the published `prism-ds` CLI and its argument handling.

This package must never:

- import `@prism-system/ui-core` or any `@prism-system/ui-*` design system;
- import from `apps/*`, `scripts/*`, `templates/*`, or another package's internals;
- read, assume, or hardcode the design-systems source repository at runtime;
- run a postinstall, install anything at import time, or make network calls outside an
  explicit `search`/`info`/`install`/`use` invocation;
- copy component source or styling into a consumer;
- publish or version a package.

The installed design-system package is resolved through Node package resolution from the
consumer root and read only through its public `exports` (notably `./manifest`).

## Network and mutation boundaries

- `search`/`info` are explicit network, read-only. They never write to the consumer or
  repository and never install.
- `install`/`use` are the **only** commands allowed to mutate consumer dependencies. They
  resolve and validate the exact version from the registry first, detect npm/pnpm (never a
  silent default), run a fixed command with `--ignore-scripts`, no user-supplied extra
  arguments, and no shell on POSIX (a constrained `cmd.exe /d /s /c` adapter on Windows),
  then verify the installed package before `use` connects.
- `connect`/`check-usage`/`doctor` stay offline and never edit dependencies.
- Registry URLs are http(s), credential-free, redirect-rejected, timeout- and size-limited.
  Tarballs are read and parsed in memory only; SRI `dist.integrity` is verified when
  present, and manifest identity/version/contract/schema/shape fail closed.

## Runtime dependencies

- TypeScript is declared as a runtime dependency and is lazy-loaded only for
  `check-usage`; `connect`, `doctor`, `search`, `info`, `install`, and `use` must not
  require it.
- No other runtime dependency may be added without updating the published package. The
  registry/tarball/manager code uses Node built-ins only.

## Consumer contract

- `.design-system/config.json` schema version is authoritative (`CONSUMER_SCHEMA_VERSION`).
- The shipped manifest export subpath and target (`./manifest` →
  `./design-system.json`) are the public contract. Never import package internals.
- Exact version/identity equality fails closed; unknown schema versions fail closed.
- Writes are contained to the real `--cwd` root, atomic, and idempotent. Malformed managed
  markers fail closed.

## Maintainer commands stay out

`ds:create`, `ds:register`, `ds:check`, `ds:manifest`, `ds:sync-versions`, `ds:release`,
and `ds:check-v3` are maintainer tooling that operates on the source repository. They must
not move into this package. The root `scripts/design-system-*.mjs` and
`scripts/*-design-system-*.mjs` files are compatibility wrappers around this package.

## Changing this package

1. Keep the CLI behavior and the exported helper surface backward compatible.
2. Run `pnpm lint`, `pnpm typecheck`, and `pnpm ds:check-v3` before finishing.
3. Record user-visible changes with `pnpm changeset`.
4. Never publish from a local command; publishing is a human-controlled step.
