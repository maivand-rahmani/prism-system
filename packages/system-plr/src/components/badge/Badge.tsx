import * as React from "react";
import {
  Badge as BadgePrimitive,
  cn,
  type BadgeProps as CoreBadgeProps,
} from "@prism-system/ui-core";

export type BadgeProps = CoreBadgeProps;
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = "default", size = "md", dot = false, asChild = false, children, ...props },
  ref,
) {
  const marker = dot ? (
    <span className="maivand-plr-badge-dot" aria-hidden="true" />
  ) : variant === "info" ? (
    <span className="maivand-plr-badge-status-mark" aria-hidden="true">
      i
    </span>
  ) : variant === "success" ? (
    <span className="maivand-plr-badge-status-mark" aria-hidden="true">
      ✓
    </span>
  ) : variant === "warning" ? (
    <span className="maivand-plr-badge-status-mark" aria-hidden="true">
      !
    </span>
  ) : variant === "danger" ? (
    <span className="maivand-plr-badge-status-mark" aria-hidden="true">
      ×
    </span>
  ) : null;
  const content = asChild ? (
    children
  ) : props.dangerouslySetInnerHTML ? null : (
    <>
      {marker}
      {children}
    </>
  );
  return (
    <BadgePrimitive
      ref={ref}
      asChild={asChild}
      variant={variant}
      size={size}
      className={cn(
        "maivand-plr-ui maivand-plr-badge",
        `maivand-plr-badge-${variant === "default" ? "neutral" : variant}`,
        `maivand-plr-badge-${size}`,
        className,
      )}
      {...props}
    >
      {content}
    </BadgePrimitive>
  );
});
Badge.displayName = "Badge";
