"use client";

import * as React from "react";
import { Badge as BadgePrimitive, cn, type BadgeProps as CoreBadgeProps } from "@prism-system/ui-core";

export type BadgeProps = CoreBadgeProps;

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "default", size = "md", dot = false, asChild = false, children, ...props },
  ref,
) {
  const content =
    dot && !asChild ? (
      <>
        <span className="maivand-b-badge-dot" aria-hidden="true" /> {children}
      </>
    ) : (
      children
    );
  return (
    <BadgePrimitive
      ref={ref}
      asChild={asChild}
      variant={variant}
      size={size}
      className={cn(
        "maivand-b-ui maivand-b-badge",
        `maivand-b-badge-${variant === "default" ? "neutral" : variant}`,
        `maivand-b-badge-${size}`,
        className,
      )}
      {...props}
    >
      {content}
    </BadgePrimitive>
  );
});
Badge.displayName = "Badge";
