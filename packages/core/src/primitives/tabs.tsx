"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "../utils/cn.js";

/** Raw Radix namespace, exposed for advanced composition in design systems. */
export { TabsPrimitive };

/**
 * Unstyled adapters over `@radix-ui/react-tabs`.
 *
 * Radix owns `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected`,
 * roving tabindex, and arrow-key navigation. Core only merges `className` and
 * adds stable `data-slot` markers. The root is Radix's `Root`, whose props
 * already match the V1 `TabsProps` contract (`value`, `defaultValue`,
 * `onValueChange`, `orientation`, `activationMode`, `dir`).
 */
export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List ref={ref} data-slot="tabs-list" className={cn(className)} {...props} />
  );
});
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-slot="tabs-trigger"
      className={cn(className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      data-slot="tabs-content"
      className={cn(className)}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";
