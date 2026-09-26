# AGENTS.md

Instructions for coding agents working inside this repository.

## What this repository is

A central monorepo that builds **portable design systems** for Maivand products.

Core idea:

> The visual language of a product is built separately from the product, validated
> in controlled isolation, and then consumed by real products as a package.

This repository is **not** an application and does not contain product business logic.

## Repository layout

```text
design-systems/
├── apps/
│   ├── showcase/          # component laboratory (live catalog at /showcase/<id>)
│   └── reference-app/     # fixed composition test bed
├── packages/
│   ├── core/              # @prism-system/ui-core  — unstyled shared foundation
│   ├── system-a/          # @prism-system/ui-system-a — test design system
│   ├── system-b/          # @prism-system/ui-system-b — test design system
│   └── tools/             # @prism-system/tools — published consumer tooling (prism-ds)
├── templates/design-system/   # V4 package template used by `pnpm ds:create`
├── fixtures/consumer-product/ # static example of a product repository
├── skills/                # agent-agnostic lifecycle instructions
├── scripts/               # deterministic maintainer commands (ds:*)
├── config/                # registered design systems
├── schemas/               # manifest, config, and token schemas
└── docs/
    ├── archive/           # completed V1, V2, and V3 specifications
    │   ├── v1/
    │   ├── v2/
    │   └── v3/
    └── v4/                # V4 specification and five-phase plan
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
  network read-only; `install`/`use`/`upgrade` are the only commands that mutate consumer
  dependencies (via a fixed npm/pnpm command); `connect` writes only consumer config and
  agent instructions; `setup-tailwind` edits only the explicitly named consumer CSS file;
  `components`/`tokens`/`check`/`check-usage`/`doctor` are offline and read-only. It has no
  postinstall, copies no source, and never publishes.
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

Two contracts coexist in `@prism-system/ui-core`:

- **V2 (canonical, unchanged).** Exactly fourteen components every design system must
  export with a compatible API:

```text
Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
Tabs, Dialog, DropdownMenu, Tooltip, Separator
```

- **V4 (additive).** Exactly twenty required components plus twelve optional contracts.
  The V4 layer adds `Heading`, `Text`, `Link`, `Container`, `Stack`, and `FormField` to
  the fourteen shared names and keeps the V2 prop contracts unchanged. A system
  implements only the optional components it declares; empty stubs are not allowed.

```text
optional: Grid, Section, Fieldset, Alert, Progress, Skeleton, Toast, Accordion,
          Avatar, Breadcrumbs, Pagination, Table
```

The contract types live in `@prism-system/ui-core` (`DesignSystemComponents`,
`REQUIRED_COMPONENTS`, and `defineDesignSystemV2` for V2; `DesignSystemComponentsV4`,
`REQUIRED_COMPONENTS_V4`, `OPTIONAL_COMPONENTS_V4`, and `defineDesignSystemV4` for V4).
A design system's visual result may differ completely, and V4 systems may differ in
which optional capabilities they declare, but the required public API must remain
interchangeable so Showcase and Reference App can switch systems without rewriting the
interface. The historical eight-component V1 contract (`Button`, `Input`, `Card`,
`Badge`, `Checkbox`, `Tabs`, `Dialog`, `Select`) is archived and unsupported.

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
  fourteen-component contract remains supported and unchanged, and both test systems
  keep implementing it. Versioning and publishing remain explicit Changesets and human
  steps; this tooling never publishes a package.
- **V3 — complete.** The consumer lifecycle is implemented and covered by a
  deterministic integration check (`pnpm ds:check-v3`), which validates and packs both
  systems, builds and packs a freshly generated template package, packs the published
  `@prism-system/tools` artifact, and exercises connect, doctor, exact version discovery,
  strict usage validation, and idempotent connect against the packed artifacts under
  `TEMP/v3/` — without mutating the repository or publishing. The `ds:check-v3` harness
  is now historical: it still assumes the V2 live packages and template, so it is not the
  V4 acceptance gate.
  Consumer lifecycle tooling is available from two equivalent entry points:
  `pnpm ds:connect [package] --cwd <consumer-root>` / `pnpm ds:check-usage --cwd
<consumer-root>` in this repository, and the published `@prism-system/tools` package
  for external npm consumers. The published CLI adds the catalog lifecycle: `prism-ds
search` and `prism-ds info` (explicit network, read-only), `prism-ds install`, `prism-ds
use`, and `prism-ds upgrade` (the only commands that mutate consumer dependencies, via a
  fixed npm/pnpm command), plus the offline `prism-ds connect`, `prism-ds components`,
  `prism-ds tokens`, `prism-ds check`, `prism-ds setup-tailwind`, `prism-ds check-usage`,
  and `prism-ds doctor`. Both share one implementation; the root `scripts/*` commands are
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
  skills live in `skills/`: `create-design-system` (V4), `use-design-system`, and
  `modify-design-system`. Versioning and publishing remain explicit Changesets and human
  steps; this tooling never publishes a package.
- **V4 — phases 1–5 complete, including Gate 5 (limited scope).** The V4
  contract (twenty required plus twelve optional names), the separate V4 core types and
  registry, the `tokens.source.json` source of truth, the `design-system.json` schema
  version 2 (`contract: "v4"`), the V4 package template, and both test systems migrated
  to twenty required components with the optional sets A `Grid`, `Fieldset`, `Alert`,
  `Progress`, `Accordion`, `Pagination`, `Table` and B `Section`, `Alert`, `Skeleton`,
  `Toast`, `Avatar`, `Breadcrumbs` are in place. Both systems ship an ordinary
  `styles.css` plus the `tailwind.css` bridge generated from the same tokens; the
  `prism-ds` CLI adds `components`, `tokens`, `check`, `setup-tailwind`, and
  `upgrade`; `pnpm ds:check-v4` and `pnpm ds:check-v4-tools` exercise packed artifacts,
  and `pnpm ds:check-v4-docs` validates the active documentation. Phase 4
  (Showcase/Reference App and the unified documentation route) and the phase 5 version
  preparation are implemented: the reviewed version Changesets were applied with
  `pnpm version-packages-and-sync` and `pnpm ds:sync-versions --check` passed. Prepared
  source-tree versions are `@prism-system/ui-core` `2.0.0`, `@prism-system/ui-system-a`
  `2.0.0`, `@prism-system/ui-system-b` `2.0.0`, `@prism-system/tools` `1.1.0`, and the
  private root `0.4.0`. These are prepared source-tree values only: no package has been
  published to npm or otherwise released, so they must not be consumed from a registry
  yet, and no public release readiness is implied. The lifecycle skills under
  `skills/` now cover V4 creation and evolution, manifest-driven consumer
  composition, and compatibility with installed V2 packages.
- Do not scaffold V2, V3, or V4 tooling beyond what is implemented unless explicitly asked.

## Commands

```bash
pnpm install        # install the workspace
pnpm dev            # run dev targets through Turborepo
pnpm build          # build all packages
pnpm lint           # lint all packages
pnpm typecheck      # typecheck all packages
pnpm test           # Node regression suites (run after build)
pnpm format         # format with Prettier
pnpm changeset      # record a release change
```

Design-system factory and lifecycle commands (maintainer tooling in this repository):

```bash
pnpm ds:create <id>                 # generate a new design-system package (V4)
pnpm ds:register <id>               # register/sync a package in the registry
pnpm ds:check <id>                  # validate a package
pnpm ds:manifest <id> [--write]     # check/regenerate the shipped manifest
pnpm ds:sync-versions [id] [--check] # align runtime/manifest/registry versions
pnpm ds:release <id> --approved     # prepare a release (never versions/publishes)
pnpm ds:connect --cwd <consumer-root>     # configure a consumer repository (wrapper)
pnpm ds:check-usage --cwd <consumer-root> # strict usage validation (wrapper)
pnpm ds:check-v4-tools              # packed V4 + static V2 consumer tooling check
pnpm ds:check-v3                    # historical V3 lifecycle check (V2 packages/template)
```

Published consumer tooling (installed from npm in a product repository, not needed to
consume a released design system from here):

```bash
npx prism-ds search [query...] [--registry <url>] [--size <1..250>] [--json]
npx prism-ds info <package-or-id> [version] [--registry <url>] [--json]
npx prism-ds install <package-or-id> [version] --cwd <consumer-root> [--dry-run]
npx prism-ds use <package-or-id> [version] --cwd <consumer-root> [--tailwind --css <file>] [--check-usage] [--dry-run]
npx prism-ds upgrade <package-or-id> <exact-version> --cwd <consumer-root> [--dry-run]
npx prism-ds components [name] --cwd <consumer-root>
npx prism-ds tokens [group] --cwd <consumer-root>
npx prism-ds check --cwd <consumer-root> [--css <file>]
npx prism-ds setup-tailwind --cwd <consumer-root> --css <file> [--dry-run|--check]
npx prism-ds connect [package] --cwd <consumer-root> [--strict|--no-strict] [--check] [--dry-run]
npx prism-ds check-usage --cwd <consumer-root> [--ignore <glob>]
npx prism-ds doctor [package] --cwd <consumer-root>
```

`search`/`info` are explicit network, read-only; `install`/`use`/`upgrade` are the only
commands that mutate consumer dependencies; `connect` only writes consumer config and
agent instructions; `setup-tailwind` edits only its explicitly named CSS file;
`components`/`tokens`/`check`/`check-usage`/`doctor` are offline and read-only.
`pnpm ds:connect` and `pnpm ds:check-usage` are compatibility wrappers around the same
implementation that ships as `@prism-system/tools`; `ds:create`, `ds:register`,
`ds:check`, `ds:manifest`, `ds:sync-versions`, `ds:release`, `ds:check-v4-tools`, and
`ds:check-v3` remain maintainer-only and are not published.

Lifecycle skills: `skills/create-design-system/SKILL.md` (create),
`skills/use-design-system/SKILL.md` (consume), and
`skills/modify-design-system/SKILL.md` (evolve).

Quality criteria and coverage limits: `docs/v4/quality.md`. CI, release and publish
verification jobs share `.github/workflows/verify.yml`; V4 acceptance includes the
packed-tools gate, while `ds:check-v3` remains historical only.
