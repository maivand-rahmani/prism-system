import * as React from "react";
import {
  cn,
  type PaginationCurrentProps,
  type PaginationEllipsisProps,
  type PaginationItemProps,
  type PaginationLinkProps,
  type PaginationListProps,
  type PaginationNextProps,
  type PaginationPreviousProps,
  type PaginationProps,
} from "@prism-system/ui-core";

export type {
  PaginationProps,
  PaginationListProps,
  PaginationItemProps,
  PaginationLinkProps,
  PaginationPreviousProps,
  PaginationNextProps,
  PaginationCurrentProps,
  PaginationEllipsisProps,
};

const PaginationRoot = React.forwardRef<HTMLElement, PaginationProps>(function Pagination(
  { className, ...props },
  ref,
) {
  return (
    <nav ref={ref} className={cn("maivand-a-ui", "maivand-a-pagination", className)} {...props} />
  );
});
PaginationRoot.displayName = "Pagination";

export const PaginationList = React.forwardRef<HTMLUListElement, PaginationListProps>(
  function PaginationList({ className, ...props }, ref) {
    return <ul ref={ref} className={cn("maivand-a-pagination-list", className)} {...props} />;
  },
);
PaginationList.displayName = "PaginationList";

export const PaginationItem = React.forwardRef<HTMLLIElement, PaginationItemProps>(
  function PaginationItem({ className, ...props }, ref) {
    return <li ref={ref} className={cn("maivand-a-pagination-item", className)} {...props} />;
  },
);
PaginationItem.displayName = "PaginationItem";

export const PaginationLink = React.forwardRef<HTMLAnchorElement, PaginationLinkProps>(
  function PaginationLink({ className, ...props }, ref) {
    return <a ref={ref} className={cn("maivand-a-pagination-link", className)} {...props} />;
  },
);
PaginationLink.displayName = "PaginationLink";

export const PaginationPrevious = React.forwardRef<HTMLAnchorElement, PaginationPreviousProps>(
  function PaginationPrevious({ className, ...props }, ref) {
    return (
      <a
        ref={ref}
        rel="prev"
        className={cn("maivand-a-pagination-link", "maivand-a-pagination-previous", className)}
        {...props}
      />
    );
  },
);
PaginationPrevious.displayName = "PaginationPrevious";

export const PaginationNext = React.forwardRef<HTMLAnchorElement, PaginationNextProps>(
  function PaginationNext({ className, ...props }, ref) {
    return (
      <a
        ref={ref}
        rel="next"
        className={cn("maivand-a-pagination-link", "maivand-a-pagination-next", className)}
        {...props}
      />
    );
  },
);
PaginationNext.displayName = "PaginationNext";

export const PaginationCurrent = React.forwardRef<HTMLSpanElement, PaginationCurrentProps>(
  function PaginationCurrent({ className, "aria-current": _ariaCurrent, ...props }, ref) {
    return (
      <span
        ref={ref}
        aria-current="page"
        className={cn("maivand-a-pagination-current", className)}
        {...props}
      />
    );
  },
);
PaginationCurrent.displayName = "PaginationCurrent";

export const PaginationEllipsis = React.forwardRef<HTMLSpanElement, PaginationEllipsisProps>(
  function PaginationEllipsis({ className, "aria-hidden": _ariaHidden, ...props }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn("maivand-a-pagination-ellipsis", className)}
        {...props}
      />
    );
  },
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export const Pagination = Object.assign(PaginationRoot, {
  List: PaginationList,
  Item: PaginationItem,
  Link: PaginationLink,
  Previous: PaginationPrevious,
  Next: PaginationNext,
  Current: PaginationCurrent,
  Ellipsis: PaginationEllipsis,
});
