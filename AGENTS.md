# AGENTS.md

Instructions for coding agents working inside this repository.

## What this repository is

A central monorepo that builds **portable design systems** for Maivand products.

Core idea:

> The visual language of a product is built separately from the product, validated
> in controlled isolation, and then consumed by real products as a package.

This repository is **not** an application and does not contain product business logic.

## Architecture (V1)

```text
design-systems/
├── apps/
│   ├── showcase/          # component laboratory
│   └── reference-app/     # fixed composition test bed
├── packages/
│   ├── core/              # @prism-system/ui-core  — unstyled shared foundation
│   ├── system-a/          # @prism-system/ui-system-a — test design system
│   └── system-b/          # @prism-system/ui-system-b — test design system
└── docs/
    ├── v1/                # V1 foundation spec
    ├── v2/                # V2 spec (factory + skill + validation/integration/release tooling implemented)
    └── v3/                # V3 consumer lifecycle spec (planned, not implemented)
```

## Package boundaries

- `@prism-system/ui-core` is the **unstyled** technical foundation. It owns contracts,
  shared types, utilities, accessibility helpers, and common hooks.
  It must never contain colors, tokens, typography, spacing, radius, shadows,
  motion values, or component appearance.
- Each `@prism-system/ui-system-*` package owns the **entire visual language**: tokens,
  styling, variants, states, and the concrete implementations of the shared
  component contract. It consumes `@prism-system/ui-core` and nothing from other systems.
- `apps/*` only compose. They own layout, placement, and reference scenarios.
  They must not restyle, copy, or override package internals.

## Dependency direction

```text
apps/*  ──────────────►  @prism-system/ui-system-*  ──────────────►  @prism-system/ui-core
```

Rules:

- `core` never imports from a design system or an app.
- A design system never imports from another design system.
- Apps never import from `core` internals or duplicate UI components from packages.
- Cross-package imports use the published `@prism-system/*` package names, never
  relative paths that cross a package boundary.

## The shared component contract

The supported contract is exactly the fourteen V2 components. Every design system must
export them with a compatible API:

```text
Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
Tabs, Dialog, DropdownMenu, Tooltip, Separator
```

The contract types live in `@prism-system/ui-core` (`DesignSystemComponents`,
`REQUIRED_COMPONENTS`, and the `defineDesignSystemV2` helper). A design system's visual
result may differ completely, but its public API must remain interchangeable so Showcase
and Reference App can switch systems without rewriting the interface. The historical
eight-component V1 contract (`Button`, `Input`, `Card`, `Badge`, `Checkbox`, `Tabs`,
`Dialog`, `Select`) is archived and unsupported.

## Styling ownership

The design system is responsible for:

```text
colors, typography, spacing, radius, borders, shadows, surfaces,
component appearance, component variants, interaction states, motion
```

The app is responsible only for:

```text
layout, composition, placement of components, reference scenarios
```

Correct:

```tsx
<Button variant="primary">Create</Button>
```

Wrong:

```tsx
<Button className="rounded-full bg-purple-500 shadow-xl">Create</Button>
```

## Rules for creating components

1. Prefer an existing `@prism-system/ui-core` contract before inventing a new shape.
2. Prefer an existing shadcn/radix primitive before writing a new one.
3. Keep component logic and styling inside the design-system package.
4. Use CVA (`cva` re-exported from core) for variant-to-class mapping when it helps.
5. Follow the accessibility requirements documented in the contract types.
6. A new reusable visual pattern belongs to the design system; product-specific
   compositions belong to the app.

## Current implementation status

- **V1 — complete, archived, unsupported.** The monorepo infrastructure is in place:
  `@prism-system/ui-core` (contracts, types, utilities, a11y helpers, common hooks), the
  two test design systems `@prism-system/ui-system-a` and `@prism-system/ui-system-b`,
  Showcase, and Reference App. Packages build and typecheck, and the package/release
  setup (Changesets plus the GitHub OIDC release workflow) is established. The V1
  eight-component contract is historical only and no longer accepted.
- **V2 — complete through Phase 4.** The factory tooling is implemented: the canonical
  package template (`templates/design-system`), the deterministic generators
  `pnpm ds:create` and `pnpm ds:register`, and the design-system manifest
  `config/design-systems.json` (Phase 2); the portable `create-design-system` skill
  (`skills/create-design-system/SKILL.md`) with its Design Interview and Design Brief
  schema (`design-brief.schema.json`) (Phase 3); and deterministic validation
  (`pnpm ds:check`), manifest-driven automatic Showcase / Reference App integration, and
  fail-closed release preparation (`pnpm ds:release`) (Phase 4). The canonical V2
  fourteen-component contract is the only supported contract, and both test systems now
  implement it. Versioning and publishing remain explicit Changesets and human steps;
  this tooling never publishes a package.
- **V3 — not implemented.** V3 lifecycle tooling (consumer/manifest tooling, strict-mode
  usage checks) lives in `docs/v3` as a specification only.
- Do not scaffold V2 or V3 tooling beyond the implemented V2 factory tooling unless
  explicitly asked.

## Commands

```bash
pnpm install        # install the workspace
pnpm dev            # run dev targets through Turborepo
pnpm build          # build all packages
pnpm lint           # lint all packages
pnpm typecheck      # typecheck all packages
pnpm format         # format with Prettier
pnpm changeset      # record a release change
```
