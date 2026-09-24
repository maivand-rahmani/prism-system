import type { ComponentPropsWithoutRef } from "react";

/** Rendered element for `Text`. Implementations default to `"p"`. */
export type TextElement = "p" | "span" | "div";

export interface TextOwnProps {
  /** Rendered element. Implementations default to `"p"` when omitted. */
  as?: TextElement;
}

/**
 * Text is the shared body/inline text primitive.
 *
 * It exposes only the rendered element; typography (size, weight, color,
 * line-height) is owned by the design system. Native props use the `p`
 * baseline, which is also the default element.
 */
export type TextProps = TextOwnProps & ComponentPropsWithoutRef<"p">;
