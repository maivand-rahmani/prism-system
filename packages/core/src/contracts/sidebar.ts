import type { ComponentPropsWithoutRef } from "react";

/**
 * Sidebar is a layout wrapper for a side region next to main content.
 *
 * It deliberately renders a plain `div` and does **not** imply an `aside`
 * landmark: a design system that wants a complementary landmark must add the
 * semantics explicitly. The contract exposes no width, spacing, or layout-scale
 * props; sizing is a visual decision owned by the design system.
 */
export type SidebarProps = ComponentPropsWithoutRef<"div">;
