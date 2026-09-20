"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

import { cn } from "../utils/cn.js";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export { SelectPrimitive };

/**
 * Unstyled adapters over `@radix-ui/react-select`.
 *
 * Radix owns the combobox/listbox keyboard model, typeahead, collision-aware
 * positioning, and `aria-*` wiring. Core only merges `className`, maps the
 * contract's `size`/`invalid` semantics to `data-*`/`aria-invalid`, and adds
 * stable `data-slot` markers.
 *
 * `Select`, `SelectGroup`, and `SelectValue` are Radix components whose props
 * already match the V1 contract (`SelectProps`, `SelectGroupProps`,
 * `SelectValueProps`).
 */
export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export interface SelectTriggerBaseProps extends React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Trigger
> {
  size?: "sm" | "md" | "lg";
  /** Marks the control as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  /** Accepted for contract compatibility; rendered by `SelectValue`. */
  placeholder?: React.ReactNode;
}

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerBaseProps
>(function SelectTrigger(
  { className, size = "md", invalid = false, placeholder: _placeholder, ...props },
  ref,
) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      className={cn(className)}
      {...props}
    />
  );
});
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Content
      ref={ref}
      data-slot="select-content"
      className={cn(className)}
      {...props}
    />
  );
});
SelectContent.displayName = "SelectContent";

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      data-slot="select-label"
      className={cn(className)}
      {...props}
    />
  );
});
SelectLabel.displayName = "SelectLabel";

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Item ref={ref} data-slot="select-item" className={cn(className)} {...props} />
  );
});
SelectItem.displayName = "SelectItem";

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      data-slot="select-separator"
      className={cn(className)}
      {...props}
    />
  );
});
SelectSeparator.displayName = "SelectSeparator";
