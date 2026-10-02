"use client";

import * as React from "react";
import { cn, type StackProps as CoreStackProps } from "@prism-system/ui-core";

export type StackProps = CoreStackProps;

/** Stack is the one-dimensional, token-gapped flow primitive. */
export const Stack = React.forwardRef<HTMLDivElement, StackProps>(function Stack(
  { className, as: asProp, direction = "vertical", wrap = false, ...props },
  ref,
) {
  // `as` is an intrinsic tag here; type the local render element from this
  // component's own props/ref instead of the Fiber-widened `React.ElementType`.
  const Comp = (asProp ?? "div") as React.ElementType as React.ComponentType<
    React.ComponentPropsWithoutRef<"div"> & React.RefAttributes<HTMLDivElement>
  >;
  return (
    <Comp
      ref={ref}
      className={cn(
        "maivand-b-ui",
        "maivand-b-stack",
        `maivand-b-stack-${direction}`,
        wrap && "maivand-b-stack-wrap",
        className,
      )}
      {...props}
    />
  );
});
Stack.displayName = "Stack";
