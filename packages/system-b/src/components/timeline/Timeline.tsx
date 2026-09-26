"use client";

import * as React from "react";
import {
  cn,
  type TimelineDescriptionProps as CoreTimelineDescriptionProps,
  type TimelineItemProps as CoreTimelineItemProps,
  type TimelineProps as CoreTimelineProps,
  type TimelineTimeProps as CoreTimelineTimeProps,
  type TimelineTitleProps as CoreTimelineTitleProps,
} from "@prism-system/ui-core";

export type TimelineProps = CoreTimelineProps;
export type TimelineItemProps = CoreTimelineItemProps;
export type TimelineTitleProps = CoreTimelineTitleProps;
export type TimelineTimeProps = CoreTimelineTimeProps;
export type TimelineDescriptionProps = CoreTimelineDescriptionProps;

/** A semantic ordered sequence of events, with the rail supplied by this system. */
const TimelineRoot = React.forwardRef<HTMLOListElement, TimelineProps>(function Timeline(
  { className, ...props },
  ref,
) {
  return (
    <ol ref={ref} className={cn("maivand-b-ui", "maivand-b-timeline", className)} {...props} />
  );
});
TimelineRoot.displayName = "Timeline";

export const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  function TimelineItem({ className, ...props }, ref) {
    return <li ref={ref} className={cn("maivand-b-timeline-item", className)} {...props} />;
  },
);
TimelineItem.displayName = "Timeline.Item";

export const TimelineTitle = React.forwardRef<HTMLHeadingElement, TimelineTitleProps>(
  function TimelineTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn("maivand-b-timeline-title", className)} {...props} />;
  },
);
TimelineTitle.displayName = "Timeline.Title";

export const TimelineTime = React.forwardRef<HTMLTimeElement, TimelineTimeProps>(
  function TimelineTime({ className, ...props }, ref) {
    return <time ref={ref} className={cn("maivand-b-timeline-time", className)} {...props} />;
  },
);
TimelineTime.displayName = "Timeline.Time";

export const TimelineDescription = React.forwardRef<HTMLDivElement, TimelineDescriptionProps>(
  function TimelineDescription({ className, ...props }, ref) {
    return <div ref={ref} className={cn("maivand-b-timeline-description", className)} {...props} />;
  },
);
TimelineDescription.displayName = "Timeline.Description";

export const Timeline = Object.assign(TimelineRoot, {
  Item: TimelineItem,
  Title: TimelineTitle,
  Time: TimelineTime,
  Description: TimelineDescription,
});
