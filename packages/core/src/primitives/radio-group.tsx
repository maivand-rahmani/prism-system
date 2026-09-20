"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "../utils/cn.js";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export { RadioGroupPrimitive };

/**
 * Unstyled adapters over `@radix-ui/react-radio-group`.
 *
 * Radix owns `role="radiogroup"`/`role="radio"`, `aria-checked`, roving focus,
 * and arrow-key navigation. Core only merges `className` and adds stable
 * `data-slot` markers, leaving surface, size, and checked/unchecked appearance
 * to the design system.
 */
export const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Root
      ref={ref}
      data-slot="radio-group"
      className={cn(className)}
      {...props}
    />
  );
});
RadioGroup.displayName = "RadioGroup";

export const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      data-slot="radio-group-item"
      className={cn(className)}
      {...props}
    />
  );
});
RadioGroupItem.displayName = "RadioGroupItem";

export const RadioGroupIndicator = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Indicator>
>(function RadioGroupIndicator({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Indicator
      ref={ref}
      data-slot="radio-group-indicator"
      className={cn(className)}
      {...props}
    />
  );
});
RadioGroupIndicator.displayName = "RadioGroupIndicator";
