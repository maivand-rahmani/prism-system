# @prism-system/ui-system-a

System A is the quiet option in the Maivand component family: warm surfaces,
ink-led typography, fine borders, and restrained motion. It implements the
canonical **V4 contract** — twenty required components plus the optional
components this package explicitly ships.

## Design brief

- Summary: A calm, focused design system for clear editorial product interfaces.
- Visual direction: warm light surfaces, ink-led hierarchy, quiet borders,
  muted botanical-green accents, medium density, restrained motion.
- Avoid: harsh black-and-white contrast, heavy gradients, excessive glass,
  pill-heavy patterns, oversized display type, loud motion, decorative borders.

## Installation

```bash
pnpm add @prism-system/ui-system-a
```

The package is built for React 18+ and depends on `@prism-system/ui-core`.

## Quickstart

### Ordinary CSS

Import the stylesheet once, before any components render:

```tsx
import "@prism-system/ui-system-a/styles.css";
```

### Tailwind CSS v4

Tailwind v4 products add the standalone token bridge. Import order matters:
`tailwindcss` first, then the bridge, then the package styles.

```css
@import "tailwindcss";
@import "@prism-system/ui-system-a/tailwind.css";
@import "@prism-system/ui-system-a/styles.css";
```

The bridge does not import Tailwind itself; `prism-ds setup-tailwind --css <file>`
installs exactly this block in a consumer CSS file. Regular-CSS consumers need no
Tailwind.

### First screen

```tsx
import { Button, Card, FormField, Input } from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";

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

## Foundations

Values live only in this package's `tokens.source.json`; the generated artifacts are
the TypeScript token export (`@prism-system/ui-system-a/tokens`), the CSS variables
used by the components, and the Tailwind bridge. The same tokens feed the Foundations
section of the live catalog at **`/showcase/system-a`**.

- **themes** — light and dark semantic color trees: `text`, `surface`, `border`,
  `action`, `status`.
- **typography** — families, sizes, weights, line heights, letter spacing.
- **spacing** — scale plus semantic roles (`inline`, `inset`, `stack`, `section`).
- **containers** — tokenized content widths for `Container`.
- **breakpoints** — static build-time breakpoints.
- **layers** — z-index layers for overlays, modals, toasts, tooltips.
- **radius**, **shadow** — surface and elevation language.
- **motion** — durations and easing curves, including reduced-motion behavior.

In a consumer, `prism-ds tokens [group]` lists the semantic token names and their
CSS/Tailwind names from the shipped manifest without publishing values.

## Components

The package root always exports the twenty required V4 components, in canonical
order:

`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`,
`Heading`, `Text`, `Link`, `Container`, `Stack`, `FormField`.

The fourteen V2 components keep their existing public API. Compound components expose
their documented static members (`Card.Header`, `Tabs.List`, `Dialog.Content`,
`DropdownMenu.Item`, `FormField.Control`, and so on).

System A also implements these optional V4 capabilities: `Grid`, `Fieldset`
(`Fieldset.Legend`), `Alert` (`Alert.Title`, `Alert.Description`), `Progress`,
`Accordion` (`Item`, `Header`, `Trigger`, `Content`), `Pagination` (`List`, `Item`,
`Link`, `Previous`, `Next`, `Current`, `Ellipsis`), and `Table` (`Caption`,
`Header`, `Body`, `Footer`, `Row`, `Head`, `Cell`). Other optional V4 names are
not implemented by this package and are therefore unavailable.

Variants, sizes, compound members, and usage rules for every component are published
in the generated manifest at `@prism-system/ui-system-a/manifest` — that is the
single source of truth, not this list. See the states, variants, and examples in the
live catalog at **`/showcase/system-a`**, or read them offline with
`prism-ds components <name>`.

## Usage rules

- **Identity:** the visual source of truth is `@prism-system/ui-system-a` at the
  installed version.
- **Available UI:** the twenty required V4 components, the optional capabilities
  listed above, their compound members, and the tokens from
  `@prism-system/ui-system-a/tokens`.
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

Edit `tokens.source.json` as the source of truth, then regenerate the token
exports, CSS variables, and Tailwind bridge with
`pnpm ds:manifest system-a --write`. Generated token artifacts are not
hand-edited. Shared behavior comes from `@prism-system/ui-core`; System A owns the
calm, warm visual language.

## Manifest and version

Every installed System A package ships a generated `design-system.json` manifest,
available at `@prism-system/ui-system-a/manifest`. It records the exact package
version, the component catalog, variants, sizes, compound members, token names, and
the strict usage rules for this system. Regenerate the manifest with
`pnpm ds:manifest system-a --write` after changing the package-owned
`design-system.source.json`. After `changeset version` changes `package.json.version`,
run `pnpm ds:sync-versions` from the monorepo root to align the runtime version, the
generated manifest, and the registry entry; `pnpm ds:sync-versions --check` fails
without writing when they drift.
