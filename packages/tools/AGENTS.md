# AGENTS.md — @prism-system/tools

Package-local instructions. Read the repository root `AGENTS.md` first.

## Identity

`@prism-system/tools` is the **published consumer-side tooling** for `@prism-system`
design systems. It ships the `prism-ds` executable with three commands:

```text
connect       configure an already-installed design system in a consumer repository
check-usage   deterministic strict usage validation (TypeScript AST + shipped manifest)
doctor        read-only consumer diagnostics
```

It is not a UI package, not `@prism-system/ui-core`, and not a design system. It has no
colors, tokens, styling, or components.

## Ownership

This package owns:

- the consumer contract implementation (`connect`) and generated config/AGENTS content;
- the strict usage checker (`check-usage`) and its rule catalog;
- read-only diagnostics (`doctor`);
- the published `prism-ds` CLI and its argument handling.

This package must never:

- import `@prism-system/ui-core` or any `@prism-system/ui-*` design system;
- import from `apps/*`, `scripts/*`, `templates/*`, or another package's internals;
- read, assume, or hardcode the design-systems source repository at runtime;
- install packages, run a postinstall, make network calls, or mutate consumer
  dependencies or `package.json` files;
- copy component source or styling into a consumer.

The installed design-system package is resolved through Node package resolution from the
consumer root and read only through its public `exports` (notably `./manifest`).

## Runtime dependencies

- TypeScript is declared as a runtime dependency and is lazy-loaded only for
  `check-usage`; `connect` and `doctor` must not require it.
- No other runtime dependency may be added without updating the published package.

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
