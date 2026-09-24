import type { ComponentPropsWithoutRef } from "react";

/**
 * Skeleton is a decorative placeholder.
 *
 * It is hidden from assistive technology, so `aria-hidden` may only be `true`.
 * The loading state itself must be announced elsewhere by the product; a
 * skeleton never carries content or meaning.
 */
export type SkeletonProps = Omit<ComponentPropsWithoutRef<"div">, "aria-hidden"> & {
  "aria-hidden"?: true;
};
