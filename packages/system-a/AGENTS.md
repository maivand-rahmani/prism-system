# System A package rules

`@prism-system/ui-system-a` is an independent V4 design system. System A is calm,
minimal, and editorial. Keep surfaces warm and light, contrast readable, borders
quiet, and motion short. All visual decisions live in this package's tokens and
stylesheets; consuming apps should compose the components rather than replace
their visual language.

## Visual direction

- Summary: A calm, focused design system for clear editorial product interfaces.
- Direction: warm light surfaces, ink-led hierarchy, quiet borders, muted
  botanical-green accents, medium density, and restrained motion.
- Avoid: harsh black-and-white contrast, heavy gradients, excessive glass,
  pill-heavy patterns, oversized display type, loud motion, decorative borders,
  and consumer-app styling overrides.

## Available components

The package always exports the twenty required V4 contract components, in canonical
order:

`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`,
`Heading`, `Text`, `Link`, `Container`, `Stack`, `FormField`.

The fourteen V2 names keep their existing public API. These required exports are
fixed: never rename, remove, or alter one to make room for something else. Do not
maintain a second component catalog here or in `README.md`: variants, sizes, and
compound members are published by the generated `design-system.json` manifest
(`@prism-system/ui-system-a/manifest`), and the live catalog is the Showcase route
`/showcase/system-a`.

## Optional additions

System A declares these optional V4 capabilities, and only these: `Grid`, `Fieldset`,
`Alert`, `Progress`, `Accordion`, `Pagination`, and `Table`. Optional components are
real capabilities, not stubs; an omitted optional name means it is unavailable. Do not
add another optional component without implementing real behavior, local CSS, a public
export, a runtime entry, and a descriptor entry — then regenerate the manifest so the
declared set and the Showcase stay in sync.

## Extension points

Improve the system here, and only here:

- `tokens.source.json` — colors, typography, spacing, containers, breakpoints,
  layers, radius, shadows, and motion. Regenerate derived token artifacts with
  `pnpm ds:manifest system-a --write`; never hand-edit generated files.
- `src/styles` — base scope, surface, state, and composition rules.
- `src/components` — component appearance, variants, states, and optional
  additive components. Each component lives in its own
  `src/components/<kebab>/` folder with `<Name>.tsx`, `<kebab>.css`, and
  `index.ts`.

Additions must remain package-local and additive. Product-specific compositions
belong in consuming apps, while shared behavior and accessibility should come
from `@prism-system/ui-core` rather than duplicated primitives.

## Rules

1. Use `@prism-system/ui-core` primitives, contract types, and `cn` before
   writing a new primitive.
2. Keep every visual decision — colors, typography, spacing, radius, borders,
   shadows, states, motion — in this package. Consume the system through props,
   not through className overrides.
3. Do not import another design system or app code. Use only
   `@prism-system/ui-core` and React.
4. Avoid arbitrary colors, radii, and shadows, and do not duplicate primitives
   that core already provides.
5. Preserve compound static members and normalize optional Radix `forceMount`
   values before passing them to primitives.

## Consumer contract (V4)

`@prism-system/ui-system-a` is the visual source of truth for products that adopt
it. An external coding agent consuming this package must:

1. **Identify the system and version.** The installed package is
   `@prism-system/ui-system-a`. `package.json.version` is authoritative, and the
   generated `design-system.json` manifest (also exported as
   `@prism-system/ui-system-a/manifest`) records the same exact version, the
   component catalog, variants, sizes, compound members, and the strict usage
   rules below. Read the manifest and this file before writing UI.
2. **Use the public API.** Import the twenty required V4 components from the
   package root and design tokens from `@prism-system/ui-system-a/tokens`.
   Import ordinary CSS from `@prism-system/ui-system-a/styles.css`; Tailwind v4
   products may additionally load `@prism-system/ui-system-a/tailwind.css`. Never
   import package internals or paths that are not part of the `exports` map.
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
`DesignSystem.version` in `src/design-system.ts`, the generated
`design-system.json`, and the registry entry in `config/design-systems.json`.
`pnpm ds:sync-versions --check` reports drift without writing, and
`pnpm ds:check system-a` fails closed on any remaining mismatch.

For the repository lifecycle workflow, see `skills/use-design-system/SKILL.md`
(consume) and `skills/modify-design-system/SKILL.md` (evolve).
