"use client";

import * as React from "react";
import { cn, type SidebarProps as CoreSidebarProps } from "@prism-system/ui-core";

export type SidebarProps = CoreSidebarProps;

/** A resilient two-column frame that lets its main content shrink naturally. */
export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(function Sidebar(
  { className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("maivand-b-ui", "maivand-b-sidebar", className)} {...props} />
  );
});
Sidebar.displayName = "Sidebar";
