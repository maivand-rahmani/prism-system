"use client";

import * as React from "react";
import { cn, type LinkProps as CoreLinkProps } from "@prism-system/ui-core";

export type LinkProps = CoreLinkProps;

/** Link renders a native anchor; `href` is required by the contract. */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { className, href, ...props },
  ref,
) {
  return (
    <a
      ref={ref}
      href={href}
      className={cn("maivand-b-ui", "maivand-b-link", className)}
      {...props}
    />
  );
});
Link.displayName = "Link";
