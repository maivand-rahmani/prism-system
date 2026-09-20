"use client";

import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "../utils/cn.js";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export { SeparatorPrimitive };

/**
 * Unstyled adapter over `@radix-ui/react-separator`.
 *
 * Radix owns the `role="separator"`/`aria-orientation` semantics and the
 * decorative opt-out. Core only merges `className` and adds a stable
 * `data-slot` marker; border and background appearance belong to the design
 * system.
 */
export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator({ className, ...props }, ref) {
  return (
    <SeparatorPrimitive.Root ref={ref} data-slot="separator" className={cn(className)} {...props} />
  );
});
Separator.displayName = "Separator";
