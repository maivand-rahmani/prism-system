import type { ComponentPropsWithoutRef, ReactNode } from "react";

/** Ordered ISO calendar dates (`YYYY-MM-DD`); empty string represents an unset date. */
export type DateRangePickerValue = [start: string, end: string];

export interface DateRangePickerOwnProps {
  /** Visible name for the date-range group. */
  label: ReactNode;
  /** Accessible label for the first date. Defaults to `"Start date"`. */
  startLabel?: ReactNode;
  /** Accessible label for the second date. Defaults to `"End date"`. */
  endLabel?: ReactNode;
  /** Form name for the first input. Omit it and the start date is not submitted. */
  startName?: string;
  /** Form name for the second input. Omit it and the end date is not submitted. */
  endName?: string;
  /** Controlled `[start, end]` ISO dates. Empty strings are valid unset values. */
  value?: DateRangePickerValue;
  /** Initial `[start, end]` ISO dates when uncontrolled; restored by form reset. */
  defaultValue?: DateRangePickerValue;
  /** Called with the unchanged selected pair after either input changes. */
  onValueChange?: (value: DateRangePickerValue) => void;
  /** Lowest date accepted by either endpoint, in native ISO form. */
  min?: string;
  /** Highest date accepted by either endpoint, in native ISO form. */
  max?: string;
  /** Marks the group invalid without adding error text. */
  invalid?: boolean;
  /** Error text under both inputs; takes precedence over `hint`. */
  error?: ReactNode;
  /** Helper text under both inputs. */
  hint?: ReactNode;
  /** Localized native validation message when the dates are reversed. */
  rangeErrorMessage?: string;
  /** Localized native validation message when a supplied date is malformed. */
  invalidDateMessage?: string;
  /** Makes both dates mandatory. */
  required?: boolean;
  /** Disables both dates (and therefore excludes them from form submission). */
  disabled?: boolean;
  /** Makes both dates read-only. */
  readOnly?: boolean;
  /** Associates both inputs with a form by its `id`. */
  form?: string;
}

/**
 * DateRangePicker is a two-endpoint date control composed of two native
 * `<input type="date">` elements inside a named group.
 *
 * Value and validation guarantees (implementation-owned):
 * - The browser owns date parsing, display, keyboard behavior, and
 *   timezone-free ISO values. Empty strings represent unset dates.
 * - A reversed range stays visible and is reported through native custom
 *   validity with `rangeErrorMessage`, so the enclosing form cannot submit it.
 *   A malformed date is reported with `invalidDateMessage`. The component never
 *   silently changes a date selected by the caller.
 * - `min`/`max` apply to both endpoints, `required` makes both mandatory, and
 *   `disabled` excludes both from submission. `form.reset()` restores
 *   `defaultValue` for uncontrolled use; controlled values are never rewritten.
 * - Each endpoint change reports the full `[start, end]` pair through
 *   `onValueChange`.
 *
 * Accessibility expectations:
 * - The root is a named `group`; each endpoint has its own visible label and
 *   keeps its native accessible name.
 * - `hint`/`error` are wired to both inputs through `aria-describedby`; an
 *   `error` replaces the hint, is announced (`role="alert"`), and sets
 *   `aria-invalid` on the group and both inputs.
 */
export type DateRangePickerProps = DateRangePickerOwnProps &
  Omit<ComponentPropsWithoutRef<"div">, "defaultValue" | "onChange" | "children">;
