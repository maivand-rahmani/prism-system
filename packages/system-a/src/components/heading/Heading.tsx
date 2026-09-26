import * as React from "react";
import { cn, type HeadingLevel, type HeadingProps } from "@prism-system/ui-core";

export type { HeadingProps, HeadingLevel };
export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { level, className, ...props },
  ref,
) {
  const Tag = `h${level}` as `h${HeadingLevel}`;
  return (
    <Tag
      ref={ref}
      className={cn("maivand-a-ui", "maivand-a-heading", `maivand-a-heading-${level}`, className)}
      {...props}
    />
  );
});
Heading.displayName = "Heading";
