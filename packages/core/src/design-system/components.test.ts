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
  type DesignSystemComponent,
  type DesignSystemComponentName,
  type DesignSystemComponentNameV2,
  type DesignSystemComponentV2,
  type DesignSystemComponents,
  type DesignSystemComponentsV2,
} from "./components.js";
import {
  createDesignSystemRegistry,
  defineDesignSystem,
  defineDesignSystemV2,
  type DesignSystem,
  type DesignSystemV2,
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
