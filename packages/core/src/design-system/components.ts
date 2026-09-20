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
  InputProps,
  SelectContentProps,
  SelectGroupProps,
  SelectItemProps,
  SelectLabelProps,
  SelectProps,
  SelectSeparatorProps,
  SelectTriggerProps,
  SelectValueProps,
  TabsContentProps,
  TabsListProps,
  TabsProps,
  TabsTriggerProps,
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
