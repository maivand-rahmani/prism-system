# @prism-system/ui-system-b

System B is the sharp, expressive option in the Maivand component family: night
surfaces, electric coral actions, cyan focus cues, and confident physical motion.
It is a design system for the current contract (version 4) for products with a strong
point of view and a little more visual voltage.

## Design brief

System B is dark-first, high-contrast, and editorial: night surfaces carry
ink-bright text, electric coral is reserved for action, and cyan marks focus.
Compact radii, visible purple-gray lines, offset shadows, and confident physical
motion create an expressive interface without sacrificing keyboard clarity or
reduced-motion behavior. Avoid light-first palettes, generic SaaS styling,
pill-heavy layouts, heavy gradients, and consumer-app overrides.

## Installation

```bash
pnpm add @prism-system/ui-system-b
```

The package targets React 18+ and depends on `@prism-system/ui-core`.

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
root entry; the `@prism-system/ui-system-b/tokens` subpath is plain data and
stays server-safe.

## Quickstart

### Ordinary CSS

Import the stylesheet once, before any components render:

```tsx
import "@prism-system/ui-system-b/styles.css";
```

### Tailwind CSS v4

Tailwind v4 products add the standalone token bridge. Import order matters:
`tailwindcss` first, then the bridge, then the package styles.

```css
@import "tailwindcss";
@import "@prism-system/ui-system-b/tailwind.css";
@import "@prism-system/ui-system-b/styles.css";
```

The bridge does not import Tailwind itself; `prism-ds setup-tailwind --css <file>`
installs exactly this block in a consumer CSS file. Regular-CSS consumers need no
Tailwind.

### First screen

```tsx
import { Button, Card, FormField, Input, Section } from "@prism-system/ui-system-b";
import "@prism-system/ui-system-b/styles.css";

export function Example() {
  return (
    <Section>
      <Section.Header>
        <Section.Title>Launch sequence</Section.Title>
        <Section.Description>Confirm the details before you continue.</Section.Description>
      </Section.Header>
      <Section.Content>
        <Card>
          <Card.Header>
            <Card.Title>Project</Card.Title>
          </Card.Header>
          <Card.Content>
            <FormField id="project-name">
              <FormField.Label>Project name</FormField.Label>
              <FormField.Control asChild>
                <Input placeholder="Enter a name" />
              </FormField.Control>
            </FormField>
            <Button>Create project</Button>
          </Card.Content>
        </Card>
      </Section.Content>
    </Section>
  );
}
```

This composition uses compound members (`Section.Header`, `Card.Header`,
`FormField.Label`), which are available inside client components. In a Next.js
App Router Server Component, import the flat Card exports (`CardHeader`,
`CardTitle`, `CardContent`) from the package root instead, or move the
composition into a small `"use client"` wrapper. See
[Client boundary](#client-boundary).

`Stack` is a structural flow primitive: use `direction="horizontal" | "vertical"`
(plus optional `as` and `wrap`), not a visual `variant`. `Container` owns the
content width.

```tsx
<Stack direction="horizontal">
  <Button>Save</Button>
  <Button variant="ghost">Cancel</Button>
</Stack>
```

See [USAGE.md](./USAGE.md) for a complete content page and interactive form,
including validation, focus refs, and Select trigger composition. The examples
ship with this package and use only required components.

## Foundations

Values live only in this package's `tokens.source.json`; the generated artifacts are
the TypeScript token export (`@prism-system/ui-system-b/tokens`), the CSS variables
used by the components, and the Tailwind bridge. The same tokens feed the Foundations
section of the live catalog at **`/showcase/system-b`**.

- **themes** — light and dark semantic color trees: `text`, `surface`, `border`,
  `action`, `status`.
- **typography** — families, sizes, weights, line heights, letter spacing.
- **spacing** — scale plus semantic roles.
- **containers** — tokenized content widths for `Container`.
- **breakpoints** — static build-time breakpoints.
- **layers** — z-index layers for overlays, modals, toasts, tooltips.
- **radius**, **shadow** — compact radii and offset elevation.
- **motion** — confident durations and easing curves, with reduced-motion behavior.

In a consumer, `prism-ds tokens [group]` lists the semantic token names and their
CSS/Tailwind names from the shipped manifest without publishing values.

## Components

The package root always exports the twenty-nine required components of the current
contract (version 4), in canonical order:

`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`,
`Heading`, `Text`, `Link`, `Container`, `Stack`, `FormField`, `Center`,
`Cluster`, `Sidebar`, `AspectRatio`, `Combobox`, `DatePicker`, `NumberField`,
`Slider`, `FileUpload`.

The public API of these required components is stable: they are never renamed,
removed, or altered to make room for something else. Compound components expose
their documented static members (`Card.Header`, `Tabs.List`, `Select.Item`,
`Dialog.Content`, `FormField.Control`, `Section.Header`, `Toast.Viewport`,
`Avatar.Image`, `Breadcrumbs.List`, and so on) inside client components. Card
additionally publishes flat root exports for its parts (`CardHeader`,
`CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) so a Server
Component can render them; see [Client boundary](#client-boundary).

System B also implements nine optional capabilities with real behavior, local CSS,
and public exports:

- `Section` — a page region with `Header`, `Title`, `Description`, `Content`, and `Footer`.
- `Alert` — inline messages with `info`, `success`, `warning`, and `danger` variants.
- `Skeleton` — a decorative loading placeholder hidden from assistive technology.
- `Toast` — polite, pausable notifications with `Provider`, `Viewport`, `Root`, `Title`, `Description`, `Action`, and `Close`.
- `Avatar` — an image with an initials `Fallback`.
- `Breadcrumbs` — an accessible navigation trail with `List`, `Item`, `Link`, and `Current`.
- `Metric` — a compact, labelled statistic with supporting context.
- `Timeline` — an ordered sequence of events.
- `EmptyState` — a neutral "nothing here yet" placeholder with `Title`, `Description`, and `Action`.

Optional components that are not listed here are simply unavailable; this package
never ships empty stubs. The `Button` keeps its existing name, import, variants, and
sizes; its declared `depth`/`motion` treatment (offset shadow, hover lift, press-in,
reduced-motion aware) lives in the package's button stylesheet. Variants, sizes,
compound members, and usage rules for every
component are published in the generated manifest at
`@prism-system/ui-system-b/manifest` — that is the single source of truth, not this
list. See the states, variants, and examples in the live catalog at
**`/showcase/system-b`**, or read them offline with `prism-ds components <name>`.

## System extensions

System B ships two purpose-built public exports outside the shared contract. They are
declared in `manifest.extensions` with an API version and effects; the standard package
root and `./tokens` never import them. Availability is only the presence of the
extension in the installed manifest.

### KeyboardScene (`./custom/keyboard-scene`)

A controlled, procedurally drawn 3D keyboard explorer (`apiVersion: 1`, effects `3d` and
`motion`, rendering `webgl`, static fallback, reduced-motion aware). Import it from its
declared entry:

```tsx
import { KeyboardScene } from "@prism-system/ui-system-b/custom/keyboard-scene";
import "@prism-system/ui-system-b/styles.css";
```

This entry needs optional graphics peers that the package root does not require:

```bash
# React 18 consumer
npm install three@^0.186.1 @react-three/fiber@^8.18.0

# React 19 consumer
npm install three@^0.186.1 @react-three/fiber@^9.8.1
```

Fiber 8 pairs with React 18, Fiber 9 with React 19; both peer ranges are declared
optional, and the ordinary interface works without them. The component keeps persistent
DOM key controls and a clear action, and falls back to a static pose when WebGL is
missing, initialization fails, the context is lost, or the page is hidden. Its props
stay independent of Three.js and Fiber: `selectedKey`, `onSelectedKeyChange`,
`reducedMotion?`. See
[docs/extensions/keyboard-scene.md](./docs/extensions/keyboard-scene.md) and the
[runnable example](./examples/keyboard-scene.md).

### InteractiveWorkflowMap (`./custom/interactive-workflow-map`)

A controlled DOM pattern with no additional runtime requirements (`apiVersion: 1`,
effects `motion`, rendering `dom`, reduced-motion aware). It renders an ordered path of
native buttons, reports selection through `onSelectedNodeChange`, and wraps to a narrow
layout.

```tsx
import { InteractiveWorkflowMap } from "@prism-system/ui-system-b/custom/interactive-workflow-map";
import "@prism-system/ui-system-b/styles.css";
```

See
[docs/extensions/interactive-workflow-map.md](./docs/extensions/interactive-workflow-map.md)
and the [runnable example](./examples/interactive-workflow-map.md). `prism-ds components`
lists both extensions with their import paths and requirements, and
`prism-ds check --entry KeyboardScene` validates the selected entry's peers offline.

## Usage rules

- **Identity:** the visual source of truth is `@prism-system/ui-system-b` at the
  installed version.
- **Available UI:** the twenty-nine required components, the nine optional
  capabilities above, their compound members, and the tokens from
  `@prism-system/ui-system-b/tokens`.
- **Compose with props.** Prefer existing components over local replacements, and use
  component props rather than class overrides.
- **Layout stays in the product.** `grid`, `flex`, `gap`, positioning, and responsive
  rules are the product's job; the visual language stays here.
- **Strict usage** disallows arbitrary colors, radius values, and shadows, duplicated
  primitives, large visual overrides, and local replacements for components that
  already exist here.
- **Extension:** reusable visual patterns belong in the design system; product and
  feature components stay in the product and are composed from these primitives.
- **System extensions:** `KeyboardScene` and `InteractiveWorkflowMap` are imported from
  their own declared entrypoints and are not part of the shared contract; install their
  optional peers only when the selected entry needs them.
- **Versioning:** `package.json.version` is authoritative; the manifest, the registry
  entry, and the runtime `DesignSystem.version` must match it.

## Development

```bash
pnpm build
pnpm typecheck
pnpm lint
```

`tokens.source.json` is the single source of truth for colors, typography,
spacing, containers, breakpoints, layers, radius, shadows, and motion. Regenerate
the TypeScript token export, the CSS variables, the Tailwind bridge, and the
manifest with:

```bash
pnpm ds:manifest system-b --write
```

Generated token artifacts (`src/tokens/index.ts`, `src/styles/tokens.css`,
`src/styles/tailwind.css`) and `design-system.json` are never hand-edited.
Component styles live in each `src/components/<component>/` folder and read the
generated CSS variables.

## Manifest and version

Every installed System B package ships a generated `design-system.json` manifest,
available at `@prism-system/ui-system-b/manifest`. It is `schemaVersion: 5` and
records the current contract (`contractVersion: 4`), the exact package version, the
component catalog, variants, sizes, compound members, declared effects, token names, and
the strict usage rules for this system. It also carries the required `entrypoints` map
with package.json-derived dependency/peer requirements (including the optional peers of
`./custom/keyboard-scene`) and the `extensions` records for `KeyboardScene` and
`InteractiveWorkflowMap`. The manifest also carries the canonical
`capabilities.categories` inventory (`composition`, `forms`, `data-display`)
shared by every system: it maps component names to categories, not to availability.
A contract component is available only when its name is a key in
`manifest.components`; a custom extension is available only when declared in
`manifest.extensions`. Derive category availability by intersecting the two, and
remember that categories do not cover every component. The package-owned
`design-system.source.json` is `schemaVersion: 4` and must never declare a `capabilities`
block. Regenerate the
manifest with `pnpm ds:manifest system-b --write` after changing the package-owned
`design-system.source.json`. Readers built for `schemaVersion: 4` must be upgraded
in lockstep: current `prism-ds` requires schema 5 and rejects schema 4, and an older
`prism-ds` cannot read a schema-5 manifest. After `changeset version` changes
`package.json.version`, run `pnpm ds:sync-versions` from the monorepo root to
align the runtime version, the generated manifest, and the registry entry;
`pnpm ds:sync-versions --check` fails without writing when they drift.
