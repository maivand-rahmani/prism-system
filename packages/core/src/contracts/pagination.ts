import type { ComponentPropsWithoutRef } from "react";

/**
 * Exactly one accessible name is required: `aria-label` or `aria-labelledby`.
 */
export type PaginationAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-labelledby": string; "aria-label"?: never };

/**
 * Pagination is URL-first and stateless: it renders links only and owns no data
 * logic. The product supplies the page URLs and computes the visible range.
 *
 * Compound parts: `Pagination.List`, `Pagination.Item`, `Pagination.Link`,
 * `Pagination.Previous`, `Pagination.Next`, `Pagination.Current`,
 * `Pagination.Ellipsis`.
 *
 * Accessibility contract: the root is a named `<nav>`; `Pagination.Current`
 * carries `aria-current="page"`; `Pagination.Ellipsis` is decorative
 * (`aria-hidden` may only be `true`).
 */
export type PaginationProps = Omit<
  ComponentPropsWithoutRef<"nav">,
  "aria-label" | "aria-labelledby"
> &
  PaginationAccessibleName;

export type PaginationListProps = ComponentPropsWithoutRef<"ul">;
export type PaginationItemProps = ComponentPropsWithoutRef<"li">;

export type PaginationLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href" | "aria-current"> & {
  href: string;
  "aria-current"?: "page";
};

export type PaginationPreviousProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
};
export type PaginationNextProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
};

export type PaginationCurrentProps = Omit<ComponentPropsWithoutRef<"span">, "aria-current"> & {
  "aria-current": "page";
};

export type PaginationEllipsisProps = Omit<ComponentPropsWithoutRef<"span">, "aria-hidden"> & {
  "aria-hidden"?: true;
};
