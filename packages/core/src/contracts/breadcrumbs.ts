import type { ComponentPropsWithoutRef } from "react";

/**
 * Exactly one accessible name is required: `aria-label` or `aria-labelledby`.
 */
export type BreadcrumbsAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

/**
 * Breadcrumbs is a compound component: `Breadcrumbs.List`, `Breadcrumbs.Item`,
 * `Breadcrumbs.Link`, `Breadcrumbs.Current`.
 *
 * The root is a native `<nav>` that must have an accessible name (`aria-label`
 * or `aria-labelledby`). `Breadcrumbs.List` is an ordered list,
 * `Breadcrumbs.Item` is a list item, `Breadcrumbs.Link` is an anchor with a
 * required `href`, and `Breadcrumbs.Current` is the current page rendered as a
 * non-link and carrying `aria-current="page"`.
 */
export type BreadcrumbsProps = Omit<
  ComponentPropsWithoutRef<"nav">,
  "aria-label" | "aria-labelledby"
> &
  BreadcrumbsAccessibleName;

export type BreadcrumbsListProps = ComponentPropsWithoutRef<"ol">;
export type BreadcrumbsItemProps = ComponentPropsWithoutRef<"li">;
export type BreadcrumbsLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
};
export type BreadcrumbsCurrentProps = Omit<ComponentPropsWithoutRef<"span">, "aria-current"> & {
  "aria-current"?: "page";
};
