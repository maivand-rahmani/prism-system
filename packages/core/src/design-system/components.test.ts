/**
 * Compile-time contract fixture for the shared component contract.
 *
 * This file is intentionally not executed by a test framework: it proves, at
 * typecheck time, that
 *  1. the `DesignSystemComponents` map and `REQUIRED_COMPONENTS` tuple are the
 *     exact twenty-nine required components, in canonical order,
 *  2. the `OPTIONAL_COMPONENTS` tuple is the exact seventeen optional
 *     components, in canonical order,
 *  3. `DesignSystemComponentName` covers exactly the required and optional
 *     names, and optional omission stays optional,
 *  4. `defineDesignSystem` accepts the full required shape (with any optional
 *     subset) and requires the numeric `contractVersion: 4` marker, and
 *  5. an incorrect shape or marker is rejected by both the definition helper and
 *     the registry.
 *
 * The registry's runtime marker guard is implemented in `design-system.ts`;
 * this fixture covers its static typing, not execution.
 *
 * `tsconfig.build.json` excludes `*.test.ts`, so nothing here ships in `dist`.
 */
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
import {
  OPTIONAL_COMPONENTS,
  REQUIRED_COMPONENTS,
  type DesignSystemComponent,
  type DesignSystemComponentName,
  type DesignSystemComponents,
} from "./components.js";
import {
  createDesignSystemRegistry,
  defineDesignSystem,
  type DesignSystem,
} from "./design-system.js";

/** A typed component stub that accepts exactly the contract props. */
function component<P>(_props: P): null {
  return null;
}

const Button = component<ButtonProps>;
const Input = component<InputProps>;
const Textarea = component<TextareaProps>;
const Badge = component<BadgeProps>;
const Checkbox = component<CheckboxProps>;
const Separator = component<SeparatorProps>;
const Heading = component<HeadingProps>;
const Text = component<TextProps>;
const Link = component<LinkProps>;
const Container = component<ContainerProps>;
const Stack = component<StackProps>;
const Grid = component<GridProps>;
const Progress = component<ProgressProps>;
const Skeleton = component<SkeletonProps>;
const Meter = component<MeterProps>;
const Center = component<CenterProps>;
const Cluster = component<ClusterProps>;
const Sidebar = component<SidebarProps>;
const AspectRatio = component<AspectRatioProps>;
const DatePicker = component<DatePickerProps>;
const NumberField = component<NumberFieldProps>;
const Slider = component<SliderProps>;
const FileUpload = component<FileUploadProps>;

const Card = Object.assign(component<CardProps>, {
  Header: component<CardHeaderProps>,
  Title: component<CardTitleProps>,
  Description: component<CardDescriptionProps>,
  Content: component<CardContentProps>,
  Footer: component<CardFooterProps>,
});

const RadioGroup = Object.assign(component<RadioGroupProps>, {
  Item: component<RadioGroupItemProps>,
  Indicator: component<RadioGroupIndicatorProps>,
});

const Switch = Object.assign(component<SwitchProps>, {
  Thumb: component<SwitchThumbProps>,
});

const Select = Object.assign(component<SelectProps>, {
  Trigger: component<SelectTriggerProps>,
  Value: component<SelectValueProps>,
  Content: component<SelectContentProps>,
  Group: component<SelectGroupProps>,
  Label: component<SelectLabelProps>,
  Item: component<SelectItemProps>,
  Separator: component<SelectSeparatorProps>,
});

const Tabs = Object.assign(component<TabsProps>, {
  List: component<TabsListProps>,
  Trigger: component<TabsTriggerProps>,
  Content: component<TabsContentProps>,
});

const Dialog = Object.assign(component<DialogProps>, {
  Trigger: component<DialogTriggerProps>,
  Portal: component<DialogPortalProps>,
  Overlay: component<DialogOverlayProps>,
  Content: component<DialogContentProps>,
  Header: component<DialogHeaderProps>,
  Footer: component<DialogFooterProps>,
  Title: component<DialogTitleProps>,
  Description: component<DialogDescriptionProps>,
  Close: component<DialogCloseProps>,
});

const DropdownMenu = Object.assign(component<DropdownMenuProps>, {
  Trigger: component<DropdownMenuTriggerProps>,
  Portal: component<DropdownMenuPortalProps>,
  Content: component<DropdownMenuContentProps>,
  Group: component<DropdownMenuGroupProps>,
  Label: component<DropdownMenuLabelProps>,
  Item: component<DropdownMenuItemProps>,
  CheckboxItem: component<DropdownMenuCheckboxItemProps>,
  RadioGroup: component<DropdownMenuRadioGroupProps>,
  RadioItem: component<DropdownMenuRadioItemProps>,
  ItemIndicator: component<DropdownMenuItemIndicatorProps>,
  Separator: component<DropdownMenuSeparatorProps>,
  Arrow: component<DropdownMenuArrowProps>,
  Sub: component<DropdownMenuSubProps>,
  SubTrigger: component<DropdownMenuSubTriggerProps>,
  SubContent: component<DropdownMenuSubContentProps>,
});

const Tooltip = Object.assign(component<TooltipProps>, {
  Provider: component<TooltipProviderProps>,
  Trigger: component<TooltipTriggerProps>,
  Portal: component<TooltipPortalProps>,
  Content: component<TooltipContentProps>,
  Arrow: component<TooltipArrowProps>,
});

const FormField = Object.assign(component<FormFieldProps>, {
  Label: component<FormFieldLabelProps>,
  Control: component<FormFieldControlProps>,
  Description: component<FormFieldDescriptionProps>,
  Error: component<FormFieldErrorProps>,
});

const Combobox = Object.assign(component<ComboboxProps>, {
  Input: component<ComboboxInputProps>,
  Content: component<ComboboxContentProps>,
  Item: component<ComboboxItemProps>,
});

const Section = Object.assign(component<SectionProps>, {
  Header: component<SectionHeaderProps>,
  Title: component<SectionTitleProps>,
  Description: component<SectionDescriptionProps>,
  Content: component<SectionContentProps>,
  Footer: component<SectionFooterProps>,
});

const Fieldset = Object.assign(component<FieldsetProps>, {
  Legend: component<FieldsetLegendProps>,
});

const Alert = Object.assign(component<AlertProps>, {
  Title: component<AlertTitleProps>,
  Description: component<AlertDescriptionProps>,
});

const Toast = Object.assign(component<ToastProps>, {
  Provider: component<ToastProviderProps>,
  Viewport: component<ToastViewportProps>,
  Root: component<ToastProps>,
  Title: component<ToastTitleProps>,
  Description: component<ToastDescriptionProps>,
  Action: component<ToastActionProps>,
  Close: component<ToastCloseProps>,
});

const Accordion = Object.assign(component<AccordionProps>, {
  Item: component<AccordionItemProps>,
  Header: component<AccordionHeaderProps>,
  Trigger: component<AccordionTriggerProps>,
  Content: component<AccordionContentProps>,
});

const Avatar = Object.assign(component<AvatarProps>, {
  Image: component<AvatarImageProps>,
  Fallback: component<AvatarFallbackProps>,
});

const Breadcrumbs = Object.assign(component<BreadcrumbsProps>, {
  List: component<BreadcrumbsListProps>,
  Item: component<BreadcrumbsItemProps>,
  Link: component<BreadcrumbsLinkProps>,
  Current: component<BreadcrumbsCurrentProps>,
});

const Pagination = Object.assign(component<PaginationProps>, {
  List: component<PaginationListProps>,
  Item: component<PaginationItemProps>,
  Link: component<PaginationLinkProps>,
  Previous: component<PaginationPreviousProps>,
  Next: component<PaginationNextProps>,
  Current: component<PaginationCurrentProps>,
  Ellipsis: component<PaginationEllipsisProps>,
});

const Table = Object.assign(component<TableProps>, {
  Caption: component<TableCaptionProps>,
  Header: component<TableHeaderProps>,
  Body: component<TableBodyProps>,
  Footer: component<TableFooterProps>,
  Row: component<TableRowProps>,
  Head: component<TableHeadProps>,
  Cell: component<TableCellProps>,
});

const Metric = Object.assign(component<MetricProps>, {
  Label: component<MetricLabelProps>,
  Value: component<MetricValueProps>,
  Description: component<MetricDescriptionProps>,
});

const DescriptionList = Object.assign(component<DescriptionListProps>, {
  Item: component<DescriptionListItemProps>,
  Term: component<DescriptionListTermProps>,
  Description: component<DescriptionListDescriptionProps>,
});

const Timeline = Object.assign(component<TimelineProps>, {
  Item: component<TimelineItemProps>,
  Title: component<TimelineTitleProps>,
  Time: component<TimelineTimeProps>,
  Description: component<TimelineDescriptionProps>,
});

const EmptyState = Object.assign(component<EmptyStateProps>, {
  Title: component<EmptyStateTitleProps>,
  Description: component<EmptyStateDescriptionProps>,
  Action: component<EmptyStateActionProps>,
});

/** A valid map with the twenty-nine required components and no optional members. */
export const COMPONENTS_FIXTURE: DesignSystemComponents = {
  Button,
  Input,
  Textarea,
  Card,
  Badge,
  Checkbox,
  RadioGroup,
  Switch,
  Select,
  Tabs,
  Dialog,
  DropdownMenu,
  Tooltip,
  Separator,
  Heading,
  Text,
  Link,
  Container,
  Stack,
  FormField,
  Center,
  Cluster,
  Sidebar,
  AspectRatio,
  Combobox,
  DatePicker,
  NumberField,
  Slider,
  FileUpload,
};

/** A valid map with every optional component declared. */
export const COMPONENTS_ALL_OPTIONALS_FIXTURE: DesignSystemComponents = {
  ...COMPONENTS_FIXTURE,
  Grid,
  Section,
  Fieldset,
  Alert,
  Progress,
  Skeleton,
  Toast,
  Accordion,
  Avatar,
  Breadcrumbs,
  Pagination,
  Table,
  Metric,
  DescriptionList,
  Timeline,
  Meter,
  EmptyState,
};

/** A valid map with a different optional subset. */
export const COMPONENTS_SUBSET_FIXTURE: DesignSystemComponents = {
  ...COMPONENTS_FIXTURE,
  Grid,
  Alert,
  Table,
};

/* -------------------------------------------------------------------------- */
/* Contract / tuple assertions                                                 */
/* -------------------------------------------------------------------------- */

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The required tuple names exactly the twenty-nine required keys, in order. */
export const REQUIRED_TUPLE_IS_EXACT: Equal<
  (typeof REQUIRED_COMPONENTS)[number],
  | "Button"
  | "Input"
  | "Textarea"
  | "Card"
  | "Badge"
  | "Checkbox"
  | "RadioGroup"
  | "Switch"
  | "Select"
  | "Tabs"
  | "Dialog"
  | "DropdownMenu"
  | "Tooltip"
  | "Separator"
  | "Heading"
  | "Text"
  | "Link"
  | "Container"
  | "Stack"
  | "FormField"
  | "Center"
  | "Cluster"
  | "Sidebar"
  | "AspectRatio"
  | "Combobox"
  | "DatePicker"
  | "NumberField"
  | "Slider"
  | "FileUpload"
> = true;

/** The optional tuple names exactly the seventeen optional keys, in order. */
export const OPTIONAL_TUPLE_IS_EXACT: Equal<
  (typeof OPTIONAL_COMPONENTS)[number],
  | "Grid"
  | "Section"
  | "Fieldset"
  | "Alert"
  | "Progress"
  | "Skeleton"
  | "Toast"
  | "Accordion"
  | "Avatar"
  | "Breadcrumbs"
  | "Pagination"
  | "Table"
  | "Metric"
  | "DescriptionList"
  | "Timeline"
  | "Meter"
  | "EmptyState"
> = true;

/** The explicit expected tuples double as literal-order assertions. */
export const EXPECTED_REQUIRED_TUPLE: typeof REQUIRED_COMPONENTS = [
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
];

export const EXPECTED_OPTIONAL_TUPLE: typeof OPTIONAL_COMPONENTS = [
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
];

/** The contract requires exactly twenty-nine components and offers seventeen optional. */
export const REQUIRED_COUNT: 29 = REQUIRED_COMPONENTS.length;
export const OPTIONAL_COUNT: 17 = OPTIONAL_COMPONENTS.length;

/** Every map key is required or optional: no stray names exist. */
export const NAME_IS_REQUIRED_OR_OPTIONAL: Equal<
  DesignSystemComponentName,
  (typeof REQUIRED_COMPONENTS)[number] | (typeof OPTIONAL_COMPONENTS)[number]
> = true;

/** A required component satisfies the component union. */
export const REQUIRED_COMPONENT_SAMPLE: DesignSystemComponent = Button;

/** An optional component also satisfies the component union. */
export const OPTIONAL_COMPONENT_SAMPLE: DesignSystemComponent = Grid;

/* -------------------------------------------------------------------------- */
/* Design system definition assertions                                         */
/* -------------------------------------------------------------------------- */

/** `defineDesignSystem` accepts the required shape and the numeric marker. */
export const DEFINITION_FIXTURE = defineDesignSystem({
  id: "fixture-current",
  name: "Fixture Current",
  packageName: "@prism-system/fixture-current",
  version: "0.0.0",
  contractVersion: 4,
  components: COMPONENTS_FIXTURE,
});

/** The same, with every optional component declared. */
export const DEFINITION_WITH_OPTIONALS_FIXTURE = defineDesignSystem({
  id: "fixture-current-optionals",
  name: "Fixture Current with optionals",
  packageName: "@prism-system/fixture-current-optionals",
  version: "0.0.0",
  contractVersion: 4,
  components: COMPONENTS_ALL_OPTIONALS_FIXTURE,
});

/** The same, with a different optional subset. */
export const DEFINITION_WITH_SUBSET_FIXTURE = defineDesignSystem({
  id: "fixture-current-subset",
  name: "Fixture Current with a subset",
  packageName: "@prism-system/fixture-current-subset",
  version: "0.0.0",
  contractVersion: 4,
  components: COMPONENTS_SUBSET_FIXTURE,
});

/** The accepted definitions satisfy `DesignSystem`. */
export const DEFINITION_IS_DESIGN_SYSTEM: DesignSystem = DEFINITION_FIXTURE;
export const DEFINITION_WITH_OPTIONALS_IS_DESIGN_SYSTEM: DesignSystem =
  DEFINITION_WITH_OPTIONALS_FIXTURE;

/** The definition helper preserves the literal `id` and the numeric marker. */
export const DEFINITION_ID: "fixture-current" = DEFINITION_FIXTURE.id;
export const DEFINITION_CONTRACT_VERSION: 4 = DEFINITION_FIXTURE.contractVersion;

/* -------------------------------------------------------------------------- */
/* Registry assertions                                                         */
/* -------------------------------------------------------------------------- */

/** The registry accepts a current system and resolves it by id. */
export const REGISTRY_FIXTURE = createDesignSystemRegistry([DEFINITION_FIXTURE]);
export const REGISTERED_SYSTEM: DesignSystem | undefined = REGISTRY_FIXTURE.get("fixture-current");

/* -------------------------------------------------------------------------- */
/* Negative fixtures (compile-time only)                                       */
/* -------------------------------------------------------------------------- */

/** A map missing every component added after the original fourteen. */
const MISSING_REQUIRED_COMPONENTS = {
  Button,
  Input,
  Textarea,
  Card,
  Badge,
  Checkbox,
  RadioGroup,
  Switch,
  Select,
  Tabs,
  Dialog,
  DropdownMenu,
  Tooltip,
  Separator,
};

/** The contract requires all twenty-nine components. */
// @ts-expect-error - the contract requires all twenty-nine components.
const _MISSING_REQUIRED_MAP: DesignSystemComponents = MISSING_REQUIRED_COMPONENTS;

/** Unknown component names are rejected by the map. */
const _UNKNOWN_KEY_MAP: DesignSystemComponents = {
  ...COMPONENTS_FIXTURE,
  // @ts-expect-error - unknown component names are rejected by the contract.
  NotAComponent: Button,
};

/** An explicitly declared `null` optional component is not a component. */
const _NULL_OPTIONAL_MAP: DesignSystemComponents = {
  ...COMPONENTS_FIXTURE,
  // @ts-expect-error - a declared optional component must be a real component.
  Grid: null,
};

/** The numeric marker is required: an unversioned object is rejected. */
export const UNVERSIONED_SYSTEM = {
  id: "fixture-unversioned",
  name: "Fixture unversioned",
  packageName: "@prism-system/fixture-unversioned",
  version: "0.0.0",
  components: COMPONENTS_FIXTURE,
};
// @ts-expect-error - contractVersion is required.
export const UNVERSIONED_DEFINITION = defineDesignSystem(UNVERSIONED_SYSTEM);

/** The marker must be the number 4. */
export const WRONG_VERSION_SYSTEM = {
  id: "fixture-wrong-version",
  name: "Fixture wrong version",
  packageName: "@prism-system/fixture-wrong-version",
  version: "0.0.0",
  contractVersion: 3,
  components: COMPONENTS_FIXTURE,
};
// @ts-expect-error - contractVersion must be 4.
export const WRONG_VERSION_DEFINITION = defineDesignSystem(WRONG_VERSION_SYSTEM);

/** A string marker is not accepted. */
export const STRING_VERSION_SYSTEM = {
  id: "fixture-string-version",
  name: "Fixture string version",
  packageName: "@prism-system/fixture-string-version",
  version: "0.0.0",
  contractVersion: "4",
  components: COMPONENTS_FIXTURE,
};
// @ts-expect-error - contractVersion must be the number 4.
export const STRING_VERSION_DEFINITION = defineDesignSystem(STRING_VERSION_SYSTEM);

// Keep intentionally-unused negative fixtures type-checked without lint noise.
export type _NegativeFixtures = [
  typeof _MISSING_REQUIRED_MAP,
  typeof _UNKNOWN_KEY_MAP,
  typeof _NULL_OPTIONAL_MAP,
  typeof UNVERSIONED_DEFINITION,
  typeof WRONG_VERSION_DEFINITION,
  typeof STRING_VERSION_DEFINITION,
];

/* -------------------------------------------------------------------------- */
/* New contract shape assertions                                               */
/* -------------------------------------------------------------------------- */

/** `Combobox` accepts controlled and uncontrolled state and a required message. */
export const COMBOBOX_PROPS_FIXTURE: ComboboxProps = {
  value: "apple",
  onValueChange: () => undefined,
  inputValue: "App",
  onInputValueChange: () => undefined,
  open: true,
  onOpenChange: () => undefined,
  disabled: false,
  required: true,
  requiredMessage: "Pick a fruit",
  invalid: false,
  name: "fruit",
};

/** Options require a value; the optional text/value props are accepted. */
export const COMBOBOX_ITEM_FIXTURE: ComboboxItemProps = {
  value: "apple",
  disabled: false,
  textValue: "Apple",
};

/** The input is the focusable control and keeps native forwarding props. */
export const COMBOBOX_INPUT_FIXTURE: ComboboxInputProps = {
  id: "fruit",
  required: true,
  disabled: false,
  invalid: true,
  "aria-describedby": "fruit-help",
};

/** `Combobox.Item` requires `value`: an option without one must not compile. */
// @ts-expect-error - `value` is required on Combobox.Item.
const _COMBOBOX_ITEM_MISSING_VALUE: ComboboxItemProps = { disabled: true };

/** The input fixes its own `type`; consumers cannot change it. */
// @ts-expect-error - Combobox.Input owns its fixed `type`.
const _COMBOBOX_INPUT_WITH_TYPE: ComboboxInputProps = { type: "text" };

/** The input owns its name/query; the root renders the named hidden value. */
// @ts-expect-error - Combobox.Input owns its `name`.
const _COMBOBOX_INPUT_WITH_NAME: ComboboxInputProps = { name: "fruit" };
// @ts-expect-error - Combobox.Input owns its controlled `value`.
const _COMBOBOX_INPUT_WITH_VALUE: ComboboxInputProps = { value: "apple" };

/** Date/number/range/file controls fix their native `type`. */
export const DATE_PICKER_FIXTURE: DatePickerProps = { type: "date", invalid: true };
export const NUMBER_FIELD_FIXTURE: NumberFieldProps = { type: "number" };
export const SLIDER_FIXTURE: SliderProps = { type: "range", min: 0, max: 100 };
export const FILE_UPLOAD_FIXTURE: FileUploadProps = { type: "file", multiple: true };
// @ts-expect-error - DatePicker is fixed to `date`.
const _DATE_PICKER_WRONG_TYPE: DatePickerProps = { type: "datetime-local" };

/** The native input `type` is omitted from the prop base entirely. */
// @ts-expect-error - `type` is removed from the NumberField prop base.
const _NUMBER_FIELD_WITHOUT_LITERAL: NumberFieldProps = { type: "text" };

/** `AspectRatio` adds only a structural ratio. */
export const ASPECT_RATIO_FIXTURE: AspectRatioProps = { ratio: 16 / 9 };

/** Center, Cluster, and Sidebar are plain layout divs. */
export const CENTER_FIXTURE: CenterProps = { id: "center" };
export const CLUSTER_FIXTURE: ClusterProps = { id: "cluster" };
export const SIDEBAR_FIXTURE: SidebarProps = { id: "sidebar" };

/** Optional display compounds keep native member elements. */
export const METRIC_FIXTURE: MetricProps = { id: "metrics" };
export const METRIC_MEMBERS_FIXTURE: [MetricLabelProps, MetricValueProps, MetricDescriptionProps] =
  [{}, { children: 42 }, { children: "last month" }];
export const DESCRIPTION_LIST_FIXTURE: DescriptionListProps = { id: "specs" };
export const TIMELINE_FIXTURE: TimelineProps = { id: "history" };
export const TIMELINE_TIME_FIXTURE: TimelineTimeProps = { dateTime: "2026-09-26T12:00:00Z" };
export const EMPTY_STATE_FIXTURE: EmptyStateProps = { id: "empty" };
export const EMPTY_STATE_MEMBERS_FIXTURE: [
  EmptyStateTitleProps,
  EmptyStateDescriptionProps,
  EmptyStateActionProps,
] = [{}, {}, {}];

/* -------------------------------------------------------------------------- */
/* Meter accessible name assertion                                             */
/* -------------------------------------------------------------------------- */

/** `Meter` accepts the required accessible name. */
export const METER_WITH_LABEL: MeterProps = { value: 0.5, "aria-label": "Disk usage" };
export const METER_WITH_LABELLEDBY: MeterProps = {
  value: 0.5,
  "aria-labelledby": "disk-usage-label",
};

/** `Meter` requires an accessible name; a bare meter must not compile. */
// @ts-expect-error - `Meter` requires `aria-label` or `aria-labelledby`.
const _METER_WITHOUT_NAME: MeterProps = { value: 0.5 };

export type _NewContractNegativeFixtures = [
  typeof _COMBOBOX_ITEM_MISSING_VALUE,
  typeof _COMBOBOX_INPUT_WITH_TYPE,
  typeof _COMBOBOX_INPUT_WITH_NAME,
  typeof _COMBOBOX_INPUT_WITH_VALUE,
  typeof _DATE_PICKER_WRONG_TYPE,
  typeof _NUMBER_FIELD_WITHOUT_LITERAL,
  typeof _METER_WITHOUT_NAME,
];

/* -------------------------------------------------------------------------- */
/* Avatar.Image accessibility assertion                                        */
/* -------------------------------------------------------------------------- */

/** `Avatar.Image` accepts the required text alternative. */
export const AVATAR_IMAGE_WITH_ALT: AvatarImageProps = { alt: "Ada Lovelace" };

/**
 * `Avatar.Image` requires `alt`: native `img` props allow it to be omitted, but
 * the contract removes that optionality, so a missing `alt` must not compile.
 */
// @ts-expect-error - `alt` is required on Avatar.Image.
const _AVATAR_IMAGE_MISSING_ALT: AvatarImageProps = {};

export type _A11yNegativeFixtures = [typeof _AVATAR_IMAGE_MISSING_ALT];
