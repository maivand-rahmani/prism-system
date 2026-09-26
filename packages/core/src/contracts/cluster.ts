import type { ComponentPropsWithoutRef } from "react";

/**
 * Cluster is a wrapping inline grouping wrapper (tags, actions, chips).
 *
 * It exposes no gap, alignment, or layout-scale props: those are visual
 * decisions owned by the design system. Native `div` props only; the rendered
 * element is a plain container with no landmark semantics.
 */
export type ClusterProps = ComponentPropsWithoutRef<"div">;
