import * as React from "react";
import { cn, type TextProps } from "@prism-system/ui-core";

export type { TextProps };
export const Text = React.forwardRef<HTMLElement, TextProps>(function Text(
  { as: Tag = "p", className, ...props },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      className={cn("maivand-a-ui", "maivand-a-text", className)}
      {...props}
    />
  );
});
Text.displayName = "Text";
