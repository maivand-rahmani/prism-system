"use client";

import * as React from "react";
import { cn, type AspectRatioProps as CoreAspectRatioProps } from "@prism-system/ui-core";

export type AspectRatioProps = CoreAspectRatioProps;

/** Reserve a stable frame before media or other content has loaded. */
export const AspectRatio = React.forwardRef<HTMLDivElement, AspectRatioProps>(function AspectRatio(
  { className, ratio = 1, style, ...props },
  ref,
) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError("AspectRatio requires a positive finite ratio.");
  }
  return (
    <div
      ref={ref}
      className={cn("maivand-b-ui", "maivand-b-aspect-ratio", className)}
      style={{ ...style, "--maivand-b-aspect-ratio": ratio } as React.CSSProperties}
      {...props}
    />
  );
});
AspectRatio.displayName = "AspectRatio";
