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
    <div
      ref={ref}
      className={cn("maivand-plr-ui", "maivand-plr-empty-state", className)}
      {...props}
    >
      {props.dangerouslySetInnerHTML ? null : (
        <>
          <svg
            aria-hidden="true"
            className="maivand-plr-empty-state-illustration"
            focusable="false"
            viewBox="0 0 68 64"
          >
            <path className="maivand-plr-empty-state-page" d="M7.5 6.5h38l14.5 14v37h-52.5z" />
            <path className="maivand-plr-empty-state-page-fold" d="M45.5 7v13.5H59" />
            <path className="maivand-plr-empty-state-rule" d="M15.5 27h15m-15 8h13m-13 8h9" />
            <path className="maivand-plr-empty-state-stem" d="M38.5 52c.5-9 3.5-17 7-24" />
            <path
              className="maivand-plr-empty-state-leaf maivand-plr-empty-state-leaf-left"
              d="M42 38c-8 .5-12-3-12-8 7-2 11 1 12 8Z"
            />
            <path className="maivand-plr-empty-state-leaf-vein" d="m32 31 9 6" />
            <path
              className="maivand-plr-empty-state-leaf maivand-plr-empty-state-leaf-right"
              d="M44 32c1-7 6-11 12-9-1 7-4 10-12 9Z"
            />
            <path className="maivand-plr-empty-state-leaf-vein" d="m45 31 9-6" />
          </svg>
          {props.children}
        </>
      )}
    </div>
  );
});
EmptyStateRoot.displayName = "EmptyState";

export const EmptyStateTitle = React.forwardRef<HTMLHeadingElement, EmptyStateTitleProps>(
  function EmptyStateTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn("maivand-plr-empty-state-title", className)} {...props} />;
  },
);
EmptyStateTitle.displayName = "EmptyState.Title";

export const EmptyStateDescription = React.forwardRef<
  HTMLParagraphElement,
  EmptyStateDescriptionProps
>(function EmptyStateDescription({ className, ...props }, ref) {
  return (
    <p ref={ref} className={cn("maivand-plr-empty-state-description", className)} {...props} />
  );
});
EmptyStateDescription.displayName = "EmptyState.Description";

export const EmptyStateAction = React.forwardRef<HTMLDivElement, EmptyStateActionProps>(
  function EmptyStateAction({ className, ...props }, ref) {
    return <div ref={ref} className={cn("maivand-plr-empty-state-action", className)} {...props} />;
  },
);
EmptyStateAction.displayName = "EmptyState.Action";

export const EmptyState = Object.assign(EmptyStateRoot, {
  Title: EmptyStateTitle,
  Description: EmptyStateDescription,
  Action: EmptyStateAction,
});
