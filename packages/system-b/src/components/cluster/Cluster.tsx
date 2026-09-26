"use client";

import * as React from "react";
import { cn, type ClusterProps as CoreClusterProps } from "@prism-system/ui-core";

export type ClusterProps = CoreClusterProps;

/** A compact, wrapping row for related controls, tags, and inline actions. */
export const Cluster = React.forwardRef<HTMLDivElement, ClusterProps>(function Cluster(
  { className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("maivand-b-ui", "maivand-b-cluster", className)} {...props} />
  );
});
Cluster.displayName = "Cluster";
