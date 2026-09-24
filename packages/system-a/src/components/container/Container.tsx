import * as React from "react";
import { cn, type ContainerProps } from "@prism-system/ui-core";

export type { ContainerProps };
export const Container = React.forwardRef<HTMLElement, ContainerProps>(function Container(
  { as: Tag = "div", className, ...props },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      className={cn("maivand-a-ui", "maivand-a-container", className)}
      {...props}
    />
  );
});
Container.displayName = "Container";
