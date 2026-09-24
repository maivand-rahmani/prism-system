import type { ComponentPropsWithoutRef } from "react";

/**
 * Grid is a native layout container.
 *
 * It exposes no column, gap, or layout-scale props: the grid template and
 * spacing are visual decisions owned by the design system (or composition
 * owned by the product through CSS/Tailwind). Native `div` props only.
 */
export type GridProps = ComponentPropsWithoutRef<"div">;
