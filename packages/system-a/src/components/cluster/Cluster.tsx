import * as React from "react";
import { cn, type ClusterProps } from "@prism-system/ui-core";

export type { ClusterProps };

/** A wrapping horizontal grouping with System A's quiet, consistent rhythm. */
export const Cluster = React.forwardRef<HTMLDivElement, ClusterProps>(function Cluster(
  { className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("maivand-a-ui", "maivand-a-cluster", className)} {...props} />
  );
});
Cluster.displayName = "Cluster";
