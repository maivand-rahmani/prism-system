# @prism-system/ui-system-a

System A is the quiet option in the Maivand component family: warm surfaces,
ink-led typography, fine borders, and restrained motion. It is intended for
products where clarity and rhythm should stay in the foreground.

## Installation

```bash
pnpm add @prism-system/ui-system-a
```

Import the stylesheet once before rendering the components:

```tsx
import { Button, Card, Input } from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";
```

## Usage

```tsx
import { Button, Card } from "@prism-system/ui-system-a";
import "@prism-system/ui-system-a/styles.css";

export function Example() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Continue</Card.Title>
      </Card.Header>
      <Card.Content>
        <Button>Continue</Button>
      </Card.Content>
    </Card>
  );
}
```

## Package API

The package implements the canonical V2 contract. It exports these fourteen
components in canonical order:

- `Button`
- `Input`
- `Textarea`
- `Card`
- `Badge`
- `Checkbox`
- `RadioGroup`
- `Switch`
- `Select`
- `Tabs`
- `Dialog`
- `DropdownMenu`
- `Tooltip`
- `Separator`

Compound statics are attached to their roots, including `Card.Header`,
`RadioGroup.Item`, `RadioGroup.Indicator`, `Switch.Thumb`, `Select.Item`,
`Tabs.Trigger`, `Dialog.Content`, the full `DropdownMenu` compound API, and
`Tooltip.Provider`, `Tooltip.Trigger`, `Tooltip.Portal`, `Tooltip.Content`, and
`Tooltip.Arrow`. Design tokens are available from `@prism-system/ui-system-a/tokens`.

## Visual direction and design brief

System A is calm, minimal, and editorial: warm light surfaces, ink-led
typography, fine green-gray borders, quiet grouping, and restrained motion. It
keeps clarity and rhythm in the foreground with medium information density and
low visual noise. Avoid heavy gradients, excessive glass, pill-heavy patterns,
loud motion, and consuming-app styling overrides.

V2 is the only supported contract for this package. Shared behavior comes from
`@prism-system/ui-core`; System A owns the calm, warm visual language. Consuming
apps should compose these components rather than replace their appearance, and
must not import another design system or copy its component styling.
