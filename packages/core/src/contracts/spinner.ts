import type { ComponentPropsWithoutRef } from "react";

export interface SpinnerOwnProps {
  /**
   * Accessible name announced while work is pending. Required: a spinner with
   * no name tells assistive technology only that something is busy, not what
   * is in progress.
   */
  label: string;
}

/**
 * Spinner is a status indicator for real, currently pending work.
 *
 * Role and accessible-name ARIA are implementation-owned and omitted from the
 * public props so they cannot be overridden: the root must expose
 * `role="status"` and use `label` as its `aria-label`. Any purely visual mark
 * must be hidden from assistive technology. Do not use a spinner for work
 * that is not actually in progress or as a decorative delay.
 *
 * Native span attributes and refs are forwarded. The contract carries no
 * system-specific size, color, or motion: appearance and animation belong to
 * the design system, and reduced-motion rendering must stay understandable
 * without animation. When the pending state also needs to be exposed on the
 * surrounding region, the consumer adds `aria-busy` there.
 */
export type SpinnerProps = SpinnerOwnProps &
  Omit<ComponentPropsWithoutRef<"span">, "role" | "aria-label" | "aria-labelledby">;
