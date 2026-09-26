import * as React from "react";
import {
  cn,
  type DescriptionListDescriptionProps,
  type DescriptionListItemProps,
  type DescriptionListProps,
  type DescriptionListTermProps,
} from "@prism-system/ui-core";

export type {
  DescriptionListDescriptionProps,
  DescriptionListItemProps,
  DescriptionListProps,
  DescriptionListTermProps,
};

const DescriptionListRoot = React.forwardRef<HTMLDListElement, DescriptionListProps>(
  function DescriptionList({ className, ...props }, ref) {
    return (
      <dl
        ref={ref}
        className={cn("maivand-a-ui", "maivand-a-description-list", className)}
        {...props}
      />
    );
  },
);
DescriptionListRoot.displayName = "DescriptionList";

export const DescriptionListItem = React.forwardRef<HTMLDivElement, DescriptionListItemProps>(
  function DescriptionListItem({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("maivand-a-description-list-item", className)} {...props} />
    );
  },
);
DescriptionListItem.displayName = "DescriptionListItem";

export const DescriptionListTerm = React.forwardRef<HTMLElement, DescriptionListTermProps>(
  function DescriptionListTerm({ className, ...props }, ref) {
    return <dt ref={ref} className={cn("maivand-a-description-list-term", className)} {...props} />;
  },
);
DescriptionListTerm.displayName = "DescriptionListTerm";

export const DescriptionListDescription = React.forwardRef<
  HTMLElement,
  DescriptionListDescriptionProps
>(function DescriptionListDescription({ className, ...props }, ref) {
  return (
    <dd ref={ref} className={cn("maivand-a-description-list-description", className)} {...props} />
  );
});
DescriptionListDescription.displayName = "DescriptionListDescription";

export const DescriptionList = Object.assign(DescriptionListRoot, {
  Item: DescriptionListItem,
  Term: DescriptionListTerm,
  Description: DescriptionListDescription,
});
