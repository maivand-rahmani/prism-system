import type { ComponentPropsWithoutRef } from "react";
import type { AsChildProp, Direction, Orientation } from "../types/common.js";
import type { ToggleGroupMultipleProps, ToggleGroupSingleProps } from "./toggle-group.js";

/**
 * Root props for a `Toolbar`.
 *
 * `orientation` describes the bar's layout and selects the arrow-key axis;
 * `dir` swaps the horizontal arrow keys. `loop` wraps roving focus from the last
 * control to the first and back, and defaults to `true`.
 */
export type ToolbarProps = ComponentPropsWithoutRef<"div"> &
  AsChildProp & {
    /** Layout and keyboard orientation. Defaults to `horizontal`. */
    orientation?: Orientation;
    /** Wraps roving focus at the ends of the bar. Defaults to `true`. */
    loop?: boolean;
    /** Text direction, which swaps the horizontal arrow keys. */
    dir?: Direction;
  };

/**
 * Toolbar is a compound component. Implementations must attach `Button`,
 * `Link`, `Separator`, `ToggleGroup`, and `ToggleItem` as static members of the
 * root component, e.g. `Toolbar.Button`.
 *
 * A toolbar groups related controls into a single composite widget. The root
 * exposes `role="toolbar"` and `aria-orientation`, and it needs an accessible
 * name supplied through `aria-label` or `aria-labelledby`; there is no label
 * prop, so reference a visible label when one exists.
 *
 * Keyboard expectations:
 * - The toolbar is one tab stop. `Tab` enters at the last focused control and
 *   leaves the bar; it does not walk through every control.
 * - The arrow keys move between enabled controls according to `orientation` and
 *   `dir`, `Home`/`End` jump to the first and last enabled control, and `loop`
 *   controls wrapping. Disabled controls are skipped.
 * - Controls that are not focusable natively (such as separators) never join the
 *   roving sequence.
 * - The design system owns appearance and the focus indicator; focus visibility
 *   must not rely on color alone.
 */
export type ToolbarButtonProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

/**
 * A link control inside the toolbar. It is a native anchor with roving focus;
 * `Enter` follows the link and `Space` activates it, matching the toolbar
 * keyboard model. Link text or `aria-label` supplies its accessible name.
 */
export type ToolbarLinkProps = ComponentPropsWithoutRef<"a"> & AsChildProp;

/**
 * A divider between toolbar groups.
 *
 * The orientation defaults to the axis perpendicular to the toolbar (vertical
 * inside a horizontal bar). `decorative` follows the separator contract: when
 * `true`, the element is hidden from assistive technology; when `false`, it is
 * exposed as a separator. Implementations must not rely on color alone to
 * convey the grouping.
 */
export type ToolbarSeparatorProps = ComponentPropsWithoutRef<"div"> &
  AsChildProp & {
    /** Explicit orientation; defaults to the axis perpendicular to the toolbar. */
    orientation?: Orientation;
    /** Removes the separator from the accessibility tree when `true`. */
    decorative?: boolean;
  };

/**
 * A toggle group placed inside the toolbar. It has the same discriminated
 * single/multiple API as `ToggleGroup`: `type="single"` uses a string value and
 * `type="multiple"` uses a string array. The group needs its own accessible name
 * through `aria-label` or `aria-labelledby`.
 *
 * The toolbar owns roving focus for the whole bar. The group is one participant
 * in that sequence and must not introduce a second tab stop; `rovingFocus` and
 * `loop` therefore have no effect inside a toolbar.
 */
export type ToolbarToggleGroupSingleProps = ToggleGroupSingleProps;
export type ToolbarToggleGroupMultipleProps = ToggleGroupMultipleProps;
export type ToolbarToggleGroupProps =
  ToolbarToggleGroupSingleProps | ToolbarToggleGroupMultipleProps;

/**
 * One toggle button inside a toolbar toggle group. It is a native button with
 * `aria-pressed` in a multiple group or radio semantics in a single group.
 * `value` must be unique within the group, and the accessible name comes from
 * visible content or `aria-label` for icon-only items.
 */
export type ToolbarToggleItemProps = Omit<ComponentPropsWithoutRef<"button">, "value"> &
  AsChildProp & {
    /** Unique value identifying this item within the toolbar toggle group. */
    value: string;
  };
