import type { ComponentPropsWithoutRef } from "react";

export interface AspectRatioOwnProps {
  /**
   * Width-to-height ratio. Must be a positive number; implementations default
   * to `1` and reject non-positive values.
   */
  ratio?: number;
}

/**
 * AspectRatio is a sizing box that preserves a width-to-height ratio.
 *
 * The ratio is structural, not decorative, so it is the only prop the contract
 * adds to the native `div` baseline: padding, spacing, colors, and surfaces
 * remain design-system decisions. The box owns no ARIA role and renders a
 * plain `div`; images or media are placed inside by the product.
 */
export type AspectRatioProps = AspectRatioOwnProps & ComponentPropsWithoutRef<"div">;
