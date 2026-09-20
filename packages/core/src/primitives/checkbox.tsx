"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";

import { cn } from "../utils/cn.js";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export { CheckboxPrimitive };

/**
 * Unstyled adapter over `@radix-ui/react-checkbox`.
 *
 * Radix owns the tri-state `checked`/`defaultChecked`/`onCheckedChange` model,
 * `role="checkbox"`, keyboard interaction, and the hidden form input. Core only
 * maps the contract's `size`/`invalid` semantics to `data-*`/`aria-invalid`
 * and merges the consumer `className`.
 */
export interface CheckboxBaseProps extends React.ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
> {
  /** Marks the control as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxBaseProps
>(function Checkbox({ className, invalid = false, size = "md", ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      data-size={size}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      className={cn(className)}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";
