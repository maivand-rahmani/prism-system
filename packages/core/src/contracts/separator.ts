import type { ComponentPropsWithoutRef } from "react";
import type { Orientation } from "../types/common.js";

export interface SeparatorOwnProps {
  orientation?: Orientation;
  /**
   * When `true`, the separator is decorative and is removed from the
   * accessibility tree. When `false`, it exposes `role="separator"` (and
   * `aria-orientation`) so assistive technology can announce the boundary.
   */
  decorative?: boolean;
}

/**
 * Separator is a single structural divider with no visual values; the design
 * system supplies border/background appearance.
 */
export type SeparatorProps = SeparatorOwnProps & ComponentPropsWithoutRef<"div">;
