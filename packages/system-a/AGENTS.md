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

## Consumer contract (V3)

`@prism-system/ui-system-a` is the visual source of truth for products that adopt
it. An external coding agent consuming this package must:

1. **Identify the system and version.** The installed package is
   `@prism-system/ui-system-a`. `package.json.version` is authoritative, and the
   generated `design-system.json` manifest (also exported as
   `@prism-system/ui-system-a/manifest`) records the same exact version, the
   component catalog, variants, sizes, compound members, and the strict usage
   rules below. Read the manifest and this file before writing UI.
2. **Use the public API.** Import the fourteen V2 components from the package
   root and design tokens from `@prism-system/ui-system-a/tokens`. Never import
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
--check` reports drift without writing, and `pnpm ds:check system-a` fails
closed on any remaining mismatch.

For the repository lifecycle workflow, see `skills/use-design-system/SKILL.md`
(consume) and `skills/modify-design-system/SKILL.md` (evolve).
