/**
 * Compile-time contract fixture for the additive V2 component contract.
 *
 * This file is intentionally not executed by a test framework: it proves, at
 * typecheck time, that
 *  1. a full 14-entry map satisfies {@link DesignSystemComponentsV2},
 *  2. the V2 required tuple names are exact and valid, and
 *  3. the V1 contract and existing V1 systems are unchanged/additive.
 *
 * `tsconfig.build.json` excludes `*.test.ts`, so nothing here ships in `dist`.
 */
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
import {
  REQUIRED_COMPONENTS,
  REQUIRED_COMPONENTS_V2,
  type DesignSystemComponentName,
  type DesignSystemComponentNameV2,
  type DesignSystemComponents,
  type DesignSystemComponentsV2,
} from "./components.js";
import { defineDesignSystemV2, type DesignSystemV2 } from "./design-system.js";

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

/** A complete synthetic V2 map; assignability is the contract assertion. */
export const COMPONENTS_V2_FIXTURE: DesignSystemComponentsV2 = {
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

/** A V2 map must also satisfy the V1 contract (strictly additive). */
export const COMPONENTS_V2_IS_V1: DesignSystemComponents = COMPONENTS_V2_FIXTURE;

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The V1 tuple still names exactly the V1 contract keys. */
export const V1_TUPLE_IS_EXACT: Equal<
  (typeof REQUIRED_COMPONENTS)[number],
  DesignSystemComponentName
> = true;

/** The V2 tuple names exactly the V2 contract keys. */
export const V2_TUPLE_IS_EXACT: Equal<
  (typeof REQUIRED_COMPONENTS_V2)[number],
  DesignSystemComponentNameV2
> = true;

/** The V1 and V2 tuples have 8 and 14 entries respectively. */
export const V1_REQUIRED_COUNT: 8 = REQUIRED_COMPONENTS.length;
export const V2_REQUIRED_COUNT: 14 = REQUIRED_COMPONENTS_V2.length;

/** `defineDesignSystemV2` accepts the full V2 shape and marker. */
export const V2_DEFINITION_FIXTURE = defineDesignSystemV2({
  id: "fixture-v2",
  name: "Fixture V2",
  packageName: "@prism-system/fixture-v2",
  version: "0.0.0",
  componentContract: "v2",
  components: COMPONENTS_V2_FIXTURE,
});

/** The accepted definition satisfies `DesignSystemV2`. */
export const V2_DEFINITION_IS_V2: DesignSystemV2 = V2_DEFINITION_FIXTURE;

/** `defineDesignSystemV2` preserves the literal `id` (and the `"v2"` marker). */
export const V2_DEFINITION_ID: "fixture-v2" = V2_DEFINITION_FIXTURE.id;
export const V2_DEFINITION_MARKER: "v2" = V2_DEFINITION_FIXTURE.componentContract;
