/**
 * Compile-time contract fixture for the V2-only canonical component contract.
 *
 * This file is intentionally not executed by a test framework: it proves, at
 * typecheck time, that
 *  1. the canonical `DesignSystemComponents` map and `REQUIRED_COMPONENTS`
 *     tuple are the exact fourteen V2 components, in canonical order,
 *  2. the V2-named exports are exact aliases of the canonical contract,
 *  3. `defineDesignSystem` / `defineDesignSystemV2` accept the full fourteen-
 *     component shape and require the `"v2"` marker, and
 *  4. an eight-component V1-only object is rejected by both the definition
 *     helpers and the registry.
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
import {
  OPTIONAL_COMPONENTS_V4,
  REQUIRED_COMPONENTS,
  REQUIRED_COMPONENTS_V2,
  REQUIRED_COMPONENTS_V4,
  type DesignSystemComponent,
  type DesignSystemComponentName,
  type DesignSystemComponentNameV2,
  type DesignSystemComponentNameV4,
  type DesignSystemComponentV2,
  type DesignSystemComponentV4,
  type DesignSystemComponents,
  type DesignSystemComponentsV2,
  type DesignSystemComponentsV4,
} from "./components.js";
import {
  createDesignSystemRegistry,
  createDesignSystemRegistryV4,
  defineDesignSystem,
  defineDesignSystemV2,
  defineDesignSystemV4,
  type DesignSystem,
  type DesignSystemV2,
  type DesignSystemV4,
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

/** A complete canonical (fourteen-component) map; assignability is the assertion. */
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
};

/** A canonical map also satisfies the V2-named alias, because they are identical. */
export const COMPONENTS_V2_FIXTURE: DesignSystemComponentsV2 = COMPONENTS_FIXTURE;

/* -------------------------------------------------------------------------- */
/* Contract / tuple assertions                                                 */
/* -------------------------------------------------------------------------- */

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The canonical tuple names exactly the canonical contract keys. */
export const CANONICAL_TUPLE_IS_EXACT: Equal<
  (typeof REQUIRED_COMPONENTS)[number],
  DesignSystemComponentName
> = true;

/** The canonical tuple is exactly these names, in this order. */
export const EXPECTED_CANONICAL_TUPLE: typeof REQUIRED_COMPONENTS = [
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
];

/** The canonical contract has exactly fourteen entries. */
export const CANONICAL_REQUIRED_COUNT: 14 = REQUIRED_COMPONENTS.length;

/** The canonical contract is not the historical eight-component V1 set. */
export const CANONICAL_IS_NOT_V1: Equal<
  DesignSystemComponentName,
  "Button" | "Input" | "Card" | "Badge" | "Checkbox" | "Tabs" | "Dialog" | "Select"
> = false;

/** Every V2-named export is an exact alias of the canonical contract. */
export const V2_COMPONENTS_IS_CANONICAL: Equal<DesignSystemComponentsV2, DesignSystemComponents> =
  true;
export const V2_NAME_IS_CANONICAL: Equal<DesignSystemComponentNameV2, DesignSystemComponentName> =
  true;
export const V2_COMPONENT_IS_CANONICAL: Equal<DesignSystemComponentV2, DesignSystemComponent> =
  true;
export const V2_TUPLE_IS_CANONICAL: Equal<
  (typeof REQUIRED_COMPONENTS_V2)[number],
  (typeof REQUIRED_COMPONENTS)[number]
> = true;
export const V2_TUPLE_IS_CANONICAL_VALUE: typeof REQUIRED_COMPONENTS = REQUIRED_COMPONENTS_V2;
export const V2_REQUIRED_COUNT: 14 = REQUIRED_COMPONENTS_V2.length;

/* -------------------------------------------------------------------------- */
/* Design system definition assertions                                         */
/* -------------------------------------------------------------------------- */

/** `defineDesignSystem` accepts the full fourteen-component shape and marker. */
export const DEFINITION_FIXTURE = defineDesignSystem({
  id: "fixture-v2",
  name: "Fixture V2",
  packageName: "@prism-system/fixture-v2",
  version: "0.0.0",
  componentContract: "v2",
  components: COMPONENTS_FIXTURE,
});

/** `defineDesignSystemV2` accepts the same full shape and marker. */
export const V2_DEFINITION_FIXTURE = defineDesignSystemV2({
  id: "fixture-v2-v2",
  name: "Fixture V2 via defineDesignSystemV2",
  packageName: "@prism-system/fixture-v2-v2",
  version: "0.0.0",
  componentContract: "v2",
  components: COMPONENTS_FIXTURE,
});

/** The accepted definitions satisfy `DesignSystem` / `DesignSystemV2`. */
export const DEFINITION_IS_DESIGN_SYSTEM: DesignSystem = DEFINITION_FIXTURE;
export const V2_DEFINITION_IS_V2: DesignSystemV2 = V2_DEFINITION_FIXTURE;

/** The definition helpers preserve the literal `id` and the `"v2"` marker. */
export const DEFINITION_ID: "fixture-v2" = DEFINITION_FIXTURE.id;
export const DEFINITION_MARKER: "v2" = DEFINITION_FIXTURE.componentContract;

/* -------------------------------------------------------------------------- */
/* Registry assertions                                                         */
/* -------------------------------------------------------------------------- */

/** The registry accepts a full V2 system and resolves it by id. */
export const REGISTRY_FIXTURE = createDesignSystemRegistry([DEFINITION_FIXTURE]);
export const REGISTERED_SYSTEM: DesignSystem | undefined = REGISTRY_FIXTURE.get("fixture-v2");

/* -------------------------------------------------------------------------- */
/* Negative fixtures (compile-time only)                                       */
/* -------------------------------------------------------------------------- */

/** The historical eight-component map, kept only to prove V1 is rejected. */
const V1_ONLY_COMPONENTS = {
  Button,
  Input,
  Card,
  Badge,
  Checkbox,
  Tabs,
  Dialog,
  Select,
};

/** An eight-component map is no longer assignable to the canonical contract. */
// @ts-expect-error - the canonical contract requires all fourteen components.
const _V1_ONLY_MAP: DesignSystemComponents = V1_ONLY_COMPONENTS;

/** An eight-component, unmarked design-system object. */
const V1_ONLY_SYSTEM = {
  id: "fixture-v1-only",
  name: "Fixture V1 only",
  packageName: "@prism-system/fixture-v1-only",
  version: "0.0.0",
  components: V1_ONLY_COMPONENTS,
};

// @ts-expect-error - defineDesignSystem rejects a system with only the eight historical components.
export const V1_ONLY_DEFINITION = defineDesignSystem(V1_ONLY_SYSTEM);

// @ts-expect-error - defineDesignSystemV2 rejects a system with only the eight historical components.
export const V1_ONLY_DEFINITION_V2 = defineDesignSystemV2(V1_ONLY_SYSTEM);

/** The V2 marker is required: an unmarked fourteen-component map is rejected. */
export const UNMARKED_SYSTEM = {
  id: "fixture-unmarked",
  name: "Fixture unmarked",
  packageName: "@prism-system/fixture-unmarked",
  version: "0.0.0",
  components: COMPONENTS_FIXTURE,
};
// @ts-expect-error - componentContract is required.
export const UNMARKED_DEFINITION = defineDesignSystem(UNMARKED_SYSTEM);

/** The historical `"v1"` marker is no longer accepted. */
export const V1_MARKER_SYSTEM = {
  id: "fixture-v1-marker",
  name: "Fixture V1 marker",
  packageName: "@prism-system/fixture-v1-marker",
  version: "0.0.0",
  componentContract: "v1",
  components: COMPONENTS_FIXTURE,
};
// @ts-expect-error - componentContract must be "v2".
export const V1_MARKER_DEFINITION = defineDesignSystem(V1_MARKER_SYSTEM);

/** The registry rejects the eight-component, unmarked object. */
// @ts-expect-error - the registry only accepts V2 design systems.
export const REGISTRY_REJECTS_V1 = createDesignSystemRegistry([V1_ONLY_SYSTEM]);

// Keep intentionally-unused negative fixtures type-checked without lint noise.
export type _NegativeFixtures = [
  typeof _V1_ONLY_MAP,
  typeof V1_ONLY_DEFINITION,
  typeof V1_ONLY_DEFINITION_V2,
  typeof UNMARKED_DEFINITION,
  typeof V1_MARKER_DEFINITION,
  typeof REGISTRY_REJECTS_V1,
];

/* -------------------------------------------------------------------------- */
/* V4 fixtures                                                                 */
/* -------------------------------------------------------------------------- */

const Heading = component<HeadingProps>;
const Text = component<TextProps>;
const Link = component<LinkProps>;
const Container = component<ContainerProps>;
const Stack = component<StackProps>;

const FormField = Object.assign(component<FormFieldProps>, {
  Label: component<FormFieldLabelProps>,
  Control: component<FormFieldControlProps>,
  Description: component<FormFieldDescriptionProps>,
  Error: component<FormFieldErrorProps>,
});

const Grid = component<GridProps>;
const Progress = component<ProgressProps>;
const Skeleton = component<SkeletonProps>;

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

/** A valid V4 map with the twenty required components and no optional members. */
export const COMPONENTS_V4_FIXTURE: DesignSystemComponentsV4 = {
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
};

/** A valid V4 map with every optional component declared. */
export const COMPONENTS_V4_ALL_OPTIONALS_FIXTURE: DesignSystemComponentsV4 = {
  ...COMPONENTS_V4_FIXTURE,
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
};

/** A valid V4 map with a different optional subset. */
export const COMPONENTS_V4_SUBSET_FIXTURE: DesignSystemComponentsV4 = {
  ...COMPONENTS_V4_FIXTURE,
  Grid,
  Alert,
  Table,
};

/* -------------------------------------------------------------------------- */
/* V4 tuple / name assertions                                                  */
/* -------------------------------------------------------------------------- */

/** The V4 required tuple names exactly the required keys, in plan order. */
export const EXPECTED_V4_REQUIRED_TUPLE: typeof REQUIRED_COMPONENTS_V4 = [
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
];

/** The V4 optional tuple names exactly the optional keys, in plan order. */
export const EXPECTED_V4_OPTIONAL_TUPLE: typeof OPTIONAL_COMPONENTS_V4 = [
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
];

/** V4 requires exactly twenty components. */
export const V4_REQUIRED_COUNT: 20 = REQUIRED_COMPONENTS_V4.length;
/** V4 offers exactly twelve optional components. */
export const V4_OPTIONAL_COUNT: 12 = OPTIONAL_COMPONENTS_V4.length;

/** Every V4 map key is required or optional: no stray names exist. */
export const V4_NAME_IS_REQUIRED_OR_OPTIONAL: Equal<
  DesignSystemComponentNameV4,
  (typeof REQUIRED_COMPONENTS_V4)[number] | (typeof OPTIONAL_COMPONENTS_V4)[number]
> = true;

/** The V2 map and the V4 map are distinct contracts. */
export const V2_IS_NOT_V4: Equal<DesignSystemComponentsV2, DesignSystemComponentsV4> = false;

/** A required V4 component satisfies the V4 component union. */
export const V4_COMPONENT_SAMPLE: DesignSystemComponentV4 = Button;

/* -------------------------------------------------------------------------- */
/* V4 definition / registry assertions                                         */
/* -------------------------------------------------------------------------- */

export const V4_DEFINITION_FIXTURE = defineDesignSystemV4({
  id: "fixture-v4",
  name: "Fixture V4",
  packageName: "@prism-system/fixture-v4",
  version: "0.0.0",
  componentContract: "v4",
  components: COMPONENTS_V4_FIXTURE,
});

export const V4_DEFINITION_WITH_OPTIONALS_FIXTURE = defineDesignSystemV4({
  id: "fixture-v4-optionals",
  name: "Fixture V4 with optionals",
  packageName: "@prism-system/fixture-v4-optionals",
  version: "0.0.0",
  componentContract: "v4",
  components: COMPONENTS_V4_ALL_OPTIONALS_FIXTURE,
});

/** The accepted definitions satisfy `DesignSystemV4`. */
export const V4_DEFINITION_IS_V4: DesignSystemV4 = V4_DEFINITION_FIXTURE;
export const V4_DEFINITION_WITH_OPTIONALS_IS_V4: DesignSystemV4 =
  V4_DEFINITION_WITH_OPTIONALS_FIXTURE;

/** `defineDesignSystemV4` preserves the literal `id` and the `"v4"` marker. */
export const V4_DEFINITION_ID: "fixture-v4" = V4_DEFINITION_FIXTURE.id;
export const V4_DEFINITION_MARKER: "v4" = V4_DEFINITION_FIXTURE.componentContract;

/** The V4 registry accepts a V4 system and resolves it by id. */
export const V4_REGISTRY_FIXTURE = createDesignSystemRegistryV4([V4_DEFINITION_FIXTURE]);
export const V4_REGISTERED_SYSTEM: DesignSystemV4 | undefined =
  V4_REGISTRY_FIXTURE.get("fixture-v4");

/* -------------------------------------------------------------------------- */
/* V4 negative fixtures (compile-time only)                                    */
/* -------------------------------------------------------------------------- */

/** A V4 map missing the six added required components. */
const V4_MISSING_REQUIRED_COMPONENTS = {
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

// @ts-expect-error - the V4 contract requires all twenty components.
const _V4_MISSING_REQUIRED_MAP: DesignSystemComponentsV4 = V4_MISSING_REQUIRED_COMPONENTS;

const _V4_UNKNOWN_KEY_MAP: DesignSystemComponentsV4 = {
  ...COMPONENTS_V4_FIXTURE,
  // @ts-expect-error - unknown component names are rejected by the V4 map.
  NotAComponent: Button,
};

// @ts-expect-error - defineDesignSystemV4 rejects a V2-shaped system.
export const V4_REJECTS_V2 = defineDesignSystemV4(DEFINITION_FIXTURE);

// @ts-expect-error - the V4 registry does not accept V2 systems.
export const V4_REGISTRY_REJECTS_V2 = createDesignSystemRegistryV4([DEFINITION_FIXTURE]);

export const V4_DEFINITION_MISSING_REQUIRED = defineDesignSystemV4({
  id: "fixture-v4-missing",
  name: "Fixture V4 missing required",
  packageName: "@prism-system/fixture-v4-missing",
  version: "0.0.0",
  componentContract: "v4",
  // @ts-expect-error - defineDesignSystemV4 rejects a system missing required components.
  components: V4_MISSING_REQUIRED_COMPONENTS,
});

/** A V4 map carrying the wrong contract marker. */
export const V4_WRONG_MARKER_SYSTEM = {
  id: "fixture-v4-wrong-marker",
  name: "Fixture V4 wrong marker",
  packageName: "@prism-system/fixture-v4-wrong-marker",
  version: "0.0.0",
  componentContract: "v2",
  components: COMPONENTS_V4_FIXTURE,
};
// @ts-expect-error - componentContract must be "v4".
export const V4_WRONG_MARKER_DEFINITION = defineDesignSystemV4(V4_WRONG_MARKER_SYSTEM);

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

// Keep intentionally-unused V4 negatives type-checked without lint noise.
export type _V4NegativeFixtures = [
  typeof _V4_MISSING_REQUIRED_MAP,
  typeof _V4_UNKNOWN_KEY_MAP,
  typeof V4_REJECTS_V2,
  typeof V4_REGISTRY_REJECTS_V2,
  typeof V4_DEFINITION_MISSING_REQUIRED,
  typeof V4_WRONG_MARKER_DEFINITION,
  typeof _AVATAR_IMAGE_MISSING_ALT,
];
