# @prism-system/ui-core

Unstyled shared foundation for Maivand design systems.

`core` defines the contracts, shared types, utilities, accessibility helpers, and
common hooks that every design system builds on. It contains **no colors, tokens,
typography, spacing, radius, shadows, or component styling** — the visual language
belongs entirely to each `@prism-system/ui-system-*` package.

One current component contract is defined here: **twenty-nine required components
plus seventeen optional contracts**. A single `DesignSystem` type and a single
registry cover it, and the numeric `contractVersion: 4` identifies the contract
generation at runtime.

## Install

```bash
pnpm add @prism-system/ui-core
```

`react` and `react-dom` (>= 18) are peer dependencies.

## What it exports

### The component contract

The twenty-nine required components, described as TypeScript prop contracts:

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
  HeadingProps,
  TextProps,
  LinkProps,
  ContainerProps,
  StackProps,
  FormFieldProps,
  CenterProps,
  ClusterProps,
  SidebarProps,
  AspectRatioProps,
  ComboboxProps,
  DatePickerProps,
  NumberFieldProps,
  SliderProps,
  FileUploadProps,
} from "@prism-system/ui-core";
```

Compound components (`Card`, `RadioGroup`, `Switch`, `Select`, `Tabs`, `Dialog`,
`DropdownMenu`, `Tooltip`, `FormField`, `Combobox`) also export their sub-component
prop types, e.g. `CardHeaderProps`, `RadioGroupItemProps`, `SwitchThumbProps`,
`TabsTriggerProps`, `DialogContentProps`, `DropdownMenuContentProps`,
`TooltipContentProps`, `SelectItemProps`, `FormFieldControlProps`,
`ComboboxInputProps`, `ComboboxItemProps`.

### Optional contracts

Seventeen optional contracts are implemented only by systems that declare the
capability:

```ts
import type {
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
  MetricProps,
  DescriptionListProps,
  TimelineProps,
  MeterProps,
  EmptyStateProps,
} from "@prism-system/ui-core";
```

Optional compound contracts export their member prop types too
(`ToastViewportProps`, `TableRowProps`, `MetricValueProps`, `EmptyStateTitleProps`,
and so on). The contracts describe HTML semantics, state, keyboard interaction, and
required compound parts only: layout scales, variants, sizes, and examples belong to
the design system's descriptor and manifest.

Core also ships the unstyled `Combobox` primitive (`Combobox.Input`,
`Combobox.Content`, `Combobox.Item`) so every system composes the same
state/keyboard/ARIA foundation instead of re-implementing it.

### Design system contract and registry

```ts
import {
  defineDesignSystem,
  createDesignSystemRegistry,
  REQUIRED_COMPONENTS,
  OPTIONAL_COMPONENTS,
  type DesignSystem,
  type DesignSystemComponents,
  type DesignSystemComponentName,
  type DesignSystemComponent,
  type DesignSystemRegistry,
} from "@prism-system/ui-core";
```

`DesignSystemComponents` is the single shared map: the twenty-nine required
entries plus any optional entries a system declares. The registry is data-driven
so Showcase and Reference App can switch systems without changing their JSX:

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

A system declares all twenty-nine required components plus the optional components
it really implements, and the numeric `contractVersion: 4` marker. Every declared
key must be a real component; empty stubs are rejected by the registry guard:

```tsx
import { defineDesignSystem } from "@prism-system/ui-core";
import type { ButtonProps } from "@prism-system/ui-core";

function Button({ variant = "primary", ...props }: ButtonProps) {
  return <button data-variant={variant} {...props} />;
}

export const systemA = defineDesignSystem({
  id: "system-a",
  name: "System A",
  packageName: "@prism-system/ui-system-a",
  version: "0.0.0",
  contractVersion: 4,
  components: {
    Button,
    // ...all twenty-nine required components
    // optional names are added only when the package implements them
  },
});
```

`DesignSystem` requires the numeric `contractVersion: 4`. The registry rejects
unknown names, missing required components, and declared non-component values; an
omitted optional name is simply unavailable.

## Build

```bash
pnpm build       # emits dist/ with declarations
pnpm typecheck
pnpm lint
```

## Scope

Core owns the shared component contract (twenty-nine required plus seventeen
optional), their unstyled primitives, utilities, a11y helpers, and hooks. Factory
tooling (create-design-system skills, templates, generators, validation) and
manifest/lifecycle tooling are intentionally not implemented here; see
`docs/archive/` for archived material.
