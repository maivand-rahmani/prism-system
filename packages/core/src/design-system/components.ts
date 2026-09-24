import type { ComponentType } from "react";
import type {
  AccordionContentProps,
  AccordionHeaderProps,
  AccordionItemProps,
  AccordionProps,
  AccordionTriggerProps,
  AlertDescriptionProps,
  AlertProps,
  AlertTitleProps,
  AvatarFallbackProps,
  AvatarImageProps,
  AvatarProps,
  BadgeProps,
  BreadcrumbsCurrentProps,
  BreadcrumbsItemProps,
  BreadcrumbsLinkProps,
  BreadcrumbsListProps,
  BreadcrumbsProps,
  ButtonProps,
  CardContentProps,
  CardDescriptionProps,
  CardFooterProps,
  CardHeaderProps,
  CardProps,
  CardTitleProps,
  CheckboxProps,
  ContainerProps,
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
  FieldsetLegendProps,
  FieldsetProps,
  FormFieldControlProps,
  FormFieldDescriptionProps,
  FormFieldErrorProps,
  FormFieldLabelProps,
  FormFieldProps,
  GridProps,
  HeadingProps,
  InputProps,
  LinkProps,
  PaginationCurrentProps,
  PaginationEllipsisProps,
  PaginationItemProps,
  PaginationLinkProps,
  PaginationListProps,
  PaginationNextProps,
  PaginationPreviousProps,
  PaginationProps,
  ProgressProps,
  RadioGroupIndicatorProps,
  RadioGroupItemProps,
  RadioGroupProps,
  SectionContentProps,
  SectionDescriptionProps,
  SectionFooterProps,
  SectionHeaderProps,
  SectionProps,
  SectionTitleProps,
  SelectContentProps,
  SelectGroupProps,
  SelectItemProps,
  SelectLabelProps,
  SelectProps,
  SelectSeparatorProps,
  SelectTriggerProps,
  SelectValueProps,
  SeparatorProps,
  SkeletonProps,
  StackProps,
  SwitchProps,
  SwitchThumbProps,
  TableBodyProps,
  TableCaptionProps,
  TableCellProps,
  TableFooterProps,
  TableHeadProps,
  TableHeaderProps,
  TableProps,
  TableRowProps,
  TabsContentProps,
  TabsListProps,
  TabsProps,
  TabsTriggerProps,
  TextProps,
  TextareaProps,
  ToastActionProps,
  ToastCloseProps,
  ToastDescriptionProps,
  ToastProps,
  ToastProviderProps,
  ToastTitleProps,
  ToastViewportProps,
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
 * This is the only active V2 contract. A design system must satisfy it in full;
 * the eight-component V1 contract is historical and unsupported. The V4 contract
 * below is a separate, additive map that never widens this one.
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

/* -------------------------------------------------------------------------- */
/* V4 contract (additive)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * V4 single-component contracts for the six new required components.
 *
 * V4 reuses the canonical V2 components unchanged for the original fourteen;
 * only the six additions and the optional components get new component types.
 */
export type HeadingComponent = ComponentType<HeadingProps>;
export type TextComponent = ComponentType<TextProps>;
export type LinkComponent = ComponentType<LinkProps>;
export type ContainerComponent = ComponentType<ContainerProps>;
export type StackComponent = ComponentType<StackProps>;

export type FormFieldComponent = ComponentType<FormFieldProps> & {
  Label: ComponentType<FormFieldLabelProps>;
  Control: ComponentType<FormFieldControlProps>;
  Description: ComponentType<FormFieldDescriptionProps>;
  Error: ComponentType<FormFieldErrorProps>;
};

/** V4 optional single-component contracts. */
export type GridComponent = ComponentType<GridProps>;
export type ProgressComponent = ComponentType<ProgressProps>;
export type SkeletonComponent = ComponentType<SkeletonProps>;

/** V4 optional compound-component contracts. */
export type SectionComponent = ComponentType<SectionProps> & {
  Header: ComponentType<SectionHeaderProps>;
  Title: ComponentType<SectionTitleProps>;
  Description: ComponentType<SectionDescriptionProps>;
  Content: ComponentType<SectionContentProps>;
  Footer: ComponentType<SectionFooterProps>;
};

export type FieldsetComponent = ComponentType<FieldsetProps> & {
  Legend: ComponentType<FieldsetLegendProps>;
};

export type AlertComponent = ComponentType<AlertProps> & {
  Title: ComponentType<AlertTitleProps>;
  Description: ComponentType<AlertDescriptionProps>;
};

export type ToastComponent = ComponentType<ToastProps> & {
  Provider: ComponentType<ToastProviderProps>;
  Viewport: ComponentType<ToastViewportProps>;
  Root: ComponentType<ToastProps>;
  Title: ComponentType<ToastTitleProps>;
  Description: ComponentType<ToastDescriptionProps>;
  Action: ComponentType<ToastActionProps>;
  Close: ComponentType<ToastCloseProps>;
};

export type AccordionComponent = ComponentType<AccordionProps> & {
  Item: ComponentType<AccordionItemProps>;
  Header: ComponentType<AccordionHeaderProps>;
  Trigger: ComponentType<AccordionTriggerProps>;
  Content: ComponentType<AccordionContentProps>;
};

export type AvatarComponent = ComponentType<AvatarProps> & {
  Image: ComponentType<AvatarImageProps>;
  Fallback: ComponentType<AvatarFallbackProps>;
};

export type BreadcrumbsComponent = ComponentType<BreadcrumbsProps> & {
  List: ComponentType<BreadcrumbsListProps>;
  Item: ComponentType<BreadcrumbsItemProps>;
  Link: ComponentType<BreadcrumbsLinkProps>;
  Current: ComponentType<BreadcrumbsCurrentProps>;
};

export type PaginationComponent = ComponentType<PaginationProps> & {
  List: ComponentType<PaginationListProps>;
  Item: ComponentType<PaginationItemProps>;
  Link: ComponentType<PaginationLinkProps>;
  Previous: ComponentType<PaginationPreviousProps>;
  Next: ComponentType<PaginationNextProps>;
  Current: ComponentType<PaginationCurrentProps>;
  Ellipsis: ComponentType<PaginationEllipsisProps>;
};

export type TableComponent = ComponentType<TableProps> & {
  Caption: ComponentType<TableCaptionProps>;
  Header: ComponentType<TableHeaderProps>;
  Body: ComponentType<TableBodyProps>;
  Footer: ComponentType<TableFooterProps>;
  Row: ComponentType<TableRowProps>;
  Head: ComponentType<TableHeadProps>;
  Cell: ComponentType<TableCellProps>;
};

/**
 * The V4 shared component contract.
 *
 * Twenty required entries, in plan order (the canonical V2 fourteen followed by
 * `Heading`, `Text`, `Link`, `Container`, `Stack`, `FormField`), plus twelve
 * optional entries that a design system implements only when it declares the
 * capability: `Grid`, `Section`, `Fieldset`, `Alert`, `Progress`, `Skeleton`,
 * `Toast`, `Accordion`, `Avatar`, `Breadcrumbs`, `Pagination`, `Table`.
 *
 * V4 is additive and separate from {@link DesignSystemComponents}: it never
 * widens the V2 map or its registry.
 */
export interface DesignSystemComponentsV4 {
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
  Heading: HeadingComponent;
  Text: TextComponent;
  Link: LinkComponent;
  Container: ContainerComponent;
  Stack: StackComponent;
  FormField: FormFieldComponent;
  Grid?: GridComponent;
  Section?: SectionComponent;
  Fieldset?: FieldsetComponent;
  Alert?: AlertComponent;
  Progress?: ProgressComponent;
  Skeleton?: SkeletonComponent;
  Toast?: ToastComponent;
  Accordion?: AccordionComponent;
  Avatar?: AvatarComponent;
  Breadcrumbs?: BreadcrumbsComponent;
  Pagination?: PaginationComponent;
  Table?: TableComponent;
}

export type DesignSystemComponentNameV4 = keyof DesignSystemComponentsV4;

/** The twenty required V4 component names, in plan order. */
export const REQUIRED_COMPONENTS_V4 = [
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
  "Heading",
  "Text",
  "Link",
  "Container",
  "Stack",
  "FormField",
] as const satisfies readonly DesignSystemComponentNameV4[];

/** The twelve optional V4 component names, in plan order. */
export const OPTIONAL_COMPONENTS_V4 = [
  "Grid",
  "Section",
  "Fieldset",
  "Alert",
  "Progress",
  "Skeleton",
  "Toast",
  "Accordion",
  "Avatar",
  "Breadcrumbs",
  "Pagination",
  "Table",
] as const satisfies readonly DesignSystemComponentNameV4[];

/** A V4 design system component that may carry additional system-specific members. */
export type DesignSystemComponentV4 = DesignSystemComponentsV4[DesignSystemComponentNameV4];
