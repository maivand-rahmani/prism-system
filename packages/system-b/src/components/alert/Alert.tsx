"use client";

import * as React from "react";
import { cn, type AlertProps as CoreAlertProps } from "@prism-system/ui-core";

export type AlertVariant = "info" | "success" | "warning" | "danger";

export interface AlertProps extends CoreAlertProps {
  /** Semantic visual variant owned by this system. Defaults to `"info"`. */
  variant?: AlertVariant;
}

const AlertRoot = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { className, role = "status", variant = "info", ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={role}
      className={cn(
        "maivand-b-ui",
        "maivand-b-alert",
        `maivand-b-alert-${variant}`,
        className,
      )}
      {...props}
    />
  );
});
AlertRoot.displayName = "Alert";

export const AlertTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<"h5">>(
  function AlertTitle({ className, ...props }, ref) {
    return <h5 ref={ref} className={cn("maivand-b-alert-title", className)} {...props} />;
  },
);

export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<"p">
>(function AlertDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn("maivand-b-alert-description", className)} {...props} />;
});

export const Alert = Object.assign(AlertRoot, {
  Title: AlertTitle,
  Description: AlertDescription,
});
