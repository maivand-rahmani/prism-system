import * as React from "react";
import { cn, type StackProps } from "@prism-system/ui-core";

export type { StackProps };
export const Stack = React.forwardRef<HTMLElement, StackProps>(function Stack(
  { as = "div", direction = "vertical", wrap = false, className, ...props },
  ref,
) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={cn(
        "maivand-a-ui",
        "maivand-a-stack",
        `maivand-a-stack-${direction}`,
        wrap && "maivand-a-stack-wrap",
        className,
      )}
      {...props}
    />
  );
});
Stack.displayName = "Stack";
