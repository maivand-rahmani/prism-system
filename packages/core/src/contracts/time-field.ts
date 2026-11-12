import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface TimeFieldOwnProps {
  /** Visible label, associated with the input through `htmlFor`. */
  label?: ReactNode;
  /** Helper text under the field. Replaced by `error` when both are set. */
  hint?: ReactNode;
  /** Error text under the field. Announced with `role="alert"` and sets `aria-invalid`. */
  error?: ReactNode;
  /** Marks the field invalid and sets `aria-invalid` without adding text. */
  invalid?: boolean;
}

/**
 * TimeField is the native time-of-day control: `<input type="time">`.
 *
 * The native `type` is fixed and removed from the prop base; only the matching
 * literal may be supplied. Native `name`/`form`/`disabled`/`required`/`min`/
 * `max`/`step`/value/change/ref semantics are kept, so form submission, browser
 * keyboard editing, constraint validation, and `form.reset()` behave as they do
 * for a native time input.
 *
 * Accessibility and validation expectations (implementation-owned):
 * - The visible label is associated with the input through `htmlFor`. When no
 *   label is supplied, the consumer must provide an accessible name through
 *   native ARIA props.
 * - `hint` and `error` are wired through `aria-describedby`; an `error` replaces
 *   the hint, is announced (`role="alert"`), and sets `aria-invalid`.
 * - The control never parses, clamps, or rewrites a time value selected by the
 *   caller; browser constraint validation remains authoritative.
 */
export type TimeFieldProps = TimeFieldOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, "type"> & {
    /** Fixed to `"time"`; accepted only for explicitness. */
    type?: "time";
  };
