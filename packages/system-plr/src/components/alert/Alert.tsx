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
  { className, role = "status", variant = "info", children, ...props },
  ref,
) {
  const marker =
    variant === "success" ? "✓" : variant === "warning" ? "!" : variant === "danger" ? "×" : "i";
  const content = props.dangerouslySetInnerHTML ? null : (
    <>
      <span className="maivand-plr-alert-mark" aria-hidden="true">
        {marker}
      </span>
      {children}
    </>
  );
  return (
    <div
      ref={ref}
      role={role}
      className={cn(
        "maivand-plr-ui",
        "maivand-plr-alert",
        `maivand-plr-alert-${variant}`,
        className,
      )}
      {...props}
    >
      {content}
    </div>
  );
});
AlertRoot.displayName = "Alert";

export const AlertTitle = React.forwardRef<HTMLHeadingElement, AlertTitleProps>(function AlertTitle(
  { className, ...props },
  ref,
) {
  return <h5 ref={ref} className={cn("maivand-plr-alert-title", className)} {...props} />;
});
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  function AlertDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn("maivand-plr-alert-description", className)} {...props} />;
  },
);
AlertDescription.displayName = "AlertDescription";

export const Alert = Object.assign(AlertRoot, {
  Title: AlertTitle,
  Description: AlertDescription,
});
