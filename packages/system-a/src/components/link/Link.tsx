import * as React from "react";
import { cn, type LinkProps } from "@prism-system/ui-core";

export type { LinkProps };
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { className, ...props },
  ref,
) {
  return <a ref={ref} className={cn("maivand-a-ui", "maivand-a-link", className)} {...props} />;
});
Link.displayName = "Link";
