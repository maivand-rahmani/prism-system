/**
 * Shared, styling-agnostic types used by the component contracts.
 *
 * These types describe semantics only. They deliberately contain no concrete
 * token values, colors, spacing, or other visual decisions.
 */

/** Shared control sizes used across component contracts. */
export type Size = "sm" | "md" | "lg";

/** Shared orientation for components such as Tabs. */
export type Orientation = "horizontal" | "vertical";

/** Text direction. */
export type Direction = "ltr" | "rtl";

/** Logical side used by overlay-style components such as Select. */
export type Side = "top" | "right" | "bottom" | "left";

/** Alignment used by overlay-style components such as Select. */
export type Align = "start" | "center" | "end";

/**
 * Props shared by components that may delegate rendering to their child.
 * Implementations are expected to merge their own props with the child's.
 */
export interface AsChildProp {
  asChild?: boolean;
}
