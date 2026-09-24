import * as React from "react";
import { cn, type ProgressProps } from "@prism-system/ui-core";

export type { ProgressProps };
export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { value, max = 100, className, ...props },
  ref,
) {
  const isDeterminate = typeof value === "number" && Number.isFinite(value);
  const upperBound = Number.isFinite(max) && max > 0 ? max : 100;
  const clamped = isDeterminate ? Math.min(Math.max(value, 0), upperBound) : null;
  const percent = clamped === null ? null : (clamped / upperBound) * 100;
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={upperBound}
      aria-valuenow={clamped ?? undefined}
      data-state={isDeterminate ? "determinate" : "indeterminate"}
      className={cn(
        "maivand-a-ui",
        "maivand-a-progress",
        !isDeterminate && "maivand-a-progress-indeterminate",
        className,
      )}
      {...props}
    >
      <span
        className="maivand-a-progress-indicator"
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
});
Progress.displayName = "Progress";
