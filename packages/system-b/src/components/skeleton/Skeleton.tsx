"use client";

import * as React from "react";
import { cn, type SkeletonProps as CoreSkeletonProps } from "@prism-system/ui-core";

export type SkeletonProps = CoreSkeletonProps;

/**
 * Skeleton is a decorative loading placeholder. It is always hidden from
 * assistive technology; the product announces the loading state elsewhere.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("maivand-b-ui", "maivand-b-skeleton", className)}
      {...props}
      aria-hidden="true"
    />
  );
});
Skeleton.displayName = "Skeleton";
