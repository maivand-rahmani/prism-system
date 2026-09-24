# @prism-system/ui-system-b package rules

`@prism-system/ui-system-b` is an independent V4 design system. Keep its visual
language inside `tokens.source.json`, `src/styles`, and `src/components`;
consuming apps should compose the components rather than replace their appearance.

## Visual direction and design brief

System B is contrasty, expressive, and editorial in a different register. Keep
surfaces dark and ink-bright, reserve electric coral for action, use cyan for
focus, and let motion feel physical without becoming distracting. Compact radii,
visible purple-gray lines, layered night surfaces, and offset shadows are
intentional parts of the language. All visual decisions live in this package's
tokens and stylesheet; consuming apps should compose the components rather than
replace their visual language.

Avoid light-first palettes, low-contrast text, generic SaaS styling, pill-heavy
layouts, heavy gradients, decorative glass, and consumer-app or cross-system
overrides.

## Available components

The package always exports the twenty required V4 contract components, in
canonical order:

`Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
`Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`,
`Heading`, `Text`, `Link`, `Container`, `Stack`, `FormField`.

The fourteen V2 names keep their existing public API. These required exports are
fixed: never rename, remove, or alter one to make room for something else. Every
component lives in its own `src/components/<component>/` folder with `<Name>.tsx`,
`<kebab>.css`, and `index.ts`. Do not maintain a second component catalog here or in
`README.md`: variants, sizes, and compound members are published by the generated
`design-system.json` manifest (`@prism-system/ui-system-b/manifest`), and the live
catalog is the Showcase route `/showcase/system-b`.

Structural primitives take props, not visual variants: `Stack` uses
`direction="horizontal" | "vertical"` (plus optional `as` and `wrap`) and has no
`variant` prop; `Container` owns the tokenized content width.

## Optional capabilities

System B declares exactly six optional V4 components: `Section`, `Alert`,
`Skeleton`, `Toast`, `Avatar`, and `Breadcrumbs`. The twelve optional V4
contracts are capabilities, not stubs: only implement and declare an optional
component when it has real behavior, local CSS, and a public export. An omitted
optional name means it is unavailable. Do not add other optional components to
this package; after implementing one, regenerate the manifest so the declared set
and the Showcase stay in sync.

## Extension points

Improve the system here, and only here:

- `tokens.source.json` — colors, typography, spacing, containers, breakpoints,
  layers, radius, shadows, and motion. Regenerate the derived TypeScript token
  export, CSS variables, Tailwind bridge, and manifest with
  `pnpm ds:manifest system-b --write`; never hand-edit generated files.
- `src/styles` — the CSS entry that imports the generated tokens and each
  component stylesheet in canonical order.
- `src/components` — component appearance, variants, states, and optional
  additive components.

Additions must remain package-local and additive. Product-specific compositions
belong in consuming apps, while shared behavior and accessibility should come
from `@prism-system/ui-core` rather than duplicated primitives. Keep selectors
scoped under the `maivand-b-ui` root class.

## Package boundaries

System B may depend on `@prism-system/ui-core` and React only. It must not import
System A, another design system, app code, or app-owned styles. Consuming apps own
layout and composition; they must use System B props instead of copying its CSS,
overriding its visual language, or styling package internals.

## Consumer contract (V4)

`@prism-system/ui-system-b` is the visual source of truth for products that adopt
it. An external coding agent consuming this package must:

1. **Identify the system and version.** The installed package is
   `@prism-system/ui-system-b`. `package.json.version` is authoritative, and the
   generated `design-system.json` manifest (also exported as
   `@prism-system/ui-system-b/manifest`) records the same exact version, the
   component catalog, variants, sizes, compound members, token names, and the
   strict usage rules below. Read the manifest and this file before writing UI.
2. **Use the public API.** Import the twenty required V4 components from the
   package root and design tokens from `@prism-system/ui-system-b/tokens`. Import
   ordinary CSS from `@prism-system/ui-system-b/styles.css`; Tailwind v4 products
   may additionally load `@prism-system/ui-system-b/tailwind.css`. Never import
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
`DesignSystem.version` in `src/design-system.ts`, the generated
`design-system.json`, and the registry entry in `config/design-systems.json`.
`pnpm ds:sync-versions --check` reports drift without writing, and
`pnpm ds:check system-b` fails closed on any remaining mismatch.

For the repository lifecycle workflow, see `skills/use-design-system/SKILL.md`
(consume) and `skills/modify-design-system/SKILL.md` (evolve).
