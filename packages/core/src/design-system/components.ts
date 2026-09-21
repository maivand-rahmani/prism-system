import type { ComponentType } from "react";
import type {
  BadgeProps,
  ButtonProps,
  CardContentProps,
  CardDescriptionProps,
  CardFooterProps,
  CardHeaderProps,
  CardProps,
  CardTitleProps,
  CheckboxProps,
  DialogCloseProps,
  DialogContentProps,
  DialogDescriptionProps,
  DialogFooterProps,
  DialogHeaderProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogProps,
  DialogTitleProps,
  DialogTriggerProps,
  DropdownMenuArrowProps,
  DropdownMenuCheckboxItemProps,
  DropdownMenuContentProps,
  DropdownMenuGroupProps,
  DropdownMenuItemIndicatorProps,
  DropdownMenuItemProps,
  DropdownMenuLabelProps,
  DropdownMenuPortalProps,
  DropdownMenuProps,
  DropdownMenuRadioGroupProps,
  DropdownMenuRadioItemProps,
  DropdownMenuSeparatorProps,
  DropdownMenuSubContentProps,
  DropdownMenuSubProps,
  DropdownMenuSubTriggerProps,
  DropdownMenuTriggerProps,
  InputProps,
  RadioGroupIndicatorProps,
  RadioGroupItemProps,
  RadioGroupProps,
  SelectContentProps,
  SelectGroupProps,
  SelectItemProps,
  SelectLabelProps,
  SelectProps,
  SelectSeparatorProps,
  SelectTriggerProps,
  SelectValueProps,
  SeparatorProps,
  SwitchProps,
  SwitchThumbProps,
  TabsContentProps,
  TabsListProps,
  TabsProps,
  TabsTriggerProps,
  TextareaProps,
  TooltipArrowProps,
  TooltipContentProps,
  TooltipPortalProps,
  TooltipProps,
  TooltipProviderProps,
  TooltipTriggerProps,
} from "../contracts/index.js";

/* -------------------------------------------------------------------------- */
/* Canonical component contracts                                               */
/* -------------------------------------------------------------------------- */

/**
 * The canonical shared component contract.
 *
 * Every design system must provide all fourteen entries with a compatible API
 * so Showcase and Reference App can swap systems without changing the
 * interface. The historical eight-component V1 contract
 * (`Button, Input, Card, Badge, Checkbox, Tabs, Dialog, Select`) is no longer an
 * active contract: it is referenced in comments only, for migration history.
 */

export type ButtonComponent = ComponentType<ButtonProps>;
export type InputComponent = ComponentType<InputProps>;
export type TextareaComponent = ComponentType<TextareaProps>;
export type BadgeComponent = ComponentType<BadgeProps>;
export type CheckboxComponent = ComponentType<CheckboxProps>;
export type SeparatorComponent = ComponentType<SeparatorProps>;

/**
 * Compound component contracts.
 *
 * A design system implements these by attaching the sub-components as static
 * members of the root component, e.g. `Card.Header = CardHeader`.
 */
export type CardComponent = ComponentType<CardProps> & {
  Header: ComponentType<CardHeaderProps>;
  Title: ComponentType<CardTitleProps>;
  Description: ComponentType<CardDescriptionProps>;
  Content: ComponentType<CardContentProps>;
  Footer: ComponentType<CardFooterProps>;
};

export type RadioGroupComponent = ComponentType<RadioGroupProps> & {
  Item: ComponentType<RadioGroupItemProps>;
  Indicator: ComponentType<RadioGroupIndicatorProps>;
};

export type SwitchComponent = ComponentType<SwitchProps> & {
  Thumb: ComponentType<SwitchThumbProps>;
};

export type SelectComponent = ComponentType<SelectProps> & {
  Trigger: ComponentType<SelectTriggerProps>;
  Value: ComponentType<SelectValueProps>;
  Content: ComponentType<SelectContentProps>;
  Group: ComponentType<SelectGroupProps>;
  Label: ComponentType<SelectLabelProps>;
  Item: ComponentType<SelectItemProps>;
  Separator: ComponentType<SelectSeparatorProps>;
};

export type TabsComponent = ComponentType<TabsProps> & {
  List: ComponentType<TabsListProps>;
  Trigger: ComponentType<TabsTriggerProps>;
  Content: ComponentType<TabsContentProps>;
};

export type DialogComponent = ComponentType<DialogProps> & {
  Trigger: ComponentType<DialogTriggerProps>;
  Portal: ComponentType<DialogPortalProps>;
  Overlay: ComponentType<DialogOverlayProps>;
  Content: ComponentType<DialogContentProps>;
  Header: ComponentType<DialogHeaderProps>;
  Footer: ComponentType<DialogFooterProps>;
  Title: ComponentType<DialogTitleProps>;
  Description: ComponentType<DialogDescriptionProps>;
  Close: ComponentType<DialogCloseProps>;
};

export type DropdownMenuComponent = ComponentType<DropdownMenuProps> & {
  Trigger: ComponentType<DropdownMenuTriggerProps>;
  Portal: ComponentType<DropdownMenuPortalProps>;
  Content: ComponentType<DropdownMenuContentProps>;
  Group: ComponentType<DropdownMenuGroupProps>;
  Label: ComponentType<DropdownMenuLabelProps>;
  Item: ComponentType<DropdownMenuItemProps>;
  CheckboxItem: ComponentType<DropdownMenuCheckboxItemProps>;
  RadioGroup: ComponentType<DropdownMenuRadioGroupProps>;
  RadioItem: ComponentType<DropdownMenuRadioItemProps>;
  ItemIndicator: ComponentType<DropdownMenuItemIndicatorProps>;
  Separator: ComponentType<DropdownMenuSeparatorProps>;
  Arrow: ComponentType<DropdownMenuArrowProps>;
  Sub: ComponentType<DropdownMenuSubProps>;
  SubTrigger: ComponentType<DropdownMenuSubTriggerProps>;
  SubContent: ComponentType<DropdownMenuSubContentProps>;
};

export type TooltipComponent = ComponentType<TooltipProps> & {
  Provider: ComponentType<TooltipProviderProps>;
  Trigger: ComponentType<TooltipTriggerProps>;
  Portal: ComponentType<TooltipPortalProps>;
  Content: ComponentType<TooltipContentProps>;
  Arrow: ComponentType<TooltipArrowProps>;
};

/**
 * The canonical shared component contract.
 *
 * Exactly fourteen entries, in canonical order:
 * `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Checkbox`, `RadioGroup`,
 * `Switch`, `Select`, `Tabs`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`.
 *
 * This is the only active contract. A design system must satisfy it in full;
 * the eight-component V1 contract is historical and unsupported.
 */
export interface DesignSystemComponents {
  Button: ButtonComponent;
  Input: InputComponent;
  Textarea: TextareaComponent;
  Card: CardComponent;
  Badge: BadgeComponent;
  Checkbox: CheckboxComponent;
  RadioGroup: RadioGroupComponent;
  Switch: SwitchComponent;
  Select: SelectComponent;
  Tabs: TabsComponent;
  Dialog: DialogComponent;
  DropdownMenu: DropdownMenuComponent;
  Tooltip: TooltipComponent;
  Separator: SeparatorComponent;
}

export type DesignSystemComponentName = keyof DesignSystemComponents;

/** The fourteen required component names, in canonical order. */
export const REQUIRED_COMPONENTS = [
  "Button",
  "Input",
  "Textarea",
  "Card",
  "Badge",
  "Checkbox",
  "RadioGroup",
  "Switch",
  "Select",
  "Tabs",
  "Dialog",
  "DropdownMenu",
  "Tooltip",
  "Separator",
] as const satisfies readonly DesignSystemComponentName[];

/** A design system component that may carry additional system-specific members. */
export type DesignSystemComponent = DesignSystemComponents[DesignSystemComponentName];

/* -------------------------------------------------------------------------- */
/* V2 aliases                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Source-compatible aliases to the canonical contract above.
 *
 * The V2 names are kept so existing V2 consumers keep compiling, but they are
 * exact aliases: they must never describe a different shape than
 * {@link DesignSystemComponents} and {@link REQUIRED_COMPONENTS}.
 */
export type DesignSystemComponentsV2 = DesignSystemComponents;
export type DesignSystemComponentNameV2 = DesignSystemComponentName;
export const REQUIRED_COMPONENTS_V2: typeof REQUIRED_COMPONENTS = REQUIRED_COMPONENTS;
export type DesignSystemComponentV2 = DesignSystemComponent;
