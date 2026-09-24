import type { ComponentPropsWithoutRef } from "react";

/**
 * Heading levels, mapped by implementations to the matching native `h1`-`h6`.
 *
 * The level is required so the document outline stays explicit and intentional.
 * It is semantic information, never a visual size; the design system owns how a
 * given level actually looks.
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingOwnProps {
  /** Semantic heading level. Implementations render the matching `h1`-`h6`. */
  level: HeadingLevel;
}

/**
 * Heading renders a native heading element selected by `level`.
 *
 * Native props use the `h1` baseline; implementations forward them to whichever
 * heading element the level selects. `Heading` exposes no size or appearance
 * props: those belong to the design system.
 */
export type HeadingProps = HeadingOwnProps & ComponentPropsWithoutRef<"h1">;
