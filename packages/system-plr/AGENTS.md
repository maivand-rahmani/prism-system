# Plan Like Rahmani package rules

`@prism-system/ui-system-plr` is an independent design system implementing the current contract
(version 4). Keep its visual language inside `tokens.source.json`, `src/styles`, and
`src/components`; consuming apps should compose the components rather than replace their
appearance.

## Visual direction

- Summary: Plan Like Rahmani — A responsive planning diary for shaping each day, reflecting each evening, and setting weekly goals with progress reports.
- Direction: warm and editorial, grounded in nature, history, paper, and oak, tactile and quietly dimensional, clear modern actions, calm, readable, and reflective
- Avoid: generic SaaS dashboard styling, decorative historical ornament that competes with writing or actions, low-contrast text or focus indicators, heavy shadows, glass effects, or glossy wood imitation, pill-heavy controls and overly rounded cards, page-level zoom transitions or application-specific compositions in the package, color-only status communication, language-specific layouts that fail with Russian or English content

## Available components

The package must always export the twenty-nine required components of the current
contract (version 4), in canonical order:

`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`,
`Heading`, `Text`, `Link`, `Container`, `Stack`, `FormField`, `Center`, `Cluster`,
`Sidebar`, `AspectRatio`, `Combobox`, `DatePicker`, `NumberField`, `Slider`,
`FileUpload`.

The public API of these required exports is stable: never rename, remove, or alter one
to make room for something else. Do not maintain a second component catalog here or in
`README.md`: variants, sizes, and compound members are published by the generated
`design-system.json` manifest (`@prism-system/ui-system-plr/manifest`), and the live catalog is the
Showcase route `/showcase/system-plr`.

## Optional capabilities

This package implements the full optional contract as well as every required component.
Availability is determined only by the generated manifest's `components` keys. Keep
implementations, runtime exports, styles, and descriptor entries aligned; the source
descriptor stays `schemaVersion: 4` and never declares `capabilities`. The generated
`schemaVersion: 5` manifest carries the canonical `capabilities.categories` inventory,
which describes category membership rather than availability. This system ships no
custom extensions; do not add them without a separate request and complete implementation.

## Extension points

Improve the system here, and only here:

- `tokens.source.json` — colors, typography, spacing, containers, breakpoints,
  layers, radius, shadows, and motion. Regenerate derived token artifacts with
  `pnpm ds:manifest system-plr --write`; never hand-edit generated files.
- `src/styles` — surface, state, and composition rules.
- `src/components` — component appearance, variants, states, and optional
  additive components.

New reusable visual patterns belong in this package. Product-specific
compositions belong to the consuming app.

## Rules

1. Use `@prism-system/ui-core` primitives, contract types, and `cn` before
   writing a new primitive.
2. Keep every visual decision — colors, typography, spacing, radius, borders,
   shadows, states, motion — in this package. Consume the system through props,
   not through className overrides.
3. Do not import another design system or app code. Use only
   `@prism-system/ui-core` and React.
4. Avoid arbitrary colors, radii, and shadows, and do not duplicate primitives
   that core already provides.
5. Preserve compound static members and normalize optional Radix `forceMount`
   values before passing them to primitives.

## Consumer contract

`@prism-system/ui-system-plr` is the visual source of truth for products that adopt it. An
external coding agent consuming this package must:

1. **Identify the system and version.** The installed package is
   `@prism-system/ui-system-plr`. `package.json.version` is authoritative, and the generated
   `design-system.json` manifest (also exported as `@prism-system/ui-system-plr/manifest`) is
   `schemaVersion: 5` and records the current contract (`contractVersion: 4`), the same
   exact version, the component catalog, variants, sizes, compound members, the required
   `entrypoints` map with package.json-derived dependency/peer requirements, optional
   verified `extensions`, and the strict usage rules below. Its
   `capabilities.categories` inventory (composition,
   forms, data-display) is canonical category membership, not availability: support is
   only the presence of a component key in `manifest.components`, and category
   availability is derived by intersecting the two. Custom extensions are available only
   when they are declared in `manifest.extensions`; read their entrypoint import path,
   docs/example, effects, and the entrypoint requirements before using one. Read the
   manifest and this file before writing UI.
2. **Use the public API.** Import the twenty-nine required components from the package
   root and design tokens from `@prism-system/ui-system-plr/tokens`. Import ordinary CSS from
   `@prism-system/ui-system-plr/styles.css`; Tailwind v4 products additionally load
   `@prism-system/ui-system-plr/tailwind.css` after `tailwindcss` and before `styles.css`. Never
   import package internals or paths that are not part of the `exports` map. The
   published root is a client entry (both formats open with `"use client"`): a Next.js
   App Router Server Component may import and render its components as client
   references. A client reference exposes only the imported export, not static
   properties, so a Server Component imports the flat Card parts (`CardHeader`,
   `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) instead of
   `Card.Header`; compound statics work inside client components or a small
   `"use client"` wrapper. Do not use root exports as server-side utilities; the
   `./tokens` subpath stays server-safe.
3. **Keep the visual language here.** Colors, typography, spacing, radius,
   borders, shadows, surfaces, states, variants, and motion belong to this
   package. Consumers compose with props; they must not restyle components or
   copy package CSS.

See [USAGE.md](./USAGE.md) for the day-planning and evening-review compositions, including
control refs, invalid state, and keyboard-accessible form wiring.

### Usage rules

- Prefer an existing component over a local replacement.
- Layout is allowed (`grid`, `flex`, `gap`, responsive rules, positioning,
  page-specific composition). Visual language changes are not.
- If a component must look different for the whole product, change it here in
  the design system, not in the consuming app.

### Restrictions

Strict usage disallows arbitrary colors, arbitrary radius values, arbitrary
shadows, duplicated primitives, large visual overrides, and local replacements
for components that already exist here.

The strict checker covers supported TS/TSX syntax. It does not prove component
identity or detect every visual override in semantic utilities or external CSS;
review those against the package styling rules as well.

### Extension rules

A new pattern belongs to this package only when it is a reusable visual pattern
shared across the product. Product-specific and feature components stay in the
consuming app and are composed from these primitives. Additions must be
additive, package-local, and must never rename, remove, or alter a required
export.

### Version synchronization

`package.json.version` is authoritative. After `changeset version` rewrites it,
run `pnpm ds:sync-versions` from the monorepo root to align the runtime
`DesignSystem.version` in `src/design-system.ts`, the generated
`design-system.json`, and the registry entry in `config/design-systems.json`.
`pnpm ds:sync-versions --check` reports drift without writing, and
`pnpm ds:check system-plr` fails closed on any remaining mismatch.

For the repository lifecycle workflow, see `skills/use-design-system/SKILL.md`
(consume) and `skills/modify-design-system/SKILL.md` (evolve).

Design brief: Plan Like Rahmani — A responsive planning diary for shaping each day, reflecting each evening, and setting weekly goals with progress reports.
