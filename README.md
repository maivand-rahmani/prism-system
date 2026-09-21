# Maivand Design Systems

A central monorepo for building **portable design systems**. The visual language of a
product is created here, validated in isolation, and then consumed by real products as
an npm package.

## Structure

```text
design-systems/
├── apps/
│   ├── showcase/          # component laboratory
│   └── reference-app/     # fixed composition test bed with system switcher
├── packages/
│   ├── core/              # @prism-system/ui-core — unstyled shared foundation
│   ├── system-a/          # @prism-system/ui-system-a — V2 test design system
│   └── system-b/          # @prism-system/ui-system-b — V2 test design system
└── docs/                  # V1 (archived) / V2 (active) / V3 (planned)
```

## How it fits together

```text
apps/*   ──────────►   @prism-system/ui-system-*   ──────────►   @prism-system/ui-core

layout,                colors, tokens,                      contracts, types,
composition            variants, styles                     utilities, a11y, hooks
```

- The supported contract is exactly the fourteen V2 components, in canonical order:
  `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`, `Switch`,
  `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`.
- `@prism-system/ui-core` is unstyled. It defines that shared contract plus common
  utilities, accessibility helpers, and hooks. The historical eight-component V1
  contract (`Button`, `Input`, `Card`, `Badge`, `Checkbox`, `Tabs`, `Dialog`, `Select`)
  is archived and unsupported.
- Each design system implements the V2 contract with its own complete visual language;
  System A and System B are now V2.
- Showcase inspects a system component by component; Reference App proves that the
  same interface works when rendered with `system-a` or `system-b`.

## Requirements

- Node.js >= 20.19
- pnpm >= 10 (`corepack enable` or install pnpm globally)

## Getting started

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
```

## Workspace commands

| Command                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `pnpm dev`              | Run all `dev` targets through Turborepo   |
| `pnpm build`            | Build every package (dependencies first)  |
| `pnpm typecheck`        | Typecheck every package                   |
| `pnpm lint`             | Lint every package                        |
| `pnpm format`           | Format the repository with Prettier       |
| `pnpm ds:create`        | Generate a new design-system package      |
| `pnpm ds:register`      | Register and sync a system into the apps  |
| `pnpm ds:check`         | Validate a registered design system       |
| `pnpm ds:release`       | Prepare a release (never version/publish) |
| `pnpm changeset`        | Describe a change for the next release    |
| `pnpm version-packages` | Apply pending changesets                  |
| `pnpm release`          | Build and publish packages                |

## Packages

| Package                     | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `@prism-system/ui-core`     | Unstyled contracts, types, utilities, a11y helpers, hooks |
| `@prism-system/ui-system-a` | Test design system A (calm / minimal)                     |
| `@prism-system/ui-system-b` | Test design system B (contrast / expressive)              |

See each package's `README.md` and `AGENTS.md` for details.

## Roadmap

- **V1 — Foundation (complete; archived, unsupported):** portable design systems,
  Showcase, Reference App, and the npm package/release setup. V1's eight-component
  contract is historical only. See `docs/v1`.
- **V2 — Creation (complete through Phase 4):** the repeatable factory workflow for
  creating new design systems. Implemented: the canonical template
  (`templates/design-system`), the deterministic generators `pnpm ds:create` and
  `pnpm ds:register`, the portable `create-design-system` skill with its Design Interview
  and Design Brief schema, deterministic validation (`pnpm ds:check`), manifest-driven
  automatic Showcase / Reference App integration, and fail-closed release preparation
  (`pnpm ds:release`). See `docs/v2`.
- **V3 — Consumption & lifecycle (planned, specification only):** using and evolving
  systems in real products. See `docs/v3`.

V1 is archived and unsupported: its eight-component contract is no longer accepted. The
only supported contract is the fourteen-component V2 contract. V2 factory tooling is
implemented through Phase 4: the canonical template, `ds:create`/`ds:register`, the
portable skill with its Design Interview and schema, `pnpm ds:check`, automatic Showcase /
Reference App integration, and `pnpm ds:release` preparation. This tooling never versions
or publishes a package by itself — versioning and publishing remain explicit Changesets
and human steps. V2 introduces no AI runtime: the coding agent stays external. V3 is a
specification only and is intentionally **not implemented yet**.

## Releases

Versioning and publishing are handled by [Changesets](https://github.com/changesets/changesets).
See `.changeset/README.md`.
