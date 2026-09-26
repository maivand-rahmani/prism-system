import type { ComponentPropsWithoutRef } from "react";

/**
 * EmptyState is a neutral placeholder for "no data yet" surfaces.
 * Sub-components are attached as static members: `EmptyState.Title`,
 * `EmptyState.Description`, and the optional `EmptyState.Action`.
 *
 * The root has no role and no live-region behavior: an empty state is normal
 * page content, not an alert. `EmptyState.Action` is a plain container so the
 * product places a `Button` or `Link` inside it. Icon, illustration, and
 * spacing choices belong to the design system.
 */
export type EmptyStateProps = ComponentPropsWithoutRef<"div">;
export type EmptyStateTitleProps = ComponentPropsWithoutRef<"h3">;
export type EmptyStateDescriptionProps = ComponentPropsWithoutRef<"p">;
export type EmptyStateActionProps = ComponentPropsWithoutRef<"div">;
