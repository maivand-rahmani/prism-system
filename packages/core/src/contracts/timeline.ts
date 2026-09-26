import type { ComponentPropsWithoutRef } from "react";

/**
 * Timeline is an ordered sequence of events. Sub-components are attached as
 * static members: `Timeline.Item`, `Timeline.Title`, `Timeline.Time`,
 * `Timeline.Description`.
 *
 * The root renders a native `<ol>` so the event order is exposed to assistive
 * technology even when visual markers are hidden. `Timeline.Item` is an `li`,
 * `Timeline.Title` a heading, and `Timeline.Time` a native `<time>` that should
 * carry a machine-readable `dateTime` where possible. Rail, marker, and spacing
 * appearance belong to the design system.
 */
export type TimelineProps = ComponentPropsWithoutRef<"ol">;
export type TimelineItemProps = ComponentPropsWithoutRef<"li">;
export type TimelineTitleProps = ComponentPropsWithoutRef<"h3">;
export type TimelineTimeProps = ComponentPropsWithoutRef<"time">;
export type TimelineDescriptionProps = ComponentPropsWithoutRef<"div">;
