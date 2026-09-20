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

## The V1 contract

Exactly eight components are required. Do not rename, remove, or add required
entries without an explicit architecture decision:

```text
Button, Input, Card, Badge, Checkbox, Tabs, Dialog, Select
```

- `Button`, `Input`, `Badge`, `Checkbox` are single components.
- `Card`, `Tabs`, `Dialog`, `Select` are compound components whose sub-components
  are attached as static members (`Card.Header`, `Tabs.Trigger`, `Dialog.Content`,
  `Select.Item`).
- Contract types live in `src/contracts`. The assembly of all eight lives in
  `src/design-system/components.ts` as `DesignSystemComponents`.

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

V1 only. Do not add V2 creation tooling or V3 manifest/lifecycle tooling.
