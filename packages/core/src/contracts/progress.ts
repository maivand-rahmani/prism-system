import type { ComponentPropsWithoutRef } from "react";

export interface ProgressOwnProps {
  /**
   * Current value. `undefined` or `null` renders an indeterminate indicator;
   * implementations must omit `aria-valuenow` in that case. Determinate values
   * are clamped by implementations to the `0..max` range.
   */
  value?: number | null;
  /** Upper bound of the range. Implementations default to `100`. */
  max?: number;
}

/**
 * Exactly one accessible name is required: `aria-label` or `aria-labelledby`.
 */
export type ProgressAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

/**
 * Progress renders a determinate or indeterminate bar.
 *
 * Role and value ARIA are implementation-owned and omitted from the public
 * props so they cannot be overridden: the root must expose
 * `role="progressbar"` with `aria-valuemin`, `aria-valuemax`, and
 * `aria-valuenow` only while the value is determinate.
 */
export type ProgressProps = ProgressOwnProps &
  ProgressAccessibleName &
  Omit<
    ComponentPropsWithoutRef<"div">,
    "role" | "aria-label" | "aria-labelledby" | "aria-valuenow" | "aria-valuemin" | "aria-valuemax"
  >;
