import * as React from "react";
import { cn, type SidebarProps } from "@prism-system/ui-core";

export type { SidebarProps };

/** A two-part, naturally collapsing sidebar-and-content layout. */
export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(function Sidebar(
  { className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("maivand-a-ui", "maivand-a-sidebar", className)} {...props} />
  );
});
Sidebar.displayName = "Sidebar";
