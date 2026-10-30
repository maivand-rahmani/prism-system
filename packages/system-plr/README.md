# Plan Like Rahmani

`@prism-system/ui-system-plr` is a portable React design system implementing the current
contract (version 4). It brings a planning diary's warm paper, oak edges, muted botanical
green, and dark-wood counterpart to the full shared component catalog, with Literata for
editorial moments and Manrope for clear interface text and numbers.

## Design brief

- Summary: Plan Like Rahmani — A responsive planning diary for shaping each day, reflecting each evening, and setting weekly goals with progress reports.
- Visual direction: warm and editorial, grounded in nature, history, paper, and oak, tactile and quietly dimensional, clear modern actions, calm, readable, and reflective
- Avoid: generic SaaS dashboard styling, decorative historical ornament that competes with writing or actions, low-contrast text or focus indicators, heavy shadows, glass effects, or glossy wood imitation, pill-heavy controls and overly rounded cards, page-level zoom transitions or application-specific compositions in the package, color-only status communication, language-specific layouts that fail with Russian or English content

## Installation

```bash
pnpm add @prism-system/ui-system-plr
```

The package is built for React 18+ and depends on `@prism-system/ui-core`.

### Client boundary

Both published formats of the package root are client entries: the ESM and CJS
bundles open with a top-level `"use client"` directive. In Next.js App Router a
Server Component may import and render the components — they arrive as named
client references. A client reference exposes only the imported export, not
static properties attached to it: a Server Component renders Card parts through
the flat exports `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`,
and `CardFooter`, never `Card.Header`. The compound statics stay available
inside client components, including a small `"use client"` wrapper that composes
the parts (see [USAGE.md](./USAGE.md)). Keep server-side utilities out of the
root entry; the `@prism-system/ui-system-plr/tokens` subpath is plain data and stays
server-safe.

## Quickstart

### Ordinary CSS

Import the stylesheet once, before any components render:

```tsx
import "@prism-system/ui-system-plr/styles.css";
```

The stylesheet loads the Cyrillic-capable Literata and Manrope families from Google Fonts.
If your product's content policy blocks third-party font requests, self-host those families
and replace the font import in your application build while keeping their family names.
Set `data-prism-theme="dark"` on the document root to use the dark-wood palette; the
default theme is warm paper.

### Tailwind CSS v4

Tailwind v4 products add the standalone token bridge. Import order matters:
`tailwindcss` first, then the bridge, then the package styles.

```css
@import "tailwindcss";
@import "@prism-system/ui-system-plr/tailwind.css";
@import "@prism-system/ui-system-plr/styles.css";
```

The bridge does not import Tailwind itself; `prism-ds setup-tailwind --css <file>`
installs exactly this block in a consumer CSS file. Regular-CSS consumers need no
Tailwind.

### First screen

```tsx
"use client";

import { Button, Card, FormField, Input } from "@prism-system/ui-system-plr";
import "@prism-system/ui-system-plr/styles.css";

export function Example() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Continue</Card.Title>
      </Card.Header>
      <Card.Content>
        <Button>Continue</Button>
        <FormField id="email">
          <FormField.Label>Email</FormField.Label>
          <FormField.Control asChild>
            <Input type="email" autoComplete="email" />
          </FormField.Control>
        </FormField>
      </Card.Content>
    </Card>
  );
}
```

This composition uses compound members (`Card.Header`, `FormField.Label`), which are
available inside client components. In a Next.js App Router Server Component, import
the flat Card exports (`CardHeader`, `CardTitle`, `CardContent`) from the package root
instead, or move the composition into a small `"use client"` wrapper. See
[Client boundary](#client-boundary).

See [USAGE.md](./USAGE.md) for a day-planning composition, an evening-review form,
including validation and focus refs, plus responsive weekly-summary guidance. These are
product compositions demonstrating the components, not new system contracts.

## Foundations

Values live only in this package's `tokens.source.json`; the generated artifacts are
the TypeScript token export (`@prism-system/ui-system-plr/tokens`), the CSS variables used by the
components, and the Tailwind bridge. The same tokens feed the Foundations section of
the live catalog at **`/showcase/system-plr`**.

The token source mandates these groups:

- **themes** — light and dark semantic color trees: `text`, `surface`, `border`,
  `action`, `status`.
- **typography** — families, sizes, weights, line heights, letter spacing.
- **spacing** — scale plus semantic roles.
- **containers** — tokenized content widths for `Container`.
- **breakpoints** — static build-time breakpoints.
- **layers** — z-index layers for overlays, modals, toasts, tooltips.
- **radius**, **shadow** — surface and elevation language.
- **motion** — durations and easing curves, including reduced-motion behavior.

In a consumer, `prism-ds tokens [group]` lists the semantic token names and their
CSS/Tailwind names from the shipped manifest without publishing values.

## Components

The package implements every required and optional component in the shared contract, with no
custom extensions. Variants, sizes, compound members, examples, and availability are published
by the generated `design-system.json` manifest (`@prism-system/ui-system-plr/manifest`) — that
is the single source of truth. Browse the live catalog at **`/showcase/system-plr`**, or read
it offline with `prism-ds components [name]`. Card publishes flat root exports for its parts
(`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) for Server
Components; see [Client boundary](#client-boundary).

## Usage rules

- **Compose with props.** Prefer existing components over local replacements, and use
  component props rather than class overrides.
- **Layout stays in the product.** `grid`, `flex`, `gap`, positioning, and responsive
  rules are the product's job; the visual language stays here.
- **Strict usage** disallows arbitrary colors, radius values, and shadows, duplicated
  primitives, large visual overrides, and local replacements for components that
  already exist here.
- **Extension:** reusable visual patterns belong in this package; product and feature
  components stay in the product and are composed from these primitives.
- **Versioning:** `package.json.version` is authoritative; the manifest, the registry
  entry, and the runtime `DesignSystem.version` must match it.

## Development

```bash
pnpm build
pnpm typecheck
pnpm lint
```

Edit `tokens.source.json` as the source of truth, then regenerate token exports,
CSS variables, and the Tailwind bridge with `pnpm ds:manifest system-plr --write`.
Generated token artifacts are not hand-edited. Refine `src/styles` and each
component folder together. Keep the
system class on every visual component so the package can be safely consumed
alongside another design system.

## Manifest and version

Every installed package ships a generated `design-system.json` manifest,
available at `@prism-system/ui-system-plr/manifest`. It is `schemaVersion: 5` and records the
current contract (`contractVersion: 4`), the exact package version, the component
catalog, variants, sizes, compound members, the required `entrypoints` map with
package.json-derived dependency/peer requirements, optional verified `extensions`, and
the strict usage rules for this system.
The manifest also carries the canonical `capabilities.categories` inventory
(`composition`, `forms`, `data-display`) shared by every system: it maps component names
to categories, not to availability. A system supports a component only when its name is
a key in `manifest.components`; derive category availability by intersecting the
category names with those keys, and remember that categories do not cover every
component. The package-owned `design-system.source.json` stays `schemaVersion: 4` and
must never declare a `capabilities` block. Regenerate the manifest with
`pnpm ds:manifest system-plr --write` after changing the package-owned
`design-system.source.json`. Readers built for `schemaVersion: 4` must be upgraded in
lockstep: current `prism-ds` requires schema 5 and rejects schema 4, and an older
`prism-ds` cannot read a schema-5 manifest. After `changeset version` changes
`package.json.version`, run `pnpm ds:sync-versions` from the monorepo root to align
the runtime version, the generated manifest, and the registry entry;
`pnpm ds:sync-versions --check` fails without writing when they drift.

## Consumer contract

- **Identity:** the visual source of truth is `@prism-system/ui-system-plr` at the installed
  version.
- **Available UI:** the required and implemented optional components in the generated
  manifest, their compound members, and the tokens from
  `@prism-system/ui-system-plr/tokens`.
- **Usage rules:** prefer existing components, use props rather than class
  overrides, and keep layout in the product while the visual language stays here.
- **Restrictions:** no arbitrary colors, radius, or shadows; no duplicated
  primitives; no local replacements for components that already exist here.
- **Extension:** reusable visual patterns belong in the design system; product
  and feature components stay in the product and are composed from these
  primitives.
