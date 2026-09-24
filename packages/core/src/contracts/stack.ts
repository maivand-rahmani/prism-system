import type { ComponentPropsWithoutRef } from "react";
import type { Orientation } from "../types/common.js";

/** Flow element `Stack` may render as. Defaults to `"div"`. */
export type StackElement = "div" | "ul" | "ol";

export interface StackOwnProps {
  /** Rendered element. Implementations default to `"div"`. */
  as?: StackElement;
  /** Flow direction. Implementations default to `"vertical"`. */
  direction?: Orientation;
  /** Allows items to wrap onto multiple lines. Implementations default to `false`. */
  wrap?: boolean;
}

/**
 * Stack is the one-dimensional flow primitive.
 *
 * It intentionally exposes no gap, alignment, or spacing props: those are
 * visual values owned by the design system, which applies them from its own
 * tokens. `direction` and `wrap` describe structural flow only.
 */
export type StackProps = StackOwnProps & ComponentPropsWithoutRef<"div">;
