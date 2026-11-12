"use client";

import * as React from "react";
import { ToggleGroupPrimitive, cn } from "@prism-system/ui-core";

/**
 * Root props, matching Radix ToggleGroup: `type` ("single" | "multiple"), `value`,
 * `defaultValue`, `onValueChange`, `disabled`, `rovingFocus`, `orientation`, `loop`, `dir`.
 *
 * Accessibility: the group needs an accessible name supplied through `aria-label` or
 * `aria-labelledby`. Radix gives `type="single"` the `radiogroup` role, and
 * `type="multiple"` the `group` role with `aria-pressed` on each item.
 */
export type ToggleGroupProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>;

/**
 * Item props, matching Radix ToggleGroup.Item: `value` (required), `disabled`,
 * and `aria-label` for icon-only items. The label names the action the item performs.
 */
export type ToggleGroupItemProps = React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>;

const ToggleGroupRoot = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(function ToggleGroup({ className, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn("maivand-plr-ui maivand-plr-toggle-group", className)}
      {...props}
    />
  );
});
ToggleGroupRoot.displayName = "ToggleGroup";

/** Selected items lift onto paper and take a leaf mark; the state never relies on color alone. */
export const ToggleGroupItem = React.forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  ToggleGroupItemProps
>(function ToggleGroupItem({ className, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn("maivand-plr-toggle-group-item", className)}
      {...props}
    />
  );
});
ToggleGroupItem.displayName = "ToggleGroupItem";

export const ToggleGroup = Object.assign(ToggleGroupRoot, {
  Item: ToggleGroupItem,
});
