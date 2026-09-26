import type { ComponentPropsWithoutRef } from "react";

/**
 * Exactly one accessible name is required: `aria-label` or `aria-labelledby`.
 * A `<meter>` without a name is meaningless to assistive technology.
 */
export type MeterAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

/**
 * Meter is the native `<meter>` element for a scalar measurement within a
 * known range (for example disk usage or a score). It is not a progress
 * indicator; `Progress` owns that concept.
 *
 * Native `value`/`min`/`max`/`low`/`high`/`optimum` semantics are preserved,
 * `role="meter"` is implicit, and the accessible name is mandatory via
 * `aria-label` or `aria-labelledby`. Visual track/optimum styling belongs to
 * the design system.
 */
export type MeterProps = MeterAccessibleName &
  Omit<ComponentPropsWithoutRef<"meter">, "role" | "aria-label" | "aria-labelledby">;
