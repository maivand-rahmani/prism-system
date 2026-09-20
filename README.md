# Maivand Design Systems

A central monorepo for building **portable design systems**. The visual language of a
product is created here, validated in isolation, and then consumed by real products as
an npm package.

## Structure

```text
design-systems/
├── apps/
│   ├── showcase/          # component laboratory (V1)
│   └── reference-app/     # fixed composition test bed with system switcher (V1)
├── packages/
│   ├── core/              # @prism-system/ui-core — unstyled shared foundation
│   ├── system-a/          # @prism-system/ui-system-a — test design system
│   └── system-b/          # @prism-system/ui-system-b — test design system
└── docs/                  # V1 / V2 / V3 specifications
```

## How it fits together

```text
apps/*   ──────────►   @prism-system/ui-system-*   ──────────►   @prism-system/ui-core

layout,                colors, tokens,                      contracts, types,
composition            variants, styles                     utilities, a11y, hooks
```

- `@prism-system/ui-core` is unstyled. It defines the shared contract for the eight V1
  components (`Button`, `Input`, `Card`, `Badge`, `Checkbox`, `Tabs`, `Dialog`,
  `Select`), plus common utilities, accessibility helpers, and hooks.
- Each design system implements that contract with its own complete visual language.
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

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `pnpm dev`              | Run all `dev` targets through Turborepo  |
| `pnpm build`            | Build every package (dependencies first) |
| `pnpm typecheck`        | Typecheck every package                  |
| `pnpm lint`             | Lint every package                       |
| `pnpm format`           | Format the repository with Prettier      |
| `pnpm changeset`        | Describe a change for the next release   |
| `pnpm version-packages` | Apply pending changesets                 |
| `pnpm release`          | Build and publish packages               |

## Packages

| Package                     | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `@prism-system/ui-core`     | Unstyled contracts, types, utilities, a11y helpers, hooks |
| `@prism-system/ui-system-a` | Test design system A (calm / minimal)                     |
| `@prism-system/ui-system-b` | Test design system B (contrast / expressive)              |

See each package's `README.md` and `AGENTS.md` for details.

## Roadmap

- **V1 — Foundation (complete):** portable design systems, Showcase, Reference App, and
  the npm package/release setup. See `docs/v1`.
- **V2 — Creation (in progress):** repeatable workflow for creating new design systems.
  The factory foundation is implemented — the canonical template, `ds:create`,
  `ds:register`, and the design-system manifest. The portable `create-design-system` skill
  with its Design Interview and Design Brief schema is implemented too (Phase 3). Still
  pending: `pnpm ds:check` validation, automatic Showcase / Reference App integration,
  and `pnpm ds:release` release preparation. See `docs/v2`.
- **V3 — Consumption & lifecycle (planned, specification only):** using and evolving
  systems in real products. See `docs/v3`.

V1 is implemented and released. For V2 the factory foundation (canonical template,
`ds:create`, `ds:register`, manifest) plus the portable `create-design-system` skill,
Design Interview, and Design Brief schema are implemented. Validation (`pnpm ds:check`),
automatic Showcase / Reference App integration, and release preparation
(`pnpm ds:release`) remain pending, so end-to-end V2 is not complete. V3 is a
specification only and is intentionally **not implemented yet**.

## Releases

Versioning and publishing are handled by [Changesets](https://github.com/changesets/changesets).
See `.changeset/README.md`.
