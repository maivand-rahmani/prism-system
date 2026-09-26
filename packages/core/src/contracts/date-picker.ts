import type { ComponentPropsWithoutRef } from "react";

export interface DatePickerOwnProps {
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
}

/**
 * DatePicker is the native date control: `<input type="date">`.
 *
 * The native `type` is fixed and removed from the prop base; only the matching
 * literal may be supplied. Native value/change/ref/form semantics are kept, and
 * `invalid` mirrors `Input` by mapping to `aria-invalid`.
 */
export type DatePickerProps = DatePickerOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, "type"> & {
    /** Fixed to `"date"`; accepted only for explicitness. */
    type?: "date";
  };
