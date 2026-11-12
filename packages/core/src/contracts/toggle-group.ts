import type { ComponentPropsWithoutRef } from "react";
import type { AsChildProp, Direction, Orientation } from "../types/common.js";

interface ToggleGroupBaseProps extends ComponentPropsWithoutRef<"div">, AsChildProp {
  /** Disables every item in the group. Individual items may also be disabled. */
  disabled?: boolean;
  /**
   * Maintains one tab stop for the group and moves focus with the arrow keys.
   * Defaults to `true`.
   */
  rovingFocus?: boolean;
  /** Wraps keyboard focus from the last item to the first and back. Defaults to `true`. */
  loop?: boolean;
  /** Orientation used by arrow-key navigation. Defaults to `horizontal`. */
  orientation?: Orientation;
  /** Text direction, which swaps the horizontal arrow keys. */
  dir?: Direction;
}

/**
 * Single-selection toggle group.
 *
 * The group is controlled when `value` is provided and uncontrolled otherwise,
 * starting at `defaultValue` (`""` means nothing is selected). `onValueChange`
 * reports the selected item's value. Exactly one item can be pressed at a time;
 * pressing the selected item again clears the selection. `value` and
 * `defaultValue` must match an item's `value`.
 */
export interface ToggleGroupSingleProps extends ToggleGroupBaseProps {
  type: "single";
  /** Controlled selected item value. */
  value?: string;
  /** Initially selected item value for uncontrolled usage. */
  defaultValue?: string;
  /** Called with the selected item value, or `""` when the selection is cleared. */
  onValueChange?: (value: string) => void;
}

/**
 * Multiple-selection toggle group.
 *
 * The group is controlled when `value` is provided and uncontrolled otherwise,
 * starting at `defaultValue` (empty by default). `onValueChange` reports the
 * complete next array of pressed item values; item order follows user
 * activation, not DOM order.
 */
export interface ToggleGroupMultipleProps extends ToggleGroupBaseProps {
  type: "multiple";
  /** Controlled pressed item values. */
  value?: string[];
  /** Initially pressed item values for uncontrolled usage. */
  defaultValue?: string[];
  /** Called with the complete next array of pressed item values. */
  onValueChange?: (value: string[]) => void;
}

/**
 * ToggleGroup is a compound component. Implementations must attach `Item` as a
 * static member of the root component, e.g. `ToggleGroup.Item`.
 *
 * The root is discriminated on `type`: `"single"` carries a string value and
 * reports a string, while `"multiple"` carries and reports a string array. The
 * union is deliberately overloaded so the value and callback shapes cannot be
 * mixed.
 *
 * Accessibility expectations:
 * - The group needs an accessible name supplied through `aria-label` or
 *   `aria-labelledby`; there is no label prop. Place a visible label nearby and
 *   reference it when possible.
 * - A single group exposes a named `radiogroup` whose items expose radio
 *   semantics (`aria-checked`). A multiple group exposes a named grouping
 *   container with `aria-pressed` on every item; current Radix renders the
 *   multiple root with `role="toolbar"`.
 * - By default the group has one tab stop; the arrow keys move between enabled
 *   items according to `orientation` and `dir`, `Home`/`End` jump to the first
 *   and last enabled item, and `Space`/`Enter` toggle the focused item. `loop`
 *   controls wrapping. Disabled items are skipped and cannot be toggled.
 * - Every item needs an accessible name from its visible content, or
 *   `aria-label` when it is icon-only. The name describes the action or state
 *   ("Bold", "Show weekends"), not the icon.
 * - Selection state must not rely on color alone; the design system owns the
 *   additional visual cue.
 */
export type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps;

/**
 * One toggle button in a `ToggleGroup`.
 *
 * `value` is the stable identity of the item and must be unique within its
 * group. `disabled` removes the item from interaction and keyboard navigation
 * while keeping it visible. The rendered element is a native button with
 * `aria-pressed` (multiple group) or radio semantics (single group); appearance
 * and the selected-state treatment belong to the design system.
 */
export type ToggleGroupItemProps = Omit<ComponentPropsWithoutRef<"button">, "value"> &
  AsChildProp & {
    /** Unique value identifying this item within the group. */
    value: string;
  };
