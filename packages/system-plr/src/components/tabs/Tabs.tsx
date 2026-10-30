"use client";

import * as React from "react";
import {
  Tabs as TabsPrimitive,
  TabsContent as TabsContentPrimitive,
  TabsList as TabsListPrimitive,
  TabsTrigger as TabsTriggerPrimitive,
  cn,
  type TabsContentProps as CoreTabsContentProps,
  type TabsListProps as CoreTabsListProps,
  type TabsProps as CoreTabsProps,
  type TabsTriggerProps as CoreTabsTriggerProps,
} from "@prism-system/ui-core";

export type TabsProps = CoreTabsProps;
function TabsRoot({ className, orientation = "horizontal", ...props }: TabsProps) {
  return (
    <TabsPrimitive
      orientation={orientation}
      className={cn("maivand-plr-ui maivand-plr-tabs", className)}
      {...props}
    />
  );
}
export type TabsListProps = CoreTabsListProps;
export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { className, ...props },
  ref,
) {
  return (
    <TabsListPrimitive ref={ref} className={cn("maivand-plr-tabs-list", className)} {...props} />
  );
});
export type TabsTriggerProps = CoreTabsTriggerProps;
export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  function TabsTrigger({ className, ...props }, ref) {
    return (
      <TabsTriggerPrimitive
        ref={ref}
        className={cn("maivand-plr-tabs-trigger", className)}
        {...props}
      />
    );
  },
);
export type TabsContentProps = CoreTabsContentProps;
export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(function TabsContent(
  { className, forceMount, ...props },
  ref,
) {
  return (
    <TabsContentPrimitive
      ref={ref}
      className={cn("maivand-plr-tabs-content", className)}
      {...props}
      {...(forceMount ? { forceMount: true } : {})}
    />
  );
});
export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});
TabsList.displayName = "TabsList";
TabsTrigger.displayName = "TabsTrigger";
TabsContent.displayName = "TabsContent";
