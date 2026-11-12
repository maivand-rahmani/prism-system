import type { ComponentPropsWithoutRef, ReactNode } from "react";

/** An ordered `[start, end]` pair, on the step grid and within `min`–`max`. */
export type RangeSliderValue = [number, number];

export interface RangeSliderOwnProps {
  /**
   * Visible group name. Both thumbs are announced inside this group, so it is
   * required: a range without a name is not understandable.
   */
  label: ReactNode;
  /** Helper text under the control. Replaced by `error` when both are set. */
  hint?: ReactNode;
  /** Error text under the control. Announced with `role="alert"`; sets `aria-invalid` on both thumbs. */
  error?: ReactNode;
  /** Marks both thumbs invalid without adding text. */
  invalid?: boolean;
  /** Disables both thumbs. */
  disabled?: boolean;
  /** Lowest selectable value. Defaults to `0`. */
  min?: number;
  /** Highest selectable value. Defaults to `100`. */
  max?: number;
  /** Distance between selectable values. Defaults to `1`. */
  step?: number;
  /**
   * Controlled `[start, end]`. The thumbs always show an ordered, on-grid pair,
   * so out-of-order input is displayed normalized; the parent's value is never
   * rewritten.
   */
  value?: RangeSliderValue;
  /** Initial `[start, end]` when uncontrolled. Defaults to the full range. Restored when the owning form resets. */
  defaultValue?: RangeSliderValue;
  /** Called with the new ordered pair after a user change. */
  onValueChange?: (value: RangeSliderValue) => void;
  /** Accessible name of the start thumb. Defaults to `"Start"`; pass a localized string. */
  startLabel?: string;
  /** Accessible name of the end thumb. Defaults to `"End"`; pass a localized string. */
  endLabel?: string;
  /** Form field name for the start value. Omit it and nothing is submitted for the start value. */
  startName?: string;
  /** Form field name for the end value. Omit it and nothing is submitted for the end value. */
  endName?: string;
  /** Associates both inputs with a form by its `id`. */
  form?: string;
}

/**
 * RangeSlider is a two-thumb range control composed of two native
 * `<input type="range">` elements, each representing one endpoint.
 *
 * Value and validation guarantees (implementation-owned):
 * - The pair is always ordered and snapped to the step grid anchored at `min`.
 *   Out-of-order or off-grid controlled input is displayed normalized without
 *   mutating the caller's `value`; user changes report a new ordered pair
 *   through `onValueChange`.
 * - The start thumb cannot move past the end thumb and the end thumb cannot
 *   move before the start thumb. The implementation enforces crossing limits
 *   and exposes each thumb's effective bounds to assistive technology.
 * - Omit `value` for uncontrolled use: `defaultValue` seeds the pair and
 *   `form.reset()` restores it. Controlled values are never rewritten.
 * - Native `min`/`max`/`step`/value/change semantics and native keyboard
 *   behavior (arrow keys, Home/End, and other browser range shortcuts) are
 *   preserved for both thumbs.
 *
 * Accessibility expectations:
 * - The root is a named `group`; each thumb has its own accessible name from
 *   `startLabel`/`endLabel` and exposes its numeric value natively.
 * - `hint`/`error` are wired to both thumbs through `aria-describedby`; an
 *   `error` is announced (`role="alert"`) and sets `aria-invalid` on both.
 * - The rendered current-pair display is presentational and must not be a live
 *   region that repeats every keypress.
 */
export type RangeSliderProps = RangeSliderOwnProps &
  Omit<ComponentPropsWithoutRef<"div">, "defaultValue" | "onChange" | "children">;
