"use client";

import * as React from "react";
import {
  Separator as SeparatorPrimitive,
  cn,
  type SeparatorProps as CoreSeparatorProps,
} from "@prism-system/ui-core";

export type SeparatorProps = CoreSeparatorProps;

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { className, ...props },
  ref,
) {
  return (
    <SeparatorPrimitive
      ref={ref}
      className={cn("maivand-b-ui maivand-b-separator", className)}
      {...props}
    />
  );
});
Separator.displayName = "Separator";
