"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "../utils/cn.js";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export { SwitchPrimitive };

export interface SwitchBaseProps extends React.ComponentPropsWithoutRef<
  typeof SwitchPrimitive.Root
> {
  /** Marks the control as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * Unstyled adapters over `@radix-ui/react-switch`.
 *
 * Radix owns `role="switch"`, `aria-checked`, keyboard toggling, and the hidden
 * form input. Core only maps the contract's `size`/`invalid` semantics to
 * `data-*`/`aria-invalid` and merges `className`. `Switch.Thumb` is a plain
 * movable indicator with no behavior or visual values.
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchBaseProps
>(function Switch({ className, invalid = false, size = "md", ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      data-size={size}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      className={cn(className)}
      {...props}
    />
  );
});
Switch.displayName = "Switch";

export const SwitchThumb = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Thumb>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Thumb>
>(function SwitchThumb({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Thumb
      ref={ref}
      data-slot="switch-thumb"
      className={cn(className)}
      {...props}
    />
  );
});
SwitchThumb.displayName = "SwitchThumb";
