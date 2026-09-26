"use client";

import * as React from "react";
import {
  cn,
  type EmptyStateActionProps as CoreEmptyStateActionProps,
  type EmptyStateDescriptionProps as CoreEmptyStateDescriptionProps,
  type EmptyStateProps as CoreEmptyStateProps,
  type EmptyStateTitleProps as CoreEmptyStateTitleProps,
} from "@prism-system/ui-core";

export type EmptyStateProps = CoreEmptyStateProps;
export type EmptyStateTitleProps = CoreEmptyStateTitleProps;
export type EmptyStateDescriptionProps = CoreEmptyStateDescriptionProps;
export type EmptyStateActionProps = CoreEmptyStateActionProps;

/** A normal-content placeholder for an empty list, search, or first-use surface. */
const EmptyStateRoot = React.forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn("maivand-b-ui", "maivand-b-empty-state", className)} {...props} />
  );
});
EmptyStateRoot.displayName = "EmptyState";

export const EmptyStateTitle = React.forwardRef<HTMLHeadingElement, EmptyStateTitleProps>(
  function EmptyStateTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn("maivand-b-empty-state-title", className)} {...props} />;
  },
);
EmptyStateTitle.displayName = "EmptyState.Title";

export const EmptyStateDescription = React.forwardRef<
  HTMLParagraphElement,
  EmptyStateDescriptionProps
>(function EmptyStateDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn("maivand-b-empty-state-description", className)} {...props} />;
});
EmptyStateDescription.displayName = "EmptyState.Description";

export const EmptyStateAction = React.forwardRef<HTMLDivElement, EmptyStateActionProps>(
  function EmptyStateAction({ className, ...props }, ref) {
    return <div ref={ref} className={cn("maivand-b-empty-state-action", className)} {...props} />;
  },
);
EmptyStateAction.displayName = "EmptyState.Action";

export const EmptyState = Object.assign(EmptyStateRoot, {
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
  Action: EmptyStateAction,
});
