import * as React from "react";
import {
  cn,
  type TimelineDescriptionProps,
  type TimelineItemProps,
  type TimelineProps,
  type TimelineTimeProps,
  type TimelineTitleProps,
} from "@prism-system/ui-core";

export type {
  TimelineDescriptionProps,
  TimelineItemProps,
  TimelineProps,
  TimelineTimeProps,
  TimelineTitleProps,
};

const TimelineRoot = React.forwardRef<HTMLOListElement, TimelineProps>(function Timeline(
  { className, ...props },
  ref,
) {
  return (
    <ol ref={ref} className={cn("maivand-a-ui", "maivand-a-timeline", className)} {...props} />
  );
});
TimelineRoot.displayName = "Timeline";

export const TimelineItem = React.forwardRef<HTMLLIElement, TimelineItemProps>(
  function TimelineItem({ className, ...props }, ref) {
    return <li ref={ref} className={cn("maivand-a-timeline-item", className)} {...props} />;
  },
);
TimelineItem.displayName = "TimelineItem";

export const TimelineTitle = React.forwardRef<HTMLHeadingElement, TimelineTitleProps>(
  function TimelineTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn("maivand-a-timeline-title", className)} {...props} />;
  },
);
TimelineTitle.displayName = "TimelineTitle";

export const TimelineTime = React.forwardRef<HTMLTimeElement, TimelineTimeProps>(
  function TimelineTime({ className, ...props }, ref) {
    return <time ref={ref} className={cn("maivand-a-timeline-time", className)} {...props} />;
  },
);
TimelineTime.displayName = "TimelineTime";

export const TimelineDescription = React.forwardRef<HTMLDivElement, TimelineDescriptionProps>(
  function TimelineDescription({ className, ...props }, ref) {
    return <div ref={ref} className={cn("maivand-a-timeline-description", className)} {...props} />;
  },
);
TimelineDescription.displayName = "TimelineDescription";

export const Timeline = Object.assign(TimelineRoot, {
  Item: TimelineItem,
  Title: TimelineTitle,
  Time: TimelineTime,
  Description: TimelineDescription,
});
