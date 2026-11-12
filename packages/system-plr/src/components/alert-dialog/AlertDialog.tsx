"use client";

import * as React from "react";
import { AlertDialogPrimitive, cn } from "@prism-system/ui-core";

/** Root props, matching Radix AlertDialog: `open`, `defaultOpen`, `onOpenChange`. */
export type AlertDialogProps = React.ComponentProps<typeof AlertDialogPrimitive.Root>;

export type AlertDialogButtonVariant = "outline" | "primary" | "destructive";

export type AlertDialogTriggerProps = React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Trigger
> & {
  /** Surface of the trigger button. Defaults to the quiet outline action. */
  variant?: AlertDialogButtonVariant;
};

export type AlertDialogContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>,
  "forceMount"
> & {
  /** Normalized to Radix `forceMount: true` only when set; the portal still follows the root state. */
  forceMount?: boolean;
};

export type AlertDialogHeaderProps = React.ComponentPropsWithoutRef<"div">;

export type AlertDialogFooterProps = React.ComponentPropsWithoutRef<"div">;

export type AlertDialogTitleProps = React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Title
>;

export type AlertDialogDescriptionProps = React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Description
>;

export type AlertDialogCancelProps = React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Cancel
>;

export type AlertDialogActionProps = React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Action
> & {
  /** `destructive` marks an irreversible confirmation; the label still names the action. */
  variant?: "primary" | "destructive";
};

function AlertDialogRoot(props: AlertDialogProps) {
  return <AlertDialogPrimitive.Root {...props} />;
}

export const AlertDialogTrigger = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Trigger>,
  AlertDialogTriggerProps
>(function AlertDialogTrigger({ className, variant = "outline", ...props }, ref) {
  return (
    <AlertDialogPrimitive.Trigger
      ref={ref}
      className={cn(
        "maivand-plr-ui maivand-plr-button maivand-plr-button-md",
        `maivand-plr-button-${variant}`,
        "maivand-plr-alert-dialog-trigger",
        className,
      )}
      {...props}
    />
  );
});

/**
 * Content owns its portal and overlay, so it always lives above the app and carries the
 * `maivand-plr-ui` class. Radix focuses Cancel on open and ignores outside clicks: a
 * confirmation must be answered explicitly, through Cancel, Action, or Escape.
 */
export const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  AlertDialogContentProps
>(function AlertDialogContent({ className, children, forceMount, ...props }, ref) {
  const forced = forceMount ? ({ forceMount: true } as const) : {};
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="maivand-plr-ui maivand-plr-alert-dialog-overlay" />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn("maivand-plr-ui maivand-plr-alert-dialog-content", className)}
        {...props}
        {...forced}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
});

export const AlertDialogHeader = React.forwardRef<HTMLDivElement, AlertDialogHeaderProps>(
  function AlertDialogHeader({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("maivand-plr-alert-dialog-header", className)} {...props} />
    );
  },
);

export const AlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Title>,
  AlertDialogTitleProps
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("maivand-plr-alert-dialog-title", className)}
      {...props}
    />
  );
});

export const AlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  AlertDialogDescriptionProps
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("maivand-plr-alert-dialog-description", className)}
      {...props}
    />
  );
});

export const AlertDialogFooter = React.forwardRef<HTMLDivElement, AlertDialogFooterProps>(
  function AlertDialogFooter({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("maivand-plr-alert-dialog-footer", className)} {...props} />
    );
  },
);

export const AlertDialogCancel = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Cancel>,
  AlertDialogCancelProps
>(function AlertDialogCancel({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(
        "maivand-plr-ui maivand-plr-button maivand-plr-button-outline maivand-plr-button-md maivand-plr-alert-dialog-cancel",
        className,
      )}
      {...props}
    />
  );
});

export const AlertDialogAction = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Action>,
  AlertDialogActionProps
>(function AlertDialogAction({ className, variant = "primary", ...props }, ref) {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(
        "maivand-plr-ui maivand-plr-button maivand-plr-button-md",
        `maivand-plr-button-${variant}`,
        "maivand-plr-alert-dialog-action",
        className,
      )}
      {...props}
    />
  );
});

export const AlertDialog = Object.assign(AlertDialogRoot, {
  Trigger: AlertDialogTrigger,
  Content: AlertDialogContent,
  Header: AlertDialogHeader,
  Title: AlertDialogTitle,
  Description: AlertDialogDescription,
  Footer: AlertDialogFooter,
  Cancel: AlertDialogCancel,
  Action: AlertDialogAction,
});

AlertDialogTrigger.displayName = "AlertDialogTrigger";
AlertDialogContent.displayName = "AlertDialogContent";
AlertDialogHeader.displayName = "AlertDialogHeader";
AlertDialogTitle.displayName = "AlertDialogTitle";
AlertDialogDescription.displayName = "AlertDialogDescription";
AlertDialogFooter.displayName = "AlertDialogFooter";
AlertDialogCancel.displayName = "AlertDialogCancel";
AlertDialogAction.displayName = "AlertDialogAction";
