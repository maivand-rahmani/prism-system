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
