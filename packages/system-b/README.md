# @prism-system/ui-system-b

System B is the sharp, expressive option in the Maivand component family:
night surfaces, electric coral actions, cyan focus cues, and confident motion.
It is intended for products with a strong point of view and a little more
visual voltage.

## Installation

```bash
pnpm add @prism-system/ui-system-b
```

Import the stylesheet once in the application entry point:

```tsx
import "@prism-system/ui-system-b/styles.css";
```

## Usage

```tsx
import { Button, Card, Input } from "@prism-system/ui-system-b";

export function Example() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Launch sequence</Card.Title>
      </Card.Header>
      <Card.Content>
        <Input label="Project name" placeholder="Enter a name" />
        <Button>Create project</Button>
      </Card.Content>
    </Card>
  );
}
```

The canonical V2 API contains exactly these 14 required components:
`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, and `Separator`.
V2 is the only supported component contract. Compound pieces are exported by
name and attached to their roots where applicable, including `Card.Header`,
`Card.Content`, `RadioGroup.Item`, `Switch.Thumb`, `Select.Item`,
`Tabs.Trigger`, `Dialog.Content`, `DropdownMenu.Item`, and `Tooltip.Content`.

## Design brief

System B is dark-first, high-contrast, and editorial: night surfaces carry
ink-bright text, electric coral is reserved for action, and cyan marks focus.
Compact radii, visible purple-gray lines, offset shadows, and confident physical
motion create an expressive interface without sacrificing keyboard clarity or
reduced-motion behavior. Avoid light-first palettes, generic SaaS styling,
pill-heavy layouts, heavy gradients, and consumer-app overrides.

## Manifest and version

Every installed System B package ships a generated `design-system.json` manifest,
available at `@prism-system/ui-system-b/manifest`. It records the exact package
version, the component catalog, variants, sizes, compound members, and the strict
usage rules for this system. `package.json.version` is authoritative, and the
manifest, the registry entry, and the runtime `DesignSystem.version` must always
match it. Regenerate the manifest with `pnpm ds:manifest system-b --write` after
changing the package-owned `design-system.source.json`. After `changeset version`
changes `package.json.version`, run `pnpm ds:sync-versions` from the monorepo
root to align the runtime version, the generated manifest, and the registry
entry; `pnpm ds:sync-versions --check` fails without writing when they drift.

## Consumer contract

- **Identity:** the visual source of truth is `@prism-system/ui-system-b` at the
  installed version.
- **Available UI:** the fourteen V2 components above, their compound members, and
  the tokens from `@prism-system/ui-system-b/tokens`.
- **Usage rules:** prefer existing components, use props rather than class
  overrides, and keep layout in the product while the visual language stays here.
- **Restrictions:** no arbitrary colors, radius, or shadows; no duplicated
  primitives; no local replacements for components that already exist here.
- **Extension:** reusable visual patterns belong in the design system; product
  and feature components stay in the product and are composed from these
  primitives.
