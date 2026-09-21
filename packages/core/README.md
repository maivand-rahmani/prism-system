# @prism-system/ui-core

Unstyled shared foundation for Maivand design systems.

`core` defines the contracts, shared types, utilities, accessibility helpers, and
common hooks that every design system builds on. It contains **no colors, tokens,
typography, spacing, radius, shadows, or component styling** — the visual language
belongs entirely to each `@prism-system/ui-system-*` package.

## Install

```bash
pnpm add @prism-system/ui-core
```

`react` (>= 19) is a peer dependency.

## What it exports

### Component contracts

The fourteen required V2 components, described as TypeScript prop contracts:

```ts
import type {
  ButtonProps,
  InputProps,
  TextareaProps,
  CardProps,
  BadgeProps,
  CheckboxProps,
  RadioGroupProps,
  SwitchProps,
  SelectProps,
  TabsProps,
  DialogProps,
  DropdownMenuProps,
  TooltipProps,
  SeparatorProps,
} from "@prism-system/ui-core";
```

Compound components (`Card`, `RadioGroup`, `Switch`, `Select`, `Tabs`, `Dialog`,
`DropdownMenu`, `Tooltip`) also export their sub-component prop types, e.g.
`CardHeaderProps`, `RadioGroupItemProps`, `SwitchThumbProps`, `TabsTriggerProps`,
`DialogContentProps`, `DropdownMenuContentProps`, `TooltipContentProps`,
`SelectItemProps`.

### Design system contract and registry

```ts
import {
  defineDesignSystemV2,
  createDesignSystemRegistry,
  REQUIRED_COMPONENTS,
  type DesignSystem,
  type DesignSystemComponents,
  type DesignSystemV2,
} from "@prism-system/ui-core";
```

`DesignSystemComponents` is the canonical fourteen-component shape every system must
implement. The registry is data-driven so Showcase and Reference App can switch systems
without changing their JSX:

```tsx
const registry = createDesignSystemRegistry([systemA, systemB]);
const system = registry.require("system-a");

const { Button, Card } = system.components;
```

### Utilities

```ts
import {
  cn,
  cva,
  composeRefs,
  mergeProps,
  canUseDOM,
  getOwnerDocument,
} from "@prism-system/ui-core";
```

- `cn` — conditionally join class names.
- `cva` / `VariantProps` — re-exported CVA conventions.
- `composeRefs` — merge several refs into one callback.
- `mergeProps` — slot-friendly prop merging (chained handlers, class names, styles).

### Accessibility helpers

```ts
import {
  VisuallyHidden,
  announce,
  getFocusableElements,
  focusFirst,
  Keys,
  useEscapeKey,
  useFocusTrap,
  useReducedMotion,
} from "@prism-system/ui-core";
```

### Hooks

```ts
import {
  useControllableState,
  useDisclosure,
  useEventCallback,
  useComposedRefs,
  useIsomorphicLayoutEffect,
} from "@prism-system/ui-core";
```

Hooks and browser helpers are client-only. Import them from client components
(`"use client"`).

## Implementing a design system

```tsx
import { defineDesignSystemV2 } from "@prism-system/ui-core";
import type { ButtonProps } from "@prism-system/ui-core";

function Button({ variant = "primary", ...props }: ButtonProps) {
  return <button data-variant={variant} {...props} />;
}

export const systemA = defineDesignSystemV2({
  id: "system-a",
  name: "System A",
  packageName: "@prism-system/ui-system-a",
  version: "0.0.0",
  componentContract: "v2",
  components: {
    Button,
    // ...the other thirteen required V2 components
  },
});
```

`DesignSystem` is V2-only and requires `componentContract: "v2"`. The historical
eight-component V1 contract is archived and unsupported; do not target it.

## Build

```bash
pnpm build       # emits dist/ with declarations
pnpm typecheck
pnpm lint
```

## Scope

The canonical fourteen-component V2 contract and its unstyled primitives. The historical
eight-component V1 contract is archived and unsupported. V2 factory tooling and V3
lifecycle/manifest tooling are intentionally not implemented here; see `docs/v2` and
`docs/v3`.
