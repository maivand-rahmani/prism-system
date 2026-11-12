"use client";

import * as React from "react";
import { ToolbarPrimitive, cn } from "@prism-system/ui-core";

/**
 * Root props, matching Radix Toolbar: `orientation`, `loop`, `dir`, and div props.
 *
 * Accessibility: a toolbar needs an accessible name supplied through `aria-label` or
 * `aria-labelledby`. Radix gives the root `role="toolbar"` and roving focus across its
 * controls, so one Tab stop enters the bar and the arrow keys move between controls.
 */
export type ToolbarProps = React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Root>;

export type ToolbarButtonProps = React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Button>;

export type ToolbarLinkProps = React.ComponentPropsWithoutRef<typeof ToolbarPrimitive.Link>;

export type ToolbarSeparatorProps = React.ComponentPropsWithoutRef<
  typeof ToolbarPrimitive.Separator
>;

/** Toolbar toggle group, matching Radix: `type` ("single" | "multiple") plus its value props. */
export type ToolbarToggleGroupProps = React.ComponentPropsWithoutRef<
  typeof ToolbarPrimitive.ToggleGroup
>;

export type ToolbarToggleItemProps = React.ComponentPropsWithoutRef<
  typeof ToolbarPrimitive.ToggleItem
>;

const ToolbarRoot = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Root>,
  ToolbarProps
>(function Toolbar({ className, ...props }, ref) {
  return (
    <ToolbarPrimitive.Root
      ref={ref}
      className={cn("maivand-plr-ui maivand-plr-toolbar", className)}
      {...props}
    />
  );
});
ToolbarRoot.displayName = "Toolbar";

/** Action buttons use the ghost button surface, so they match every other button. */
export const ToolbarButton = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Button>,
  ToolbarButtonProps
>(function ToolbarButton({ className, ...props }, ref) {
  return (
    <ToolbarPrimitive.Button
      ref={ref}
      className={cn(
        "maivand-plr-ui maivand-plr-button maivand-plr-button-ghost maivand-plr-button-md maivand-plr-toolbar-button",
        className,
      )}
      {...props}
    />
  );
});
ToolbarButton.displayName = "ToolbarButton";

export const ToolbarLink = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Link>,
  ToolbarLinkProps
>(function ToolbarLink({ className, ...props }, ref) {
  return (
    <ToolbarPrimitive.Link
      ref={ref}
      className={cn("maivand-plr-toolbar-link", className)}
      {...props}
    />
  );
});
ToolbarLink.displayName = "ToolbarLink";

export const ToolbarSeparator = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.Separator>,
  ToolbarSeparatorProps
>(function ToolbarSeparator({ className, ...props }, ref) {
  return (
    <ToolbarPrimitive.Separator
      ref={ref}
      className={cn("maivand-plr-toolbar-separator", className)}
      {...props}
    />
  );
});
ToolbarSeparator.displayName = "ToolbarSeparator";

/** The group shares the ToggleGroup tray; inside the bar it sits flush on the paper. */
export const ToolbarToggleGroup = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.ToggleGroup>,
  ToolbarToggleGroupProps
>(function ToolbarToggleGroup({ className, ...props }, ref) {
  return (
    <ToolbarPrimitive.ToggleGroup
      ref={ref}
      className={cn(
        "maivand-plr-ui maivand-plr-toggle-group maivand-plr-toolbar-toggle-group",
        className,
      )}
      {...props}
    />
  );
});
ToolbarToggleGroup.displayName = "ToolbarToggleGroup";

export const ToolbarToggleItem = React.forwardRef<
  React.ComponentRef<typeof ToolbarPrimitive.ToggleItem>,
  ToolbarToggleItemProps
>(function ToolbarToggleItem({ className, ...props }, ref) {
  return (
    <ToolbarPrimitive.ToggleItem
      ref={ref}
      className={cn("maivand-plr-toggle-group-item maivand-plr-toolbar-toggle-item", className)}
      {...props}
    />
  );
});
ToolbarToggleItem.displayName = "ToolbarToggleItem";

export const Toolbar = Object.assign(ToolbarRoot, {
  Button: ToolbarButton,
  Link: ToolbarLink,
  Separator: ToolbarSeparator,
  ToggleGroup: ToolbarToggleGroup,
  ToggleItem: ToolbarToggleItem,
});
