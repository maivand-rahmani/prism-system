import type { ComponentPropsWithoutRef } from "react";

export interface NumberFieldOwnProps {
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
}

/**
 * NumberField is the native numeric control: `<input type="number">`.
 *
 * The native `type` is fixed and removed from the prop base; only the matching
 * literal may be supplied. Native value/change/step/ref/form semantics are
 * kept, and `invalid` mirrors `Input` by mapping to `aria-invalid`. Spinner
 * appearance and stepper buttons are visual decisions owned by the design
 * system.
 */
export type NumberFieldProps = NumberFieldOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, "type"> & {
    /** Fixed to `"number"`; accepted only for explicitness. */
    type?: "number";
  };
