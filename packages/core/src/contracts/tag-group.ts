import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * One tag in a `TagGroup`.
 *
 * `value` is the stable identity reported to `onRemove` and must be unique
 * within a single group. `label` is the visible text and is also reused to build
 * the accessible name of the removal control, so it should be short and
 * distinct. A disabled tag keeps its text but exposes no removal action.
 */
export interface TagGroupItem {
  /** Unique within `items`; reported by `onRemove`. */
  value: string;
  /** Visible text. It also names the removal control. */
  label: string;
  /** Disables removal while keeping the tag visible. */
  disabled?: boolean;
}

/**
 * TagGroup renders a labelled collection of tags.
 *
 * The root owns the group semantics (`role="group"` named by the visible
 * `label`) and implementations render the tags as a list. Tags are display-only
 * unless `onRemove` is provided. With `onRemove`, every enabled tag exposes a
 * removal control whose accessible name comes from `removeLabel(label)`.
 * Implementations provide a sensible fallback when `removeLabel` is omitted.
 *
 * Removal behavior (implementation-owned):
 * - Activating a removal control, or pressing `Backspace`/`Delete` while that
 *   control is focused, calls `onRemove` with the tag's `value`.
 * - The component never mutates `items`; the consumer owns the collection and
 *   must remove the reported value. Disabled tags never call `onRemove`.
 * - Because the activated control unmounts, implementations must move focus to
 *   the nearest remaining enabled removal control (forward from the removed
 *   position, then backward) or, when none remains, to the group root. The
 *   group root is a programmatic focus target, not a tab stop.
 * - When `items` is empty, `emptyLabel` is shown and no removal control is
 *   rendered.
 *
 * TagGroup is not a form control: it has no `name`, `required`, or submission
 * semantics. The current tags exist only in the consumer's `items`, and removal
 * is reported only through `onRemove`.
 *
 * Standard `div` props are forwarded. `children` is omitted because tags are
 * data-driven; `role`, `aria-labelledby`, and `tabIndex` are owned by the
 * group/label and focus-recovery behavior. Appearance, spacing, and the removal
 * icon belong to the design system.
 */
export type TagGroupProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children" | "role" | "aria-labelledby" | "tabIndex"
> & {
  /** Visible caption that also names the group for assistive technology. */
  label: ReactNode;
  /** Tags in display order. Values must be unique within this array. */
  items: readonly TagGroupItem[];
  /**
   * Called with the removed tag's `value`. Providing it enables removal for
   * every enabled tag and makes the consumer responsible for updating `items`.
   */
  onRemove?: (value: string) => void;
  /** Builds the accessible name of a tag's removal control from its label. */
  removeLabel?: (label: string) => string;
  /** Content shown in place of the tags when `items` is empty. */
  emptyLabel?: ReactNode;
};
