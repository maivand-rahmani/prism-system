import type { ComponentPropsWithoutRef, CSSProperties } from "react";

/**
 * Standard visually-hidden technique. The element stays available to assistive
 * technology while being removed from the visual layout.
 *
 * The inline styles are an accessibility primitive, not a design token; systems
 * may re-implement the same technique with their own utilities if preferred.
 */
const visuallyHiddenStyles: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: 0,
};

export function VisuallyHidden({ style, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span {...props} style={{ ...visuallyHiddenStyles, ...style }} />;
}
