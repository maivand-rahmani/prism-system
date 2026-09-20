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

export type ButtonComponent = ComponentType<ButtonProps>;
export type InputComponent = ComponentType<InputProps>;
export type BadgeComponent = ComponentType<BadgeProps>;
export type CheckboxComponent = ComponentType<CheckboxProps>;

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

export type SelectComponent = ComponentType<SelectProps> & {
  Trigger: ComponentType<SelectTriggerProps>;
  Value: ComponentType<SelectValueProps>;
  Content: ComponentType<SelectContentProps>;
  Group: ComponentType<SelectGroupProps>;
  Label: ComponentType<SelectLabelProps>;
  Item: ComponentType<SelectItemProps>;
  Separator: ComponentType<SelectSeparatorProps>;
};

/**
 * The V1 shared component contract.
 *
 * Every design system must provide all eight entries with a compatible API so
 * Showcase and Reference App can swap systems without changing the interface.
 */
export interface DesignSystemComponents {
  Button: ButtonComponent;
  Input: InputComponent;
  Card: CardComponent;
  Badge: BadgeComponent;
  Checkbox: CheckboxComponent;
  Tabs: TabsComponent;
  Dialog: DialogComponent;
  Select: SelectComponent;
}

export type DesignSystemComponentName = keyof DesignSystemComponents;

/** The eight required V1 component names, in canonical order. */
export const REQUIRED_COMPONENTS = [
  "Button",
  "Input",
  "Card",
  "Badge",
  "Checkbox",
  "Tabs",
  "Dialog",
  "Select",
] as const satisfies readonly DesignSystemComponentName[];

/** A design system component that may carry additional system-specific members. */
export type DesignSystemComponent = DesignSystemComponents[DesignSystemComponentName];

/* -------------------------------------------------------------------------- */
/* V2 additive contract                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The V2 contract is strictly additive: it keeps every V1 entry (and therefore
 * every existing V1 system) valid while adding six more required components.
 */
export type TextareaComponent = ComponentType<TextareaProps>;

export type RadioGroupComponent = ComponentType<RadioGroupProps> & {
  Item: ComponentType<RadioGroupItemProps>;
  Indicator: ComponentType<RadioGroupIndicatorProps>;
};

export type SwitchComponent = ComponentType<SwitchProps> & {
  Thumb: ComponentType<SwitchThumbProps>;
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

export type SeparatorComponent = ComponentType<SeparatorProps>;

/**
 * The V2 shared component contract.
 *
 * It extends {@link DesignSystemComponents} so a V2 component map is also a
 * valid V1 map, which keeps downstream V1 consumers able to render a V2 system
 * without changing the interface. New systems should satisfy this contract;
 * existing systems remain V1 and are unaffected.
 */
export interface DesignSystemComponentsV2 extends DesignSystemComponents {
  Textarea: TextareaComponent;
  RadioGroup: RadioGroupComponent;
  Switch: SwitchComponent;
  DropdownMenu: DropdownMenuComponent;
  Tooltip: TooltipComponent;
  Separator: SeparatorComponent;
}

export type DesignSystemComponentNameV2 = keyof DesignSystemComponentsV2;

/** The fourteen required V2 component names, in canonical order. */
export const REQUIRED_COMPONENTS_V2 = [
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
] as const satisfies readonly DesignSystemComponentNameV2[];

/** A V2 design system component that may carry additional system-specific members. */
export type DesignSystemComponentV2 = DesignSystemComponentsV2[DesignSystemComponentNameV2];
