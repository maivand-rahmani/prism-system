import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { Align, AsChildProp, Side } from "../types/common.js";

export interface TooltipProviderProps {
  children: ReactNode;
  /** Delay before a tooltip opens, in milliseconds. */
  delayDuration?: number;
  /** Grace period before the next tooltip re-applies the open delay. */
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
}

export interface TooltipOwnProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Per-tooltip override of the provider's open delay. */
  delayDuration?: number;
  disableHoverableContent?: boolean;
}

/**
 * Tooltip is a compound component. Implementations must attach the
 * sub-components below as static members of the root component, e.g.
 * `Tooltip.Content`.
 *
 * Accessibility expectations: `Tooltip.Trigger` is focusable and referenced by
 * the content through `aria-describedby`; `Tooltip.Content` exposes
 * `role="tooltip"` and is dismissible with `Escape`; the provider coordinates
 * open delays and hover behavior. A tooltip must never be the only way to reach
 * information.
 */
export type TooltipProps = TooltipOwnProps & { children?: ReactNode };

export type TooltipTriggerProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

export interface TooltipPortalProps {
  children?: ReactNode;
  container?: HTMLElement | null;
  forceMount?: boolean;
}

export type TooltipContentProps = ComponentPropsWithoutRef<"div"> & {
  side?: Side;
  sideOffset?: number;
  align?: Align;
  alignOffset?: number;
  avoidCollisions?: boolean;
  collisionPadding?: number;
  sticky?: "partial" | "always";
  hideWhenDetached?: boolean;
  forceMount?: boolean;
  /** Accessible name for the tooltip when its content is not plain text. */
  "aria-label"?: string;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
};

export type TooltipArrowProps = ComponentPropsWithoutRef<"svg"> & {
  width?: number;
  height?: number;
};
