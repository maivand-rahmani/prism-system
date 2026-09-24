import type { ComponentPropsWithoutRef } from "react";

export interface LinkOwnProps {
  /** Navigation target. Required: a link without a destination is invalid. */
  href: string;
}

/**
 * Link renders a native anchor.
 *
 * Implementations must render an `<a>` (a client-side router that produces one
 * is fine) so focus, middle-click, and "open in new tab" keep working. Styling
 * belongs to the design system; `Link` exposes no visual variants.
 */
export type LinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & LinkOwnProps;
