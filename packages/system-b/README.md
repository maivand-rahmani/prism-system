# @prism-system/ui-system-b

System B is the sharp, expressive option in the Maivand component family: night
surfaces, electric coral actions, cyan focus cues, and confident physical motion.
It is a V4 design system for products with a strong point of view and a little
more visual voltage.

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
ship with this package and use only required V4 components.

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

The package root always exports the twenty required V4 components, in canonical
order:

`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`,
`Heading`, `Text`, `Link`, `Container`, `Stack`, `FormField`.

The fourteen V2 components keep their existing public API. Compound components expose
their documented static members (`Card.Header`, `Tabs.List`, `Select.Item`,
`Dialog.Content`, `FormField.Control`, `Section.Header`, `Toast.Viewport`,
`Avatar.Image`, `Breadcrumbs.List`, and so on).

System B also implements six optional V4 capabilities with real behavior, local CSS,
and public exports:

- `Section` — a page region with `Header`, `Title`, `Description`, `Content`, and `Footer`.
- `Alert` — inline messages with `info`, `success`, `warning`, and `danger` variants.
- `Skeleton` — a decorative loading placeholder hidden from assistive technology.
- `Toast` — polite, pausable notifications with `Provider`, `Viewport`, `Root`, `Title`, `Description`, `Action`, and `Close`.
- `Avatar` — an image with an initials `Fallback`.
- `Breadcrumbs` — an accessible navigation trail with `List`, `Item`, `Link`, and `Current`.

Optional components that are not listed here are simply unavailable; this package
never ships empty stubs. Variants, sizes, compound members, and usage rules for every
component are published in the generated manifest at
`@prism-system/ui-system-b/manifest` — that is the single source of truth, not this
list. See the states, variants, and examples in the live catalog at
**`/showcase/system-b`**, or read them offline with `prism-ds components <name>`.

## Usage rules

- **Identity:** the visual source of truth is `@prism-system/ui-system-b` at the
  installed version.
- **Available UI:** the twenty required V4 components, the six optional capabilities
  above, their compound members, and the tokens from
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
available at `@prism-system/ui-system-b/manifest`. It records the exact package
version, the component catalog, variants, sizes, compound members, token names,
and the strict usage rules for this system. After `changeset version` changes
`package.json.version`, run `pnpm ds:sync-versions` from the monorepo root to
align the runtime version, the generated manifest, and the registry entry;
`pnpm ds:sync-versions --check` fails without writing when they drift.
