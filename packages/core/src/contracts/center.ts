import type { ComponentPropsWithoutRef } from "react";

/**
 * Center is a horizontal centering wrapper.
 *
 * It exposes no margin, padding, width, or layout-scale props: alignment and
 * gutters are visual decisions owned by the design system. Native `div` props
 * only; the rendered element is a plain container with no landmark semantics.
 */
export type CenterProps = ComponentPropsWithoutRef<"div">;
