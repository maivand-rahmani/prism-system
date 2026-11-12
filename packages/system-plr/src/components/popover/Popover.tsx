"use client";

import * as React from "react";
import { PopoverPrimitive, cn } from "@prism-system/ui-core";

/** Root props, matching Radix Popover: `open`, `defaultOpen`, `onOpenChange`, `modal`. */
export type PopoverProps = React.ComponentProps<typeof PopoverPrimitive.Root>;

export type PopoverTriggerProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>;

export type PopoverAnchorProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>;

export type PopoverContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>,
  "forceMount"
> & {
  /** Keeps the panel mounted while closed. Normalized to Radix `forceMount: true` only when set. */
  forceMount?: boolean;
};

export type PopoverCloseProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Close>;

export type PopoverTitleProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Title>;

export type PopoverDescriptionProps = React.ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Description
>;

export type PopoverArrowProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow>;

function PopoverRoot(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

/**
 * Trigger is a real `<button>` (Radix sets `aria-haspopup="dialog"`, `aria-expanded`,
 * and `aria-controls`). It reuses the outline button surface, so it reads as an action.
 */
export const PopoverTrigger = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Trigger>,
  PopoverTriggerProps
>(function PopoverTrigger({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Trigger
      ref={ref}
      className={cn(
        "maivand-plr-ui maivand-plr-button maivand-plr-button-outline maivand-plr-button-md maivand-plr-popover-trigger",
        className,
      )}
      {...props}
    />
  );
});

export const PopoverAnchor = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Anchor>,
  PopoverAnchorProps
>(function PopoverAnchor(props, ref) {
  return <PopoverPrimitive.Anchor ref={ref} {...props} />;
});

/**
 * Content always renders into a portal at `document.body`, carrying the `maivand-plr-ui`
 * root class itself so the paper surface and type scale apply outside the app tree.
 * Radix handles collisions, focus, Escape, and outside dismissal. `collisionPadding`
 * keeps the panel off the viewport edge on narrow screens.
 */
export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent(
  { className, forceMount, sideOffset = 8, collisionPadding = 12, ...props },
  ref,
) {
  const forced = forceMount ? ({ forceMount: true } as const) : {};
  return (
    <PopoverPrimitive.Portal {...forced}>
      <PopoverPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn("maivand-plr-ui maivand-plr-popover-content", className)}
        {...props}
        {...forced}
      />
    </PopoverPrimitive.Portal>
  );
});

export const PopoverClose = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Close>,
  PopoverCloseProps
>(function PopoverClose({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Close
      ref={ref}
      className={cn(
        "maivand-plr-ui maivand-plr-button maivand-plr-button-outline maivand-plr-button-md maivand-plr-popover-close",
        className,
      )}
      {...props}
    />
  );
});

export const PopoverTitle = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Title>,
  PopoverTitleProps
>(function PopoverTitle({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Title
      ref={ref}
      className={cn("maivand-plr-popover-title", className)}
      {...props}
    />
  );
});

export const PopoverDescription = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Description>,
  PopoverDescriptionProps
>(function PopoverDescription({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Description
      ref={ref}
      className={cn("maivand-plr-popover-description", className)}
      {...props}
    />
  );
});

export const PopoverArrow = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Arrow>,
  PopoverArrowProps
>(function PopoverArrow({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Arrow
      ref={ref}
      className={cn("maivand-plr-popover-arrow", className)}
      {...props}
      aria-hidden={true}
    />
  );
});

export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Anchor: PopoverAnchor,
  Content: PopoverContent,
  Close: PopoverClose,
  Title: PopoverTitle,
  Description: PopoverDescription,
  Arrow: PopoverArrow,
});

PopoverTrigger.displayName = "PopoverTrigger";
PopoverAnchor.displayName = "PopoverAnchor";
PopoverContent.displayName = "PopoverContent";
PopoverClose.displayName = "PopoverClose";
PopoverTitle.displayName = "PopoverTitle";
PopoverDescription.displayName = "PopoverDescription";
PopoverArrow.displayName = "PopoverArrow";
