"use client";

import * as React from "react";
import {
  DropdownMenu as DropdownMenuPrimitive,
  DropdownMenuArrow as DropdownMenuArrowPrimitive,
  DropdownMenuCheckboxItem as DropdownMenuCheckboxItemPrimitive,
  DropdownMenuContent as DropdownMenuContentPrimitive,
  DropdownMenuGroup as DropdownMenuGroupPrimitive,
  DropdownMenuItem as DropdownMenuItemPrimitive,
  DropdownMenuItemIndicator as DropdownMenuItemIndicatorPrimitive,
  DropdownMenuLabel as DropdownMenuLabelPrimitive,
  DropdownMenuPortal as DropdownMenuPortalPrimitive,
  DropdownMenuRadioGroup as DropdownMenuRadioGroupPrimitive,
  DropdownMenuRadioItem as DropdownMenuRadioItemPrimitive,
  DropdownMenuSeparator as DropdownMenuSeparatorPrimitive,
  DropdownMenuSub as DropdownMenuSubPrimitive,
  DropdownMenuSubContent as DropdownMenuSubContentPrimitive,
  DropdownMenuSubTrigger as DropdownMenuSubTriggerPrimitive,
  DropdownMenuTrigger as DropdownMenuTriggerPrimitive,
  cn,
  type DropdownMenuArrowProps as CoreDropdownMenuArrowProps,
  type DropdownMenuCheckboxItemProps as CoreDropdownMenuCheckboxItemProps,
  type DropdownMenuContentProps as CoreDropdownMenuContentProps,
  type DropdownMenuGroupProps as CoreDropdownMenuGroupProps,
  type DropdownMenuItemIndicatorProps as CoreDropdownMenuItemIndicatorProps,
  type DropdownMenuItemProps as CoreDropdownMenuItemProps,
  type DropdownMenuLabelProps as CoreDropdownMenuLabelProps,
  type DropdownMenuPortalProps as CoreDropdownMenuPortalProps,
  type DropdownMenuProps as CoreDropdownMenuProps,
  type DropdownMenuRadioGroupProps as CoreDropdownMenuRadioGroupProps,
  type DropdownMenuRadioItemProps as CoreDropdownMenuRadioItemProps,
  type DropdownMenuSeparatorProps as CoreDropdownMenuSeparatorProps,
  type DropdownMenuSubContentProps as CoreDropdownMenuSubContentProps,
  type DropdownMenuSubTriggerProps as CoreDropdownMenuSubTriggerProps,
  type DropdownMenuTriggerProps as CoreDropdownMenuTriggerProps,
} from "@prism-system/ui-core";

export type DropdownMenuProps = CoreDropdownMenuProps;

function DropdownMenuRoot(props: DropdownMenuProps) {
  return <DropdownMenuPrimitive {...props} />;
}

export const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  CoreDropdownMenuTriggerProps
>(function DropdownMenuTrigger({ className, ...props }, ref) {
  return (
    <DropdownMenuTriggerPrimitive
      ref={ref}
      className={cn(
        "maivand-b-ui",
        "maivand-b-button",
        "maivand-b-button-outline",
        "maivand-b-button-sm",
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuPortal = ({ forceMount, ...props }: CoreDropdownMenuPortalProps) => (
  <DropdownMenuPortalPrimitive {...props} {...(forceMount ? { forceMount: true } : {})} />
);

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, CoreDropdownMenuContentProps>(
  function DropdownMenuContent({ className, forceMount, ...props }, ref) {
    return (
      <DropdownMenuContentPrimitive
        ref={ref}
        className={cn("maivand-b-ui maivand-b-menu-content", className)}
        {...props}
        {...(forceMount ? { forceMount: true } : {})}
      />
    );
  },
);

export const DropdownMenuGroup = React.forwardRef<HTMLDivElement, CoreDropdownMenuGroupProps>(
  function DropdownMenuGroup({ className, ...props }, ref) {
    return (
      <DropdownMenuGroupPrimitive
        ref={ref}
        className={cn("maivand-b-menu-group", className)}
        {...props}
      />
    );
  },
);

export const DropdownMenuLabel = React.forwardRef<HTMLDivElement, CoreDropdownMenuLabelProps>(
  function DropdownMenuLabel({ className, ...props }, ref) {
    return (
      <DropdownMenuLabelPrimitive
        ref={ref}
        className={cn("maivand-b-menu-label", className)}
        {...props}
      />
    );
  },
);

export const DropdownMenuItem = React.forwardRef<HTMLDivElement, CoreDropdownMenuItemProps>(
  function DropdownMenuItem({ className, ...props }, ref) {
    return (
      <DropdownMenuItemPrimitive
        ref={ref}
        className={cn("maivand-b-menu-item", className)}
        {...props}
      />
    );
  },
);

export const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuCheckboxItemProps
>(function DropdownMenuCheckboxItem({ className, ...props }, ref) {
  return (
    <DropdownMenuCheckboxItemPrimitive
      ref={ref}
      className={cn("maivand-b-menu-item", className)}
      {...props}
    />
  );
});

export const DropdownMenuRadioGroup = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuRadioGroupProps
>(function DropdownMenuRadioGroup({ className, ...props }, ref) {
  return (
    <DropdownMenuRadioGroupPrimitive
      ref={ref}
      className={cn("maivand-b-menu-group", className)}
      {...props}
    />
  );
});

export const DropdownMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuRadioItemProps
>(function DropdownMenuRadioItem({ className, ...props }, ref) {
  return (
    <DropdownMenuRadioItemPrimitive
      ref={ref}
      className={cn("maivand-b-menu-item", className)}
      {...props}
    />
  );
});

export const DropdownMenuItemIndicator = React.forwardRef<
  HTMLSpanElement,
  CoreDropdownMenuItemIndicatorProps
>(function DropdownMenuItemIndicator({ className, forceMount, ...props }, ref) {
  return (
    <DropdownMenuItemIndicatorPrimitive
      ref={ref}
      className={cn("maivand-b-menu-indicator", className)}
      {...props}
      {...(forceMount ? { forceMount: true } : {})}
    />
  );
});

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuSeparatorProps
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuSeparatorPrimitive
      ref={ref}
      className={cn("maivand-b-menu-separator", className)}
      {...props}
    />
  );
});

export const DropdownMenuArrow = React.forwardRef<SVGSVGElement, CoreDropdownMenuArrowProps>(
  function DropdownMenuArrow({ className, ...props }, ref) {
    return (
      <DropdownMenuArrowPrimitive
        ref={ref}
        className={cn("maivand-b-menu-arrow", className)}
        {...props}
      />
    );
  },
);

export const DropdownMenuSub = DropdownMenuSubPrimitive;

export const DropdownMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuSubTriggerProps
>(function DropdownMenuSubTrigger({ className, ...props }, ref) {
  return (
    <DropdownMenuSubTriggerPrimitive
      ref={ref}
      className={cn("maivand-b-menu-item", className)}
      {...props}
    />
  );
});

export const DropdownMenuSubContent = React.forwardRef<
  HTMLDivElement,
  CoreDropdownMenuSubContentProps
>(function DropdownMenuSubContent({ className, forceMount, align, ...props }, ref) {
  // Radix SubContent accepts only start/end; center is valid in the shared API.
  const normalizedAlign = align === "center" ? undefined : align;
  return (
    <DropdownMenuSubContentPrimitive
      ref={ref}
      align={normalizedAlign}
      className={cn("maivand-b-ui maivand-b-menu-content", className)}
      {...props}
      {...(forceMount ? { forceMount: true } : {})}
    />
  );
});

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger: DropdownMenuTrigger,
  Portal: DropdownMenuPortal,
  Content: DropdownMenuContent,
  Group: DropdownMenuGroup,
  Label: DropdownMenuLabel,
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  ItemIndicator: DropdownMenuItemIndicator,
  Separator: DropdownMenuSeparator,
  Arrow: DropdownMenuArrow,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
});
