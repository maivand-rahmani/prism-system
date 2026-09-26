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
  AspectRatioProps,
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
  CenterProps,
  CheckboxProps,
  ClusterProps,
  ComboboxContentProps,
  ComboboxInputProps,
  ComboboxItemProps,
  ComboboxProps,
  ContainerProps,
  DatePickerProps,
  DescriptionListDescriptionProps,
  DescriptionListItemProps,
  DescriptionListProps,
  DescriptionListTermProps,
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
  EmptyStateActionProps,
  EmptyStateDescriptionProps,
  EmptyStateProps,
  EmptyStateTitleProps,
  FieldsetLegendProps,
  FieldsetProps,
  FileUploadProps,
  FormFieldControlProps,
  FormFieldDescriptionProps,
  FormFieldErrorProps,
  FormFieldLabelProps,
  FormFieldProps,
  GridProps,
  HeadingProps,
  InputProps,
  LinkProps,
  MeterProps,
  MetricDescriptionProps,
  MetricLabelProps,
  MetricProps,
  MetricValueProps,
  NumberFieldProps,
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
  SidebarProps,
  SkeletonProps,
  SliderProps,
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
  TimelineDescriptionProps,
  TimelineItemProps,
  TimelineProps,
  TimelineTimeProps,
  TimelineTitleProps,
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
/* Component contracts                                                         */
/* -------------------------------------------------------------------------- */

export type ButtonComponent = ComponentType<ButtonProps>;
export type InputComponent = ComponentType<InputProps>;
export type TextareaComponent = ComponentType<TextareaProps>;
export type BadgeComponent = ComponentType<BadgeProps>;
export type CheckboxComponent = ComponentType<CheckboxProps>;
export type SeparatorComponent = ComponentType<SeparatorProps>;
export type HeadingComponent = ComponentType<HeadingProps>;
export type TextComponent = ComponentType<TextProps>;
export type LinkComponent = ComponentType<LinkProps>;
export type ContainerComponent = ComponentType<ContainerProps>;
export type StackComponent = ComponentType<StackProps>;
export type GridComponent = ComponentType<GridProps>;
export type ProgressComponent = ComponentType<ProgressProps>;
export type SkeletonComponent = ComponentType<SkeletonProps>;
export type CenterComponent = ComponentType<CenterProps>;
export type ClusterComponent = ComponentType<ClusterProps>;
export type SidebarComponent = ComponentType<SidebarProps>;
export type AspectRatioComponent = ComponentType<AspectRatioProps>;
export type DatePickerComponent = ComponentType<DatePickerProps>;
export type NumberFieldComponent = ComponentType<NumberFieldProps>;
export type SliderComponent = ComponentType<SliderProps>;
export type FileUploadComponent = ComponentType<FileUploadProps>;
export type MeterComponent = ComponentType<MeterProps>;

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

export type FormFieldComponent = ComponentType<FormFieldProps> & {
  Label: ComponentType<FormFieldLabelProps>;
  Control: ComponentType<FormFieldControlProps>;
  Description: ComponentType<FormFieldDescriptionProps>;
  Error: ComponentType<FormFieldErrorProps>;
};

export type ComboboxComponent = ComponentType<ComboboxProps> & {
  Input: ComponentType<ComboboxInputProps>;
  Content: ComponentType<ComboboxContentProps>;
  Item: ComponentType<ComboboxItemProps>;
};

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

export type MetricComponent = ComponentType<MetricProps> & {
  Label: ComponentType<MetricLabelProps>;
  Value: ComponentType<MetricValueProps>;
  Description: ComponentType<MetricDescriptionProps>;
};

export type DescriptionListComponent = ComponentType<DescriptionListProps> & {
  Item: ComponentType<DescriptionListItemProps>;
  Term: ComponentType<DescriptionListTermProps>;
  Description: ComponentType<DescriptionListDescriptionProps>;
};

export type TimelineComponent = ComponentType<TimelineProps> & {
  Item: ComponentType<TimelineItemProps>;
  Title: ComponentType<TimelineTitleProps>;
  Time: ComponentType<TimelineTimeProps>;
  Description: ComponentType<TimelineDescriptionProps>;
};

export type EmptyStateComponent = ComponentType<EmptyStateProps> & {
  Title: ComponentType<EmptyStateTitleProps>;
  Description: ComponentType<EmptyStateDescriptionProps>;
  Action: ComponentType<EmptyStateActionProps>;
};

/* -------------------------------------------------------------------------- */
/* The shared component contract                                               */
/* -------------------------------------------------------------------------- */

/**
 * The shared component contract.
 *
 * Twenty-nine required entries, in canonical order: the established contract
 * through `FormField`, followed by `Center`, `Cluster`, `Sidebar`,
 * `AspectRatio`, `Combobox`, `DatePicker`, `NumberField`, `Slider`, and
 * `FileUpload`.
 *
 * Seventeen optional entries: `Grid`, `Section`, `Fieldset`, `Alert`,
 * `Progress`, `Skeleton`, `Toast`, `Accordion`, `Avatar`, `Breadcrumbs`,
 * `Pagination`, `Table`, `Metric`, `DescriptionList`, `Timeline`, `Meter`, and
 * `EmptyState`.
 *
 * Every design system must provide all twenty-nine required entries with a
 * compatible API so Showcase and Reference App can swap systems without
 * changing the interface. Optional entries are capabilities: a system declares
 * only the ones it really implements, and an omitted name is unavailable —
 * empty stubs are not allowed.
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
  Heading: HeadingComponent;
  Text: TextComponent;
  Link: LinkComponent;
  Container: ContainerComponent;
  Stack: StackComponent;
  FormField: FormFieldComponent;
  Center: CenterComponent;
  Cluster: ClusterComponent;
  Sidebar: SidebarComponent;
  AspectRatio: AspectRatioComponent;
  Combobox: ComboboxComponent;
  DatePicker: DatePickerComponent;
  NumberField: NumberFieldComponent;
  Slider: SliderComponent;
  FileUpload: FileUploadComponent;
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
  Metric?: MetricComponent;
  DescriptionList?: DescriptionListComponent;
  Timeline?: TimelineComponent;
  Meter?: MeterComponent;
  EmptyState?: EmptyStateComponent;
}

export type DesignSystemComponentName = keyof DesignSystemComponents;

/** The twenty-nine required component names, in canonical order. */
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
  "Heading",
  "Text",
  "Link",
  "Container",
  "Stack",
  "FormField",
  "Center",
  "Cluster",
  "Sidebar",
  "AspectRatio",
  "Combobox",
  "DatePicker",
  "NumberField",
  "Slider",
  "FileUpload",
] as const satisfies readonly DesignSystemComponentName[];

/** The seventeen optional component names, in canonical order. */
export const OPTIONAL_COMPONENTS = [
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
  "Metric",
  "DescriptionList",
  "Timeline",
  "Meter",
  "EmptyState",
] as const satisfies readonly DesignSystemComponentName[];

type RequiredComponentName = (typeof REQUIRED_COMPONENTS)[number];
type OptionalComponentName = (typeof OPTIONAL_COMPONENTS)[number];

/**
 * A component value a design system may declare in the shared contract.
 *
 * The union of every required and optional component type. Optional names are
 * absent from systems that do not implement them; when declared, the value must
 * be a real component, never `undefined` or `null`.
 */
export type DesignSystemComponent =
  | DesignSystemComponents[RequiredComponentName]
  | NonNullable<DesignSystemComponents[OptionalComponentName]>;
