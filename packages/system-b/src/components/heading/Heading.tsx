"use client";

import * as React from "react";
import { cn, type HeadingProps as CoreHeadingProps } from "@prism-system/ui-core";

export type HeadingProps = CoreHeadingProps;

/**
 * Heading renders the native `h1`-`h6` element selected by the required
 * `level`. The level is semantic; the visual size is owned by this system.
 */
export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { className, level, ...props },
  ref,
) {
  // `level` selects a native heading; type the local render element from this
  // component's own props/ref instead of the Fiber-widened `React.ElementType`.
  const Tag = `h${level}` as React.ElementType as React.ComponentType<
    React.ComponentPropsWithoutRef<"h1"> & React.RefAttributes<HTMLHeadingElement>
  >;
  return (
    <Tag
      ref={ref}
      className={cn("maivand-b-ui", "maivand-b-heading", `maivand-b-heading-${level}`, className)}
      {...props}
    />
  );
});
Heading.displayName = "Heading";
