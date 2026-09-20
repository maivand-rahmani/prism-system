"use client";

import * as React from "react";

import { cn } from "../utils/cn.js";

/**
 * Structural base props for the shadcn-style Input.
 *
 * The native `size` attribute is omitted so `size` refers to the control size.
 * The full V1 `InputProps` contract adds `startAdornment`/`endAdornment` and
 * field chrome, which a design system wrapper owns.
 */
export interface InputBaseProps extends Omit<React.ComponentPropsWithoutRef<"input">, "size"> {
  size?: "sm" | "md" | "lg";
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputBaseProps>(function Input(
  { className, size = "md", invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      data-slot="input"
      data-size={size}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      className={cn(className)}
      {...props}
    />
  );
});
Input.displayName = "Input";
