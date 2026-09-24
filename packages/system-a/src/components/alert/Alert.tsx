import * as React from "react";
import {
  cn,
  type AlertDescriptionProps,
  type AlertProps as CoreAlertProps,
  type AlertTitleProps,
} from "@prism-system/ui-core";

export type AlertVariant = "info" | "success" | "warning" | "danger";
export interface AlertProps extends CoreAlertProps {
  /** Visual semantic variant. Defaults to "info". */
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
        "maivand-a-ui",
        "maivand-a-alert",
        `maivand-a-alert-${variant}`,
        className,
      )}
      {...props}
    />
  );
});
AlertRoot.displayName = "Alert";

export const AlertTitle = React.forwardRef<HTMLHeadingElement, AlertTitleProps>(
  function AlertTitle({ className, ...props }, ref) {
    return (
      <h5 ref={ref} className={cn("maivand-a-alert-title", className)} {...props} />
    );
  },
);
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  function AlertDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cn("maivand-a-alert-description", className)} {...props} />
    );
  },
);
AlertDescription.displayName = "AlertDescription";

export const Alert = Object.assign(AlertRoot, {
  Title: AlertTitle,
  Description: AlertDescription,
});
