import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { AsChildProp } from "../types/common.js";

/**
 * Root props for an `AlertDialog`.
 *
 * `open` makes the dialog controlled; omit it for uncontrolled usage seeded by
 * `defaultOpen`. `onOpenChange` reports requested transitions, but an alert
 * dialog has no modal flag: it is always modal and outside interaction never
 * dismisses it.
 */
export interface AlertDialogProps {
  children?: ReactNode;
  /** Controlled open state. Providing it makes the dialog controlled. */
  open?: boolean;
  /** Initial open state for uncontrolled usage. Defaults to `false`. */
  defaultOpen?: boolean;
  /** Called when the open state should change. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * AlertDialog is a compound component. Implementations must attach `Trigger`,
 * `Content`, `Header`, `Title`, `Description`, `Footer`, `Cancel`, and `Action`
 * as static members of the root component, e.g. `AlertDialog.Content`.
 *
 * An AlertDialog interrupts the user to confirm or acknowledge something. It is
 * always modal: focus is trapped inside the content, the page behind it is
 * inert, and pointer or focus interaction outside the content does not close it.
 * Dismissal is explicit through `Cancel`, `Action`, or `Escape`; focus returns
 * to the trigger when it closes.
 *
 * Accessibility expectations:
 * - `AlertDialog.Trigger` is a native button named by its content.
 * - `AlertDialog.Content` renders `role="alertdialog"` with `aria-modal` and
 *   needs both an accessible name and an associated alert message. Include
 *   `AlertDialog.Title` and `AlertDialog.Description`, or explicitly associate
 *   the message with `aria-describedby`.
 * - Initial focus moves into the content. Keep `AlertDialog.Cancel` as the
 *   first action in reading order when cancellation is the safe default, so it
 *   receives focus; `onOpenAutoFocus` can override the target.
 * - `AlertDialog.Cancel` and `AlertDialog.Action` are native buttons that close
 *   the dialog. Their content names the consequence: "Cancel" and a specific
 *   verb such as "Delete project", never a generic "OK".
 * - `Escape` closes the dialog. Outside pointer interaction is ignored rather
 *   than treated as cancellation, so an accidental click cannot confirm or
 *   discard the decision.
 */
export type AlertDialogTriggerProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

/**
 * The modal panel and its overlay.
 *
 * `forceMount` keeps the panel mounted while closed for animation control;
 * visibility and modality still follow the root's open state. Content is
 * portalled. Focus is trapped and restored; `onOpenAutoFocus` and
 * `onCloseAutoFocus` can redirect focus, and `onEscapeKeyDown` can cancel
 * dismissal. Visual surface, spacing, and motion belong to the design system.
 */
export type AlertDialogContentProps = ComponentPropsWithoutRef<"div"> &
  AsChildProp & {
    /** Keeps the panel mounted while closed instead of unmounting it. */
    forceMount?: boolean;
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
    /** Cancellable; preventing the default keeps the dialog open. */
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
  };

/** Structural wrapper for the title and description. It has no semantics of its own. */
export type AlertDialogHeaderProps = ComponentPropsWithoutRef<"div">;

/**
 * The dialog's accessible name. It is associated with the content through
 * `aria-labelledby`, so every alert dialog must render it exactly once.
 */
export type AlertDialogTitleProps = ComponentPropsWithoutRef<"h2"> & AsChildProp;

/**
 * Alert message associated with the content through `aria-describedby`. It
 * explains the consequence but does not replace the title; if omitted, the
 * content must explicitly reference another element containing the message.
 */
export type AlertDialogDescriptionProps = ComponentPropsWithoutRef<"p"> & AsChildProp;

/** Structural wrapper for the dialog actions, placed after the description. */
export type AlertDialogFooterProps = ComponentPropsWithoutRef<"div">;

/**
 * The safe, non-destructive choice. It is a native button that closes the
 * dialog without confirming the action, and it needs an accessible name from
 * its content.
 */
export type AlertDialogCancelProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

/**
 * The confirming choice. It is a native button that closes the dialog and
 * performs the consumer's action; its accessible name must state the specific
 * consequence rather than a generic confirmation.
 */
export type AlertDialogActionProps = ComponentPropsWithoutRef<"button"> & AsChildProp;
