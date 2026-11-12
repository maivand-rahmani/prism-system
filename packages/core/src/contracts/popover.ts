import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { Align, AsChildProp, Side } from "../types/common.js";

/**
 * Root props for a `Popover`.
 *
 * `open` makes the popover controlled; omit it for uncontrolled usage seeded by
 * `defaultOpen`. `onOpenChange` reports every requested transition, including
 * dismissal through `Escape`, outside interaction, or `Popover.Close`. The
 * consumer owns the open state in controlled usage and must apply the reported
 * value.
 *
 * `modal` opts into a focus-trapping popover. A non-modal popover takes focus
 * when opened but allows focus to leave the panel.
 */
export interface PopoverProps {
  children?: ReactNode;
  /** Controlled open state. Providing it makes the popover controlled. */
  open?: boolean;
  /** Initial open state for uncontrolled usage. Defaults to `false`. */
  defaultOpen?: boolean;
  /** Called when the open state should change. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Traps focus inside the content and disables pointer interaction outside it
   * while open. Defaults to `false` (non-modal).
   */
  modal?: boolean;
}

/**
 * Popover is a compound component. Implementations must attach `Trigger`,
 * `Anchor`, `Content`, `Close`, `Title`, `Description`, and `Arrow` as static
 * members of the root component, e.g. `Popover.Trigger`.
 *
 * Accessibility expectations:
 * - `Popover.Trigger` is a native `<button>` named by its content, with
 *   `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`.
 * - `Popover.Content` renders a dialog-like surface. It needs an accessible
 *   name: include `Popover.Title` (associated through `aria-labelledby`) or
 *   pass `aria-label`/`aria-labelledby`. Include `Popover.Description` when the
 *   extra text is needed; it is associated through `aria-describedby`.
 * - `Escape` closes the popover. An outside interaction can dismiss it unless
 *   cancelled through the content's outside handlers. Modal mode prevents the
 *   background from receiving pointer interaction while the panel is open.
 * - Focus moves into the content on open and is trapped when `modal`. Closing
 *   with Escape or a close control restores focus to the trigger; when a
 *   non-modal popover closes because focus moved outside, that destination keeps
 *   focus. `Popover.Anchor` is a positioning-only wrapper. `Popover.Arrow` is
 *   decorative and hidden from assistive technology.
 * - `Popover.Close` is a native button with an accessible name from its
 *   content; activating it closes the popover.
 */
export type PopoverTriggerProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

/**
 * Optional positioning anchor for `Popover.Content`.
 *
 * When absent, the content is positioned against the trigger. The anchor is a
 * plain element: give it no interactive role and no tab stop. `virtualRef` lets
 * positioning follow an element that is not rendered as the anchor itself.
 */
export type PopoverAnchorProps = ComponentPropsWithoutRef<"div"> &
  AsChildProp & {
    /** Element whose rectangle positions the content instead of this node. */
    virtualRef?: { readonly current: Element | null };
  };

/**
 * The floating panel.
 *
 * Positioning follows the shared `Side`/`Align` vocabulary; `sideOffset`,
 * `alignOffset`, `arrowPadding`, collision handling, and `sticky` depend on the
 * implementation. `forceMount` keeps the panel mounted while closed; visibility
 * and dismissal still follow the root's open state.
 *
 * Content is portalled and is not a descendant of the trigger in the DOM. The
 * panel needs an accessible name as described on `PopoverProps`; visual
 * surface, spacing, and animation belong to the design system.
 */
export type PopoverContentProps = ComponentPropsWithoutRef<"div"> &
  AsChildProp & {
    side?: Side;
    sideOffset?: number;
    align?: Align;
    alignOffset?: number;
    avoidCollisions?: boolean;
    /** Element or elements treated as the collision boundary. */
    collisionBoundary?: Element | null | Array<Element | null>;
    /** Uniform padding, or per-side padding, kept between panel and boundary. */
    collisionPadding?: number | Partial<Record<Side, number>>;
    arrowPadding?: number;
    sticky?: "partial" | "always";
    hideWhenDetached?: boolean;
    updatePositionStrategy?: "optimized" | "always";
    /** Called after the panel has been positioned. */
    onPlaced?: () => void;
    /** Keeps the panel mounted while closed instead of unmounting it. */
    forceMount?: boolean;
    onOpenAutoFocus?: (event: Event) => void;
    onCloseAutoFocus?: (event: Event) => void;
    /** Cancellable; preventing the default keeps the popover open. */
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
    onPointerDownOutside?: (event: Event) => void;
    onFocusOutside?: (event: Event) => void;
    onInteractOutside?: (event: Event) => void;
  };

/** Native button that closes the popover. It needs an accessible name from its content. */
export type PopoverCloseProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

/**
 * Optional accessible title for the panel, associated with the content through
 * `aria-labelledby`. It renders an `h2` unless composed through `asChild`.
 */
export type PopoverTitleProps = ComponentPropsWithoutRef<"h2"> & AsChildProp;

/**
 * Optional supporting text for the panel, associated with the content through
 * `aria-describedby`. It does not replace the accessible name.
 */
export type PopoverDescriptionProps = ComponentPropsWithoutRef<"p"> & AsChildProp;

/**
 * Decorative arrow pointing at the anchor. It carries no semantics and must be
 * hidden from assistive technology by the implementation.
 */
export type PopoverArrowProps = ComponentPropsWithoutRef<"svg"> & AsChildProp;
