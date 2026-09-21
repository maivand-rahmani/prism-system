# @prism-system/ui-system-b package rules

## Visual direction and design brief

System B is contrasty, expressive, and editorial in a different register. Keep
surfaces dark and ink-bright, reserve electric coral for action, use cyan for
focus, and let motion feel physical without becoming distracting. Use the
existing `maivand-b-*` tokens and classes: compact radii, visible purple-gray
lines, layered night surfaces, and offset shadows are intentional parts of the
language. All visual decisions live in this package's tokens and stylesheet;
consuming apps should compose the components rather than replace their visual
language.

Avoid light-first palettes, low-contrast text, generic SaaS styling, pill-heavy
layouts, heavy gradients, decorative glass, and consumer-app or cross-system
overrides.

## V2 API and compound statics

The public API is the canonical fourteen-component V2 contract: `Button`, `Input`,
`Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`, `Switch`, `Select`, `Tabs`,
`Dialog`, `DropdownMenu`, `Tooltip`, and `Separator`. V2 is the only supported
contract; do not restore or target the historical eight-component V1 shape.

Required compound statics include `Card.Header`, `Card.Title`,
`Card.Description`, `Card.Content`, `Card.Footer`; `RadioGroup.Item` and
`RadioGroup.Indicator`; `Switch.Thumb`; all `Select` parts; `Tabs.List`,
`Tabs.Trigger`, `Tabs.Content`; all `Dialog` parts; all `DropdownMenu` parts
including `Sub`, `SubTrigger`, and `SubContent`; and `Tooltip.Provider`,
`Tooltip.Trigger`, `Tooltip.Portal`, `Tooltip.Content`, and `Tooltip.Arrow`.

## Extension and package boundaries

Shared behavior, accessibility, primitives, contracts, and class-name composition
come from `@prism-system/ui-core`; System B owns every color, type, radius,
shadow, state, and motion value. Add new reusable visual patterns additively in
this package, reusing core contracts and `cn` rather than changing consumers or
cross-system code. Keep selectors package-scoped under `maivand-b-*`. Consuming
apps own layout and composition only: do not style app surfaces, override
component internals, import another design system, or move System B tokens into
core.
