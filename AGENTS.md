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
├── templates/design-system/   # current package template used by `pnpm ds:create`
├── fixtures/consumer-product/ # static example of a product repository
├── skills/                # agent-agnostic lifecycle instructions
├── scripts/               # deterministic maintainer commands (ds:*)
├── config/                # registered design systems
├── schemas/               # manifest, config, and token schemas
└── docs/
    ├── guide.md           # human guide
    ├── v4/                # current specification, recipes, and quality criteria
    └── archive/           # historical development-stage material
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

There is exactly **one current contract**, identified at runtime by the numeric
`contractVersion: 4`. It lives in `@prism-system/ui-core`:

- **Required.** Exactly 29 components every design system must export with a
  compatible API:

```text
Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
Tabs, Dialog, DropdownMenu, Tooltip, Separator, Heading, Text, Link, Container,
Stack, FormField, Center, Cluster, Sidebar, AspectRatio, Combobox, DatePicker,
NumberField, Slider, FileUpload
```

- **Optional.** Seventeen additional contracts. A system implements only the ones it
  really ships and declares them in its descriptor and generated manifest; an omitted
  name means unavailable, and empty stubs are not allowed:

```text
Grid, Section, Fieldset, Alert, Progress, Skeleton, Toast, Accordion,
Avatar, Breadcrumbs, Pagination, Table, Metric, DescriptionList, Timeline,
Meter, EmptyState
```

The contract types live in `@prism-system/ui-core` as one neutral API:
`DesignSystemComponents`, `REQUIRED_COMPONENTS`, `OPTIONAL_COMPONENTS`,
`defineDesignSystem`, `DesignSystem` (with numeric `contractVersion: 4`), and the single
`createDesignSystemRegistry`. Do not add parallel versioned aliases, string contract
markers, or a second registry.

A design system's visual result may differ completely, and systems may differ in which
optional capabilities they declare, but the required public API must remain
interchangeable so Showcase and Reference App can switch systems without rewriting the
interface. Development-stage history is archived under `docs/archive/` and is not a
target for new work.

## The shipped manifest

Every design system publishes a generated, read-only `design-system.json` manifest at
`./manifest`. It is `schemaVersion: 4` with the same numeric `contractVersion: 4`; the
package-owned `design-system.source.json` descriptor stays `schemaVersion: 3` and is a
repository-only input. The manifest also carries a top-level `capabilities.categories`
inventory (`composition`, `forms`, `data-display`): canonical category membership shared
by every system, not a second availability list. Per-system support remains only the
presence of a key in `manifest.components`; derive availability inside a category by
intersecting the category names with those keys. Categories are scoped, not exhaustive:
many components belong to no category. Never add, edit, or repeat `capabilities` in
`design-system.source.json`; regenerate the manifest with `pnpm ds:manifest <id> --write`.

There is exactly one current shipped manifest shape. Current tooling requires
`schemaVersion: 4` and rejects schema-3 manifests; manifest readers built for schema 3
must be upgraded in lockstep, and an older published `prism-ds` cannot read a schema-4
manifest.

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

- The current contract (version 4) is defined in `@prism-system/ui-core` and implemented
  by `@prism-system/ui-system-a` and `@prism-system/ui-system-b`. Each system declares
  its real optional capabilities in its generated `design-system.json` manifest.
- Factory and lifecycle tooling is in place: `templates/design-system`, the deterministic
  `pnpm ds:create`, `pnpm ds:register`, `pnpm ds:check`, `pnpm ds:manifest`,
  `pnpm ds:sync-versions`, and `pnpm ds:release` commands, and the
  `config/design-systems.json` registry. Showcase and Reference App integrate registered
  systems from that registry.
- `@prism-system/tools` ships the consumer `prism-ds` CLI: explicit network reads
  (`search`, `info`), dependency-mutating commands (`install`, `use`, `upgrade`),
  configuration (`connect`), catalog reads (`components`, `tokens`), Tailwind v4 setup
  (`setup-tailwind`), and offline checks (`check`, `check-usage`, `doctor`).
- Acceptance checks: `pnpm ds:check <id>` for a package, `pnpm ds:check-tools` for the
  packed tooling and manifests, `pnpm ds:check-docs` for the active documentation, and
  `pnpm ds:check-all` for the full gate over packed artifacts. All of them are read-only
  or confined to temporary output; none publishes a package.
- Versioning and publishing remain explicit Changesets and human steps;
  `pnpm ds:release <id> --approved` only prepares a release.
- Development-stage history lives in `docs/archive/`; it is historical, not current
  guidance.
- Do not scaffold retired contracts or harnesses unless explicitly asked.

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
pnpm ds:create <id>                 # generate a new design-system package
pnpm ds:register <id>               # register/sync a package in the registry
pnpm ds:check <id>                  # validate a package
pnpm ds:manifest <id> [--write]     # check/regenerate the shipped manifest
pnpm ds:sync-versions [id] [--check] # align runtime/manifest/registry versions
pnpm ds:release <id> --approved     # prepare a release (never versions/publishes)
pnpm ds:check-tools                 # packed tooling and manifest check
pnpm ds:check-docs                  # active documentation and local-link check
pnpm ds:check-all                   # full acceptance gate (packed artifacts)
pnpm ds:connect --cwd <consumer-root>     # configure a consumer repository (wrapper)
pnpm ds:check-usage --cwd <consumer-root> # strict usage validation (wrapper)
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
`ds:check`, `ds:manifest`, `ds:sync-versions`, `ds:release`, `ds:check-tools`,
`ds:check-docs`, and `ds:check-all` remain maintainer-only and are not published.

Lifecycle skills: `skills/create-design-system/SKILL.md` (create),
`skills/use-design-system/SKILL.md` (consume), and
`skills/modify-design-system/SKILL.md` (evolve).

Quality criteria and coverage limits: `docs/v4/quality.md`. CI, release, and publish
verification jobs share `.github/workflows/verify.yml`; the full acceptance gate is the
packed-artifact check run by `ds:check-all`.
