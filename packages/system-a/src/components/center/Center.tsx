import * as React from "react";
import { cn, type CenterProps } from "@prism-system/ui-core";

export type { CenterProps };

/** Centers a content region while keeping its width and inset owned by System A. */
export const Center = React.forwardRef<HTMLDivElement, CenterProps>(function Center(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("maivand-a-ui", "maivand-a-center", className)} {...props} />;
});
Center.displayName = "Center";
