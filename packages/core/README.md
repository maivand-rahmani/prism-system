# @prism-system/ui-core

Unstyled shared foundation for Maivand design systems.

`core` defines the contracts, shared types, utilities, accessibility helpers, and
common hooks that every design system builds on. It contains **no colors, tokens,
typography, spacing, radius, shadows, or component styling** — the visual language
belongs entirely to each `@prism-system/ui-system-*` package.

Two component contracts coexist here: the canonical **V2** contract (fourteen
components, unchanged) and the additive **V4** contract (twenty required components
plus twelve optional contracts). V4 adds a separate set of exports and a separate
registry; it never widens or replaces V2.

## Install

```bash
pnpm add @prism-system/ui-core
```

`react` and `react-dom` (>= 18) are peer dependencies.

## What it exports

### The V2 component contract

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

### The V4 component contract (additive)

V4 reuses the fourteen V2 prop contracts unchanged and adds prop types for six more
required components and twelve optional contracts:

```ts
import type {
  // six added required components
  HeadingProps,
  TextProps,
  LinkProps,
  ContainerProps,
  StackProps,
  FormFieldProps,
  // optional contracts, implemented only by systems that declare them
  GridProps,
  SectionProps,
  FieldsetProps,
  AlertProps,
  ProgressProps,
  SkeletonProps,
  ToastProps,
  AccordionProps,
  AvatarProps,
  BreadcrumbsProps,
  PaginationProps,
  TableProps,
} from "@prism-system/ui-core";
```

Compound V4 contracts export their member prop types too (`FormFieldLabelProps`,
`FormFieldControlProps`, `ToastViewportProps`, `TableRowProps`, and so on). The V4
contracts describe HTML semantics, state, keyboard interaction, and required
compound parts only: layout scales, variants, sizes, and examples belong to the
design system's descriptor and manifest.

### Design system contract and registries

```ts
import {
  // V2
  defineDesignSystemV2,
  createDesignSystemRegistry,
  REQUIRED_COMPONENTS,
  type DesignSystem,
  type DesignSystemComponents,
  type DesignSystemV2,
  // V4 (separate layer)
  defineDesignSystemV4,
  createDesignSystemRegistryV4,
  REQUIRED_COMPONENTS_V4,
  OPTIONAL_COMPONENTS_V4,
  type DesignSystemV4,
  type DesignSystemComponentsV4,
} from "@prism-system/ui-core";
```

`DesignSystemComponents` is the canonical fourteen-entry V2 shape;
`DesignSystemComponentsV4` is the twenty-entry required V4 shape plus any optional
components a system declares. The registries are data-driven so Showcase and
Reference App can switch systems without changing their JSX:

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

A V2 system declares the fourteen-entry map and the `"v2"` marker:

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

A V4 system declares all twenty required components plus the optional components it
really implements, and the `"v4"` marker. Every declared key must be a real component;
empty stubs are rejected by the V4 registry guard:

```tsx
import { defineDesignSystemV4 } from "@prism-system/ui-core";

export const systemAV4 = defineDesignSystemV4({
  id: "system-a",
  name: "System A",
  packageName: "@prism-system/ui-system-a",
  version: "0.0.0",
  componentContract: "v4",
  components: {
    Button,
    // ...all twenty required V4 components
    // optional names are added only when the package implements them
  },
});
```

`DesignSystem` is V2-only and requires `componentContract: "v2"`;
`DesignSystemV4` requires `"v4"`. The historical eight-component V1 contract is
archived and unsupported; do not target it.

## Build

```bash
pnpm build       # emits dist/ with declarations
pnpm typecheck
pnpm lint
```

## Scope

Core owns the canonical fourteen-component V2 contract, the additive V4 contract
(twenty required plus twelve optional), their unstyled primitives, utilities, a11y
helpers, and hooks. The historical eight-component V1 contract is archived and
unsupported. V2/V4 factory tooling (create-design-system skills, templates,
generators, validation) and manifest/lifecycle tooling are intentionally not
implemented here; see `docs/archive/v2` and `docs/archive/v3`.
