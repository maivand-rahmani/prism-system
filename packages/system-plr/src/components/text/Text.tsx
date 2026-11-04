import * as React from "react";
import { cn, type TextProps as CoreTextProps } from "@prism-system/ui-core";

export type TextVariant = "body" | "handwriting";
export interface TextProps extends CoreTextProps {
  /**
   * Typographic treatment.
   *
   * `body` (default) is the editorial Literata reading style. `handwriting`
   * uses the bundled Caveat family for diary entries and reflective notes; it
   * covers Cyrillic, Latin, and digits.
   */
  variant?: TextVariant;
}

export const Text = React.forwardRef<HTMLElement, TextProps>(function Text(
  { as: Tag = "p", className, variant = "body", ...props },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      className={cn(
        "maivand-plr-ui",
        "maivand-plr-text",
        variant === "handwriting" && "maivand-plr-text-handwriting",
        className,
      )}
      {...props}
    />
  );
});
Text.displayName = "Text";
