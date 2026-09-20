"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../utils/cn.js";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export { TooltipPrimitive };

/**
 * Unstyled adapters over `@radix-ui/react-tooltip`.
 *
 * Radix owns `role="tooltip"`, the `aria-describedby` wiring from trigger to
 * content, open-delay coordination, Escape dismissal, and collision-aware
 * positioning. Core only merges `className` and adds stable `data-slot`
 * markers, leaving surface and motion values to the design system.
 *
 * The root and provider render no DOM of their own, so they are re-exported
 * directly from Radix rather than wrapped.
 */
export const Tooltip = TooltipPrimitive.Root;
export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipPortal = TooltipPrimitive.Portal;

export const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(function TooltipTrigger({ className, ...props }, ref) {
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      data-slot="tooltip-trigger"
      className={cn(className)}
      {...props}
    />
  );
});
TooltipTrigger.displayName = "TooltipTrigger";

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, ...props }, ref) {
  return (
    <TooltipPrimitive.Content
      ref={ref}
      data-slot="tooltip-content"
      className={cn(className)}
      {...props}
    />
  );
});
TooltipContent.displayName = "TooltipContent";

export const TooltipArrow = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Arrow>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Arrow>
>(function TooltipArrow({ className, ...props }, ref) {
  return (
    <TooltipPrimitive.Arrow
      ref={ref}
      data-slot="tooltip-arrow"
      className={cn(className)}
      {...props}
    />
  );
});
TooltipArrow.displayName = "TooltipArrow";
