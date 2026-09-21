# System A package rules

System A is calm, minimal, and editorial. Keep surfaces warm and light,
contrast readable, borders quiet, and motion short. All visual decisions live
in this package's tokens and stylesheet; consuming apps should compose the
components rather than replace their visual language.

## Visual direction

- Summary: A calm, focused design system for clear editorial product interfaces.
- Direction: warm light surfaces, ink-led hierarchy, quiet borders, muted
  botanical-green accents, medium density, and restrained motion.
- Avoid: harsh black-and-white contrast, heavy gradients, excessive glass,
  pill-heavy patterns, oversized display type, loud motion, decorative borders,
  and consumer-app styling overrides.

The public API is the canonical fourteen-component V2 contract, in order:
`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`.
Compound statics such as `Card.Header`, `RadioGroup.Item`,
`RadioGroup.Indicator`, `Switch.Thumb`, `Select.Item`, `Tabs.Trigger`,
`Dialog.Content`, the full `DropdownMenu` API (`Trigger`, `Portal`, `Content`,
`Group`, `Label`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`,
`ItemIndicator`, `Separator`, `Arrow`, `Sub`, `SubTrigger`, `SubContent`), and
the full `Tooltip` API (`Provider`, `Trigger`, `Portal`, `Content`, `Arrow`)
are required and must be preserved. V2 is the only supported contract. Shared
behavior and class-name composition come from
`@prism-system/ui-core`; System A owns every color, type, radius, shadow, state, and
motion value. Do not import another design system or restyle components in an app.

The complete compound surface also includes `Card.Title`, `Card.Description`,
`Card.Content`, `Card.Footer`; `Select.Trigger`, `Select.Value`,
`Select.Content`, `Select.Group`, `Select.Label`, and `Select.Separator`;
`Tabs.List`, `Tabs.Trigger`, and `Tabs.Content`; and `Dialog.Trigger`,
`Dialog.Portal`, `Dialog.Overlay`, `Dialog.Header`, `Dialog.Footer`,
`Dialog.Title`, `Dialog.Description`, and `Dialog.Close`.

## Extension points

Improve the system only in its package-owned layers:

- `src/tokens` for colors, typography, spacing, radius, borders, shadows, and motion.
- `src/styles` for component surfaces, states, and composition rules.
- `src/components` for appearance, variants, states, and additive reusable patterns.

Additions must remain package-local and additive. Product-specific compositions
belong in consuming apps, while shared behavior and accessibility should come
from `@prism-system/ui-core` rather than duplicated primitives.

## Package boundaries

System A may depend on `@prism-system/ui-core` and React only. It must not import
System B, another design system, app code, or app-owned styles. Consuming apps own
layout and composition; they must use System A props instead of copying its CSS,
overriding its visual language, or styling package internals.
