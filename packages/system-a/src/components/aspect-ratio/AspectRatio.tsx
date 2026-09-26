import * as React from "react";
import { cn, type AspectRatioProps } from "@prism-system/ui-core";

export type { AspectRatioProps };

export const AspectRatio = React.forwardRef<HTMLDivElement, AspectRatioProps>(function AspectRatio(
  { className, ratio = 1, style, ...props },
  ref,
) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError("AspectRatio ratio must be a finite positive number.");
  }
  return (
    <div
      ref={ref}
      className={cn("maivand-a-ui", "maivand-a-aspect-ratio", className)}
      style={{ ...style, aspectRatio: ratio }}
      {...props}
    />
  );
});
AspectRatio.displayName = "AspectRatio";
