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

## The V1 contract (frozen)

Exactly eight components are required. This contract is **frozen for existing
systems**: do not rename, remove, or add required V1 entries. `DesignSystemComponents`,
`DesignSystemComponentName`, and `REQUIRED_COMPONENTS` must stay as they are so
System A, System B, Showcase, and Reference App keep compiling unchanged.

```text
Button, Input, Card, Badge, Checkbox, Tabs, Dialog, Select
```

- `Button`, `Input`, `Badge`, `Checkbox` are single components.
- `Card`, `Tabs`, `Dialog`, `Select` are compound components whose sub-components
  are attached as static members (`Card.Header`, `Tabs.Trigger`, `Dialog.Content`,
  `Select.Item`).
- Contract types live in `src/contracts`. The assembly of all eight lives in
  `src/design-system/components.ts` as `DesignSystemComponents`.

## The additive V2 contract

V2 adds a second, strictly additive contract alongside V1. It does not change or
replace `DesignSystemComponents`; new systems opt in and existing V1 systems are
unaffected.

Exactly fourteen components are required, in canonical order:

```text
Button, Input, Textarea, Card, Badge, Checkbox, RadioGroup, Switch, Select,
Tabs, Dialog, DropdownMenu, Tooltip, Separator
```

- `DesignSystemComponentsV2 extends DesignSystemComponents`, with
  `DesignSystemComponentNameV2`, `DesignSystemComponentV2`, and the exact
  `REQUIRED_COMPONENTS_V2` tuple.
- `DesignSystem` is generic with a V1 default; `DesignSystemV2` and
  `defineDesignSystemV2` express the V2 shape and marker. The registry stays
  defaulted to V1.
- Styling-agnostic V2 contracts live in `src/contracts` (`textarea`,
  `radio-group`, `switch`, `dropdown-menu`, `tooltip`, `separator`).
- Unstyled behavior-only adapters live in `src/primitives` and may re-export the
  corresponding Radix namespace. They add no colors, tokens, spacing, radius,
  shadows, surfaces, motion, or visual variants.
- `defineDesignSystemV2` and the V2 contract are allowed in core. V2 factory
  tooling (skills, templates, generators, validation) and V3 lifecycle tooling
  are **not** — keep them out of core.

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

Core owns the V1 contract and the additive V2 contract/adapters. Do not add V2
factory tooling (create-design-system skills, templates, generators, validation)
or V3 manifest/lifecycle tooling to core.
