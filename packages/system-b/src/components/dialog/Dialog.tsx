"use client";

import * as React from "react";
import {
  Dialog as DialogPrimitive,
  DialogClose as DialogClosePrimitive,
  DialogContent as DialogContentPrimitive,
  DialogDescription as DialogDescriptionPrimitive,
  DialogFooter as DialogFooterPrimitive,
  DialogHeader as DialogHeaderPrimitive,
  DialogOverlay as DialogOverlayPrimitive,
  DialogPortal as DialogPortalPrimitive,
  DialogTitle as DialogTitlePrimitive,
  DialogTrigger as DialogTriggerPrimitive,
  cn,
  type DialogCloseProps as CoreDialogCloseProps,
  type DialogContentProps as CoreDialogContentProps,
  type DialogDescriptionProps as CoreDialogDescriptionProps,
  type DialogFooterProps as CoreDialogFooterProps,
  type DialogHeaderProps as CoreDialogHeaderProps,
  type DialogOverlayProps as CoreDialogOverlayProps,
  type DialogPortalProps as CoreDialogPortalProps,
  type DialogProps as CoreDialogProps,
  type DialogTitleProps as CoreDialogTitleProps,
  type DialogTriggerProps as CoreDialogTriggerProps,
} from "@prism-system/ui-core";

export type DialogProps = CoreDialogProps;
export type DialogPortalProps = CoreDialogPortalProps;
export type DialogOverlayProps = CoreDialogOverlayProps;
export type DialogContentProps = CoreDialogContentProps;

function DialogRoot(props: DialogProps) {
  return <DialogPrimitive {...props} />;
}

export const DialogTrigger = React.forwardRef<HTMLButtonElement, CoreDialogTriggerProps>(
  function DialogTrigger({ className, ...props }, ref) {
    return (
      <DialogTriggerPrimitive
        ref={ref}
        className={cn(
          "maivand-b-ui maivand-b-button maivand-b-button-primary maivand-b-button-md",
          className,
        )}
        {...props}
      />
    );
  },
);

export const DialogClose = React.forwardRef<HTMLButtonElement, CoreDialogCloseProps>(
  function DialogClose({ className, ...props }, ref) {
    return (
      <DialogClosePrimitive
        ref={ref}
        className={cn(
          "maivand-b-ui maivand-b-button maivand-b-button-ghost maivand-b-button-md",
          className,
        )}
        {...props}
      />
    );
  },
);

export const DialogPortal = ({
  className: _className,
  forceMount,
  ...props
}: CoreDialogPortalProps & { className?: string }) => (
  <DialogPortalPrimitive {...props} {...(forceMount ? { forceMount: true } : {})} />
);

export const DialogOverlay = React.forwardRef<HTMLDivElement, CoreDialogOverlayProps>(
  function DialogOverlay({ className, ...props }, ref) {
    return (
      <DialogOverlayPrimitive
        ref={ref}
        className={cn("maivand-b-ui maivand-b-dialog-overlay", className)}
        {...props}
      />
    );
  },
);

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  function DialogContent({ className, children, forceMount, ...props }, ref) {
    return (
      <DialogPortalPrimitive>
        <DialogOverlayPrimitive className="maivand-b-ui maivand-b-dialog-overlay" />
        <DialogContentPrimitive
          ref={ref}
          className={cn("maivand-b-ui maivand-b-dialog-content", className)}
          {...props}
          {...(forceMount ? { forceMount: true } : {})}
        >
          {children}
        </DialogContentPrimitive>
      </DialogPortalPrimitive>
    );
  },
);

export const DialogHeader = React.forwardRef<HTMLDivElement, CoreDialogHeaderProps>(
  function DialogHeader({ className, ...props }, ref) {
    return (
      <DialogHeaderPrimitive
        ref={ref}
        className={cn("maivand-b-dialog-header", className)}
        {...props}
      />
    );
  },
);

export const DialogTitle = React.forwardRef<HTMLHeadingElement, CoreDialogTitleProps>(
  function DialogTitle({ className, ...props }, ref) {
    return (
      <DialogTitlePrimitive
        ref={ref}
        className={cn("maivand-b-dialog-title", className)}
        {...props}
      />
    );
  },
);

export const DialogDescription = React.forwardRef<HTMLParagraphElement, CoreDialogDescriptionProps>(
  function DialogDescription({ className, ...props }, ref) {
    return (
      <DialogDescriptionPrimitive
        ref={ref}
        className={cn("maivand-b-dialog-description", className)}
        {...props}
      />
    );
  },
);

export const DialogFooter = React.forwardRef<HTMLDivElement, CoreDialogFooterProps>(
  function DialogFooter({ className, ...props }, ref) {
    return (
      <DialogFooterPrimitive
        ref={ref}
        className={cn("maivand-b-dialog-footer", className)}
        {...props}
      />
    );
  },
);

export const Dialog = Object.assign(DialogRoot, {
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Header: DialogHeader,
  Footer: DialogFooter,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
});

DialogTrigger.displayName = "DialogTrigger";
DialogClose.displayName = "DialogClose";
DialogContent.displayName = "DialogContent";
DialogHeader.displayName = "DialogHeader";
DialogTitle.displayName = "DialogTitle";
DialogDescription.displayName = "DialogDescription";
DialogFooter.displayName = "DialogFooter";
DialogOverlay.displayName = "DialogOverlay";
