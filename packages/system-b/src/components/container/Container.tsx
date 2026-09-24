"use client";

import * as React from "react";
import { cn, type ContainerProps as CoreContainerProps } from "@prism-system/ui-core";

export type ContainerProps = CoreContainerProps;

/** Container is the tokenized content-width wrapper. */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { className, as: asProp, ...props },
  ref,
) {
  const Comp = (asProp ?? "div") as React.ElementType;
  return (
    <Comp
      ref={ref}
      className={cn("maivand-b-ui", "maivand-b-container", className)}
      {...props}
    />
  );
});
Container.displayName = "Container";
