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

## The shared component contract

There is exactly one current component contract. Exactly twenty-nine components are
required, in canonical order:

```text
Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
Tabs, Dialog, DropdownMenu, Tooltip, Separator, Heading, Text, Link, Container,
Stack, FormField, Center, Cluster, Sidebar, AspectRatio, Combobox, DatePicker,
NumberField, Slider, FileUpload
```

Seventeen more are optional: `Grid`, `Section`, `Fieldset`, `Alert`, `Progress`,
`Skeleton`, `Toast`, `Accordion`, `Avatar`, `Breadcrumbs`, `Pagination`, `Table`,
`Metric`, `DescriptionList`, `Timeline`, `Meter`, `EmptyState`.
A system implements only the optional components it declares; empty stubs are not
allowed, and an omitted optional name is simply unavailable.

- `Button`, `Input`, `Textarea`, `Badge`, `Checkbox`, `Separator`, `Heading`,
  `Text`, `Link`, `Container`, `Stack`, `Grid`, `Progress`, `Skeleton`,
  `Center`, `Cluster`, `Sidebar`, `AspectRatio`, `DatePicker`, `NumberField`,
  `Slider`, `FileUpload`, and `Meter` are single components.
- `Card`, `RadioGroup`, `Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`,
  `Tooltip`, `FormField`, `Combobox`, and the optional compound components
  (`Section`, `Fieldset`, `Alert`, `Toast`, `Accordion`, `Avatar`,
  `Breadcrumbs`, `Pagination`, `Table`, `Metric`, `DescriptionList`, `Timeline`,
  `EmptyState`) attach their sub-components as static members
  (`Card.Header`, `RadioGroup.Item`, `Switch.Thumb`, `Select.Item`, `Tabs.Trigger`,
  `Dialog.Content`, `DropdownMenu.Item`, `Tooltip.Content`, `FormField.Control`,
  `Combobox.Input`, `Metric.Value`).
- The public exports are neutral: `DesignSystemComponents`,
  `DesignSystemComponentName`, `DesignSystemComponent`, `REQUIRED_COMPONENTS`,
  `OPTIONAL_COMPONENTS`, `DesignSystem`, `defineDesignSystem`,
  `DesignSystemRegistry`, and `createDesignSystemRegistry`. There is one map and
  one registry; parallel versioned aliases and separate registries are not part of
  the API.
- `DesignSystem` requires the numeric `contractVersion: 4` marker.
  `defineDesignSystem` enforces the full twenty-nine-entry required shape (plus
  any declared optional subset); the registry rejects anything without the
  numeric marker, missing a required component, carrying an unknown name, or
  declaring a non-component value. Optional omission is allowed; an explicitly
  declared `null`/`undefined` value is not.
- Contract types live in `src/contracts`. The assembly of the full map lives in
  `src/design-system/components.ts`; the `DesignSystem` type, the definition
  helper, and the registry live in `src/design-system/design-system.ts`.
- Unstyled behavior-only adapters live in `src/primitives` and may re-export the
  corresponding Radix namespace or implement the behavior directly (Combobox).
  They add no colors, tokens, spacing, radius, shadows, surfaces, motion, or
  visual variants.
- The contract stays unstyled: the added contracts use native React props and
  expose no colors, tokens, scales, variants, or spacing. `Grid`, `Container`,
  `Stack`, `Center`, `Cluster`, and `Sidebar` deliberately carry no layout-scale
  props, and `AspectRatio` adds only the structural `ratio`; layout values remain
  in the design system.

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

Core owns the shared component contract (twenty-nine required plus seventeen
optional), their unstyled adapters, utilities, accessibility helpers, and hooks.
There is one map, one `DesignSystem` type, and one registry; do not add parallel
versioned aliases, string contract markers, or separate registries. Do not add
factory tooling (create-design-system skills, templates, generators, validation)
or manifest/lifecycle tooling to core.
