import type { ComponentPropsWithoutRef } from "react";

export interface SliderOwnProps {
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
}

/**
 * Slider is the native range control: `<input type="range">`.
 *
 * The native `type` is fixed and removed from the prop base; only the matching
 * literal may be supplied. Native `min`/`max`/`step`/value/change semantics and
 * keyboard behavior are kept, and `invalid` maps to `aria-invalid`. Track,
 * thumb, and fill appearance belong to the design system.
 */
export type SliderProps = SliderOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, "type"> & {
    /** Fixed to `"range"`; accepted only for explicitness. */
    type?: "range";
  };
