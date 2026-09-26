"use client";

import * as React from "react";
import { cn, type CenterProps as CoreCenterProps } from "@prism-system/ui-core";

export type CenterProps = CoreCenterProps;

/** A quiet, width-bounded frame for reading and focused content. */
export const Center = React.forwardRef<HTMLDivElement, CenterProps>(function Center(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("maivand-b-ui", "maivand-b-center", className)} {...props} />;
});
Center.displayName = "Center";
