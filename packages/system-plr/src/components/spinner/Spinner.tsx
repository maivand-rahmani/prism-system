"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";
import "./spinner.css";

export interface SpinnerProps extends Omit<
  React.ComponentPropsWithoutRef<"span">,
  "role" | "aria-label" | "aria-labelledby"
> {
  /** Accessible name announced while work is in progress. */
  label: string;
  /** Size of the inked loading mark. */
  size?: "sm" | "md" | "lg";
}

/** A named status indicator for real, currently pending work. */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { className, label, size = "md", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      {...props}
      role="status"
      aria-label={label}
      className={cn(
        "maivand-plr-ui",
        "maivand-plr-spinner",
        `maivand-plr-spinner-${size}`,
        className,
      )}
    >
      <svg aria-hidden="true" className="maivand-plr-spinner-mark" viewBox="0 0 24 24">
        <circle className="maivand-plr-spinner-track" cx="12" cy="12" r="9" />
        <path className="maivand-plr-spinner-ink" d="M12 3a9 9 0 0 1 9 9" />
      </svg>
    </span>
  );
});
Spinner.displayName = "Spinner";
