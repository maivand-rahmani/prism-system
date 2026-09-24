"use client";

import * as React from "react";
import { cn, type TextProps as CoreTextProps } from "@prism-system/ui-core";

export type TextProps = CoreTextProps;

/** Text is the shared body/inline text primitive; typography belongs to the system. */
export const Text = React.forwardRef<HTMLElement, TextProps>(function Text(
  { className, as: asProp, ...props },
  ref,
) {
  const Comp = (asProp ?? "p") as React.ElementType;
  return (
    <Comp ref={ref} className={cn("maivand-b-ui", "maivand-b-text", className)} {...props} />
  );
});
Text.displayName = "Text";
