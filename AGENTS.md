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
│   ├── system-b/          # @prism-system/ui-system-b — test design system
│   └── tools/             # @prism-system/tools — published consumer tooling (prism-ds)
└── docs/
    ├── v1/                # V1 foundation spec
    ├── v2/                # V2 spec (factory + skill + validation/integration/release tooling implemented)
    └── v3/                # V3 consumer lifecycle spec (consumer tooling + lifecycle skills implemented)
```

## Package boundaries

- `@prism-system/ui-core` is the **unstyled** technical foundation. It owns contracts,
  shared types, utilities, accessibility helpers, and common hooks.
  It must never contain colors, tokens, typography, spacing, radius, shadows,
  motion values, or component appearance.
- Each `@prism-system/ui-system-*` package owns the **entire visual language**: tokens,
  styling, variants, states, and the concrete implementations of the shared
  component contract. It consumes `@prism-system/ui-core` and nothing from other systems.
- `@prism-system/tools` is the **published tooling** (the `prism-ds` executable), not a
  UI package. It is independent of `@prism-system/ui-core` and every design system and
  imports no repository source at runtime. Its `search`/`info` commands are explicit
  network read-only; `install`/`use` are the only commands that mutate consumer
  dependencies (via a fixed npm/pnpm command); `connect`/`check-usage`/`doctor` are
  offline. It has no postinstall, copies no source, and never publishes.
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
- **V3 — complete.** The consumer lifecycle is implemented and covered by a
  deterministic integration check (`pnpm ds:check-v3`), which validates and packs both
  systems, builds and packs a freshly generated template package, packs the published
  `@prism-system/tools` artifact, and exercises connect, doctor, exact version discovery,
  strict usage validation, and idempotent connect against the packed artifacts under
  `TEMP/v3/` — without mutating the repository or publishing.
  Consumer lifecycle tooling is available from two equivalent entry points:
  `pnpm ds:connect [package] --cwd <consumer-root>` / `pnpm ds:check-usage --cwd
<consumer-root>` in this repository, and the published `@prism-system/tools` package
  for external npm consumers. The published CLI adds the catalog lifecycle: `prism-ds
search` and `prism-ds info` (explicit network, read-only), `prism-ds install` and
  `prism-ds use` (the only commands that mutate consumer dependencies, via a fixed
  npm/pnpm command), plus the offline `prism-ds connect`, `prism-ds check-usage`, and
  `prism-ds doctor`. Both share one implementation; the root `scripts/*` commands are
  compatibility wrappers. `prism-ds connect` configures an already-installed
  `@prism-system/ui-*` package (config-first discovery, exact version/identity checks,
  `.design-system/config.json` and `.design-system/AGENTS.md`, and an idempotent managed
  block in the consumer root `AGENTS.md`; it never installs packages, edits dependencies,
  copies source, or mutates this repository). `prism-ds check-usage` performs
  deterministic strict usage validation against the shipped manifest rules, and
  `prism-ds doctor` is read-only diagnostics.
  Every package ships a generated `design-system.json` manifest exposed at `./manifest`,
  with `package.json.version` authoritative across the runtime `DesignSystem.version`,
  the manifest, and the registry (`pnpm ds:sync-versions`). The agent-agnostic lifecycle
  skills live in `skills/`: `create-design-system` (V2), `use-design-system`, and
  `modify-design-system`. Versioning and publishing remain explicit Changesets and human
  steps; this tooling never publishes a package.
- Do not scaffold V2 or V3 tooling beyond what is implemented unless explicitly asked.

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

Design-system factory and lifecycle commands (maintainer tooling in this repository):

```bash
pnpm ds:create <id>                 # generate a new design-system package (V2)
pnpm ds:register <id>               # register/sync a package in the registry
pnpm ds:check <id>                  # validate a package
pnpm ds:manifest <id> [--write]     # check/regenerate the shipped manifest
pnpm ds:sync-versions [id] [--check] # align runtime/manifest/registry versions
pnpm ds:release <id> --approved     # prepare a release (never versions/publishes)
pnpm ds:connect --cwd <consumer-root>     # configure a consumer repository (V3 wrapper)
pnpm ds:check-usage --cwd <consumer-root> # strict usage validation (V3 wrapper)
pnpm ds:check-v3                    # end-to-end V3 lifecycle check (packed artifacts)
```

Published consumer tooling (installed from npm in a product repository, not needed to
consume a released design system from here):

```bash
npx prism-ds search [query...] [--registry <url>] [--size <1..250>] [--json]  # registry search
npx prism-ds info <package-or-id> [version] [--registry <url>] [--json]       # inspect manifest
npx prism-ds install <package-or-id> [version] --cwd <consumer-root>          # mutate deps
npx prism-ds use <package-or-id> [version] --cwd <consumer-root>              # install + connect
npx prism-ds connect [package] --cwd <consumer-root>     # configure the consumer
npx prism-ds check-usage --cwd <consumer-root>           # strict usage validation
npx prism-ds doctor [package] --cwd <consumer-root>      # read-only diagnostics
```

`search`/`info` are explicit network, read-only; `install`/`use` are the only commands
that mutate consumer dependencies; `connect`/`check-usage`/`doctor` are offline.
`pnpm ds:connect` and `pnpm ds:check-usage` are compatibility wrappers around the same
implementation that ships as `@prism-system/tools`; `ds:create`, `ds:register`,
`ds:check`, `ds:manifest`, `ds:sync-versions`, `ds:release`, and `ds:check-v3` remain
maintainer-only and are not published.

Lifecycle skills: `skills/create-design-system/SKILL.md` (create),
`skills/use-design-system/SKILL.md` (consume), and
`skills/modify-design-system/SKILL.md` (evolve).
