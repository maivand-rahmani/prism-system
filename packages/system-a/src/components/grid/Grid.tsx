import * as React from "react";
import { cn, type GridProps } from "@prism-system/ui-core";

export type { GridProps };
export const Grid = React.forwardRef<HTMLDivElement, GridProps>(function Grid(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("maivand-a-ui", "maivand-a-grid", className)} {...props} />;
});
Grid.displayName = "Grid";
