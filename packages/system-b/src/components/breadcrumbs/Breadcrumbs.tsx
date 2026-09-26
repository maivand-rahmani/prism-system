"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";
import type {
  BreadcrumbsCurrentProps,
  BreadcrumbsItemProps,
  BreadcrumbsLinkProps,
  BreadcrumbsListProps,
  BreadcrumbsProps,
} from "@prism-system/ui-core";

const BreadcrumbsRoot = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  function Breadcrumbs(props, ref) {
    const { className, ...rest } = props;
    return (
      <nav ref={ref} className={cn("maivand-b-ui", "maivand-b-breadcrumbs", className)} {...rest} />
    );
  },
);
BreadcrumbsRoot.displayName = "Breadcrumbs";

export const BreadcrumbsList = React.forwardRef<HTMLOListElement, BreadcrumbsListProps>(
  function BreadcrumbsList({ className, ...props }, ref) {
    return <ol ref={ref} className={cn("maivand-b-breadcrumbs-list", className)} {...props} />;
  },
);

export const BreadcrumbsItem = React.forwardRef<HTMLLIElement, BreadcrumbsItemProps>(
  function BreadcrumbsItem({ className, ...props }, ref) {
    return <li ref={ref} className={cn("maivand-b-breadcrumbs-item", className)} {...props} />;
  },
);

export const BreadcrumbsLink = React.forwardRef<HTMLAnchorElement, BreadcrumbsLinkProps>(
  function BreadcrumbsLink({ className, href, ...props }, ref) {
    return (
      <a ref={ref} href={href} className={cn("maivand-b-breadcrumbs-link", className)} {...props} />
    );
  },
);

export const BreadcrumbsCurrent = React.forwardRef<HTMLSpanElement, BreadcrumbsCurrentProps>(
  function BreadcrumbsCurrent({ className, "aria-current": ariaCurrent = "page", ...props }, ref) {
    return (
      <span
        ref={ref}
        aria-current={ariaCurrent}
        className={cn("maivand-b-breadcrumbs-current", className)}
        {...props}
      />
    );
  },
);

export const Breadcrumbs = Object.assign(BreadcrumbsRoot, {
  List: BreadcrumbsList,
  Item: BreadcrumbsItem,
  Link: BreadcrumbsLink,
  Current: BreadcrumbsCurrent,
});

export type {
  BreadcrumbsProps,
  BreadcrumbsListProps,
  BreadcrumbsItemProps,
  BreadcrumbsLinkProps,
  BreadcrumbsCurrentProps,
};
