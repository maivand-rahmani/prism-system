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

## Consumer contract (V3)

`@prism-system/ui-system-b` is the visual source of truth for products that adopt
it. An external coding agent consuming this package must:

1. **Identify the system and version.** The installed package is
   `@prism-system/ui-system-b`. `package.json.version` is authoritative, and the
   generated `design-system.json` manifest (also exported as
   `@prism-system/ui-system-b/manifest`) records the same exact version, the
   component catalog, variants, sizes, compound members, and the strict usage
   rules below. Read the manifest and this file before writing UI.
2. **Use the public API.** Import the fourteen V2 components from the package
   root and design tokens from `@prism-system/ui-system-b/tokens`. Never import
   package internals or paths that are not part of the `exports` map.
3. **Keep the visual language here.** Colors, typography, spacing, radius,
   borders, shadows, surfaces, states, variants, and motion belong to this
   package. Consumers compose with props; they must not restyle components or
   copy package CSS.

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

### Extension rules

A new pattern belongs to this package only when it is a reusable visual pattern
shared across the product. Product-specific and feature components stay in the
consuming app and are composed from these primitives. Additions must be
additive, package-local, and must never rename, remove, or alter a required
export.

### Version synchronization

`package.json.version` is authoritative. After `changeset version` rewrites it,
run `pnpm ds:sync-versions` from the monorepo root to align the runtime
`DesignSystem.version` in `src/index.ts`, the generated `design-system.json`, and
the registry entry in `config/design-systems.json`. `pnpm ds:sync-versions
--check` reports drift without writing, and `pnpm ds:check system-b` fails
closed on any remaining mismatch.
