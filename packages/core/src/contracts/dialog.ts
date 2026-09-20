import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { AsChildProp } from "../types/common.js";

export interface DialogOwnProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}

/**
 * Dialog is a compound component. Implementations must attach the sub-components
 * below as static members of the root component, e.g. `Dialog.Content`.
 *
 * Accessibility expectations: `Dialog.Content` must render
 * `role="dialog"` with `aria-modal="true"`, be labelled by `Dialog.Title`
 * (and optionally described by `Dialog.Description`), trap focus, close on
 * Escape, and restore focus to the trigger.
 */
export type DialogProps = DialogOwnProps & { children?: ReactNode };

export type DialogTriggerProps = ComponentPropsWithoutRef<"button"> & AsChildProp;
export type DialogCloseProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

export interface DialogPortalProps {
  children?: ReactNode;
  container?: HTMLElement | null;
  forceMount?: boolean;
}

export type DialogOverlayProps = ComponentPropsWithoutRef<"div">;

export type DialogContentProps = ComponentPropsWithoutRef<"div"> & {
  forceMount?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
};

export type DialogHeaderProps = ComponentPropsWithoutRef<"div">;
export type DialogFooterProps = ComponentPropsWithoutRef<"div">;
export type DialogTitleProps = ComponentPropsWithoutRef<"h2">;
export type DialogDescriptionProps = ComponentPropsWithoutRef<"p">;
