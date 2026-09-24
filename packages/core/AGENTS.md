# AGENTS.md — @prism-system/ui-core

Package-local instructions. Read the repository root `AGENTS.md` first.

## Identity

`@prism-system/ui-core` is the **unstyled** technical foundation shared by every design
system in this repository. It is not a design system and has no opinion about how
anything looks.

## Ownership

Core owns:

```text
component contracts (prop types)
shared types
the DesignSystem type and registry
utilities (cn, cva re-export, mergeProps, refs, dom)
accessibility helpers (focus, keys, announce, VisuallyHidden, reduced motion)
common hooks (state, disclosure, refs, events)
```

Core must never contain:

```text
colors
tokens
typography
spacing
radius
borders
shadows
surfaces
motion values
component appearance or variants
```

If a change would give core a visual opinion, it belongs in a design system package.

## Dependency rules

- Core imports only from `react`, the pinned `@radix-ui/react-*` primitives used by
  the unstyled foundation adapters, and its own `src`.
- Core must not import from `@prism-system/ui-system-*` or from `apps/*`.
- Runtime code that touches the DOM or React hooks must be marked `"use client"`.
- Relative imports inside `src` use explicit `.js` extensions (NodeNext output).

## The V2 contract (canonical)

The canonical V2 contract remains supported and unchanged. Exactly fourteen
components are required, in canonical order:

```text
Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
Tabs, Dialog, DropdownMenu, Tooltip, Separator
```

- `Button`, `Input`, `Textarea`, `Badge`, `Checkbox`, and `Separator` are single
  components.
- `Card`, `RadioGroup`, `Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, and
  `Tooltip` are compound components whose sub-components are attached as static members
  (`Card.Header`, `RadioGroup.Item`, `Switch.Thumb`, `Select.Item`, `Tabs.Trigger`,
  `Dialog.Content`, `DropdownMenu.Item`, `Tooltip.Content`).
- `DesignSystemComponents` is the canonical fourteen-entry map, with
  `DesignSystemComponentName`, `DesignSystemComponent`, and the exact
  `REQUIRED_COMPONENTS` tuple. The `DesignSystemComponentsV2`,
  `DesignSystemComponentNameV2`, `DesignSystemComponentV2`, and
  `REQUIRED_COMPONENTS_V2` names are exact source-compatible aliases.
- `DesignSystem` is V2-only and requires `componentContract: "v2"`.
  `defineDesignSystem` and `defineDesignSystemV2` both enforce the full fourteen-entry
  shape and marker; the registry rejects anything without the `"v2"` marker.
- Contract types live in `src/contracts`. The assembly of all fourteen lives in
  `src/design-system/components.ts`. Styling-agnostic contracts for the six added
  components live in `src/contracts` (`textarea`, `radio-group`, `switch`,
  `dropdown-menu`, `tooltip`, `separator`).
- Unstyled behavior-only adapters live in `src/primitives` and may re-export the
  corresponding Radix namespace. They add no colors, tokens, spacing, radius, shadows,
  surfaces, motion, or visual variants.
- `defineDesignSystemV2` and the V2 contract are allowed in core. V2 factory tooling
  (skills, templates, generators, validation) and V3 lifecycle tooling are **not** —
  keep them out of core.

## The V4 contract (additive)

V4 is an additional contract that coexists with V2. It never replaces, widens, or
weakens the canonical V2 contract. Exactly twenty components are required, in plan
order:

```text
Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
Tabs, Dialog, DropdownMenu, Tooltip, Separator, Heading, Text, Link, Container,
Stack, FormField
```

Twelve more are optional: `Grid`, `Section`, `Fieldset`, `Alert`, `Progress`,
`Skeleton`, `Toast`, `Accordion`, `Avatar`, `Breadcrumbs`, `Pagination`, `Table`.
A system implements only the optional components it declares; empty stubs are not
allowed.

- The V4 names are separate exports: `DesignSystemComponentsV4`,
  `DesignSystemComponentNameV4`, `DesignSystemComponentV4`, `REQUIRED_COMPONENTS_V4`,
  `OPTIONAL_COMPONENTS_V4`, `DesignSystemV4`, `DesignSystemRegistryV4`,
  `defineDesignSystemV4`, and `createDesignSystemRegistryV4`.
- `DesignSystemComponentsV4` is additive: the existing V2 names
  (`DesignSystemComponents`, `DesignSystemComponentName`, `DesignSystemComponent`,
  `REQUIRED_COMPONENTS`, `DesignSystem`, `defineDesignSystem`,
  `DesignSystemRegistry`, `createDesignSystemRegistry`) keep their exact V2 shape.
  The V4 registry has its own runtime guard that validates the `"v4"` marker and
  every required key; it never widens the V2 registry.
- V4 contract types live in `src/contracts` (`heading`, `text`, `link`,
  `container`, `stack`, `form-field`, and the twelve optional components). The V4
  assembly lives in `src/design-system/components.ts`, and the V4 type, helper,
  and registry live in `src/design-system/design-system.ts`.
- V4 stays unstyled: the added contracts use native React props and expose no
  colors, tokens, scales, variants, or spacing. `Grid`, `Container`, and `Stack`
  deliberately carry no layout-scale props; layout values remain in the design
  system.
- V4 factory and lifecycle tooling (generators, validation, manifests) is **not**
  part of core. Do not add it here.

## The V1 contract (historical, unsupported)

The historical eight-component V1 contract
(`Button`, `Input`, `Card`, `Badge`, `Checkbox`, `Tabs`, `Dialog`, `Select`) is no longer
supported. Do not restore it, create new V1 systems, or accept eight-component system
maps; migrate existing consumers to the canonical V2 contract instead.

## Accessibility expectations

Contract comments describe the required ARIA behavior. When extending a contract,
document the accessibility expectation next to the type. Reusable helpers in
`src/a11y` should be preferred over re-implementing focus, keys, or announcements.

## Changing core

1. Prefer additive, backwards-compatible contract changes.
2. A breaking contract change must be recorded with `pnpm changeset`.
3. Keep helpers dependency-light; avoid pulling styling libraries into core.
4. Run `pnpm build`, `pnpm typecheck`, and `pnpm lint` before finishing.

## Scope

Core owns the canonical fourteen-component V2 contract, the additive V4 contract
(twenty required plus twelve optional), their unstyled adapters, and the historical
V1 definitions kept only for migration history. The two contracts coexist: V4 is a
separate set of exports and a separate registry, and does not restore V1 or replace
V2. Do not add V2/V4 factory tooling (create-design-system skills, templates,
generators, validation) or V3/V4 manifest/lifecycle tooling to core.
