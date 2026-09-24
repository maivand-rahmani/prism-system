import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { AsChildProp } from "../types/common.js";

export interface ToastProviderProps {
  children?: ReactNode;
  /**
   * Default auto-dismiss duration in milliseconds for descendant toasts.
   * `null` disables automatic dismissal. Individual roots may override it.
   */
  duration?: number | null;
}

/** The live region / list container. Implementations add the region labelling. */
export type ToastViewportProps = ComponentPropsWithoutRef<"ol">;

export interface ToastOwnProps {
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state for uncontrolled usage. */
  defaultOpen?: boolean;
  /** Called when the open state should change. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Auto-dismiss duration in milliseconds, overriding the provider.
   * `null` disables automatic dismissal.
   */
  duration?: number | null;
  /**
   * ARIA live role. `"status"` (default) announces politely; `"alert"` is
   * assertive and should be reserved for important messages.
   */
  role?: "status" | "alert";
}

/**
 * Toast is a compound component: `Toast.Provider`, `Toast.Viewport`,
 * `Toast.Root`, `Toast.Title`, `Toast.Description`, `Toast.Action`,
 * `Toast.Close`.
 *
 * Behavior contract (implementation-owned):
 * - Toasts are announced politely by default (`role="status"`) and never steal
 *   focus.
 * - Auto-dismiss timing pauses on focus and hover and resumes when the pointer
 *   or focus leaves; `duration: null` disables dismissal entirely.
 * - There is no standard queue: ordering, deduplication, and limits are the
 *   product's responsibility, not the provider's.
 */
export type ToastProps = ToastOwnProps & ComponentPropsWithoutRef<"li">;
export type ToastTitleProps = ComponentPropsWithoutRef<"h5">;
export type ToastDescriptionProps = ComponentPropsWithoutRef<"p">;
export type ToastActionProps = AsChildProp &
  ComponentPropsWithoutRef<"button"> & {
    /**
     * Accessible label for the action, required when its visible text is not
     * self-describing (for example, "Undo" is fine, "OK" is not).
     */
    altText: string;
  };
export type ToastCloseProps = AsChildProp & ComponentPropsWithoutRef<"button">;
