import type { ComponentPropsWithoutRef } from "react";

/** Landmark-capable element `Container` may render as. Defaults to `"div"`. */
export type ContainerElement = "div" | "main" | "section" | "article" | "aside";

export interface ContainerOwnProps {
  /** Rendered element. Implementations default to `"div"`. */
  as?: ContainerElement;
}

/**
 * Container is the content-width wrapper.
 *
 * It owns no layout scale: max width, padding, and breakpoints are visual
 * decisions implemented by the design system from its own tokens. The contract
 * therefore adds no width, padding, or size props beyond the rendered element.
 */
export type ContainerProps = ContainerOwnProps & ComponentPropsWithoutRef<"div">;
