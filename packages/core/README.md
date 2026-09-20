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

The eight required V1 components, described as TypeScript prop contracts:

```ts
import type {
  ButtonProps,
  InputProps,
  CardProps,
  BadgeProps,
  CheckboxProps,
  TabsProps,
  DialogProps,
  SelectProps,
} from "@prism-system/ui-core";
```

Compound components (`Card`, `Tabs`, `Dialog`, `Select`) also export their
sub-component prop types, e.g. `CardHeaderProps`, `TabsTriggerProps`,
`DialogContentProps`, `SelectItemProps`.

### Design system contract and registry

```ts
import {
  defineDesignSystem,
  createDesignSystemRegistry,
  REQUIRED_COMPONENTS,
  type DesignSystem,
  type DesignSystemComponents,
} from "@prism-system/ui-core";
```

`DesignSystemComponents` is the exact shape a system must implement. The registry
is data-driven so Showcase and Reference App can switch systems without changing
their JSX:

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
import { defineDesignSystem, useControllableState } from "@prism-system/ui-core";
import type { ButtonProps } from "@prism-system/ui-core";

function Button({ variant = "primary", ...props }: ButtonProps) {
  return <button data-variant={variant} {...props} />;
}

export const systemA = defineDesignSystem({
  id: "system-a",
  name: "System A",
  packageName: "@prism-system/ui-system-a",
  version: "0.0.0",
  components: {
    Button,
    // ...the other seven required components
  },
});
```

## Build

```bash
pnpm build       # emits dist/ with declarations
pnpm typecheck
pnpm lint
```

## Scope

V1 only. V2 factory tooling and V3 lifecycle/manifest tooling are intentionally
not implemented here; see `docs/v2` and `docs/v3`.
