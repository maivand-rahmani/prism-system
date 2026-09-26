import * as React from "react";
import { cn, type MeterProps } from "@prism-system/ui-core";

export type { MeterProps };

/** The native meter element, styled without replacing its accessible semantics. */
export const Meter = React.forwardRef<HTMLMeterElement, MeterProps>(function Meter(
  { className, ...props },
  ref,
) {
  return (
    <meter ref={ref} className={cn("maivand-a-ui", "maivand-a-meter", className)} {...props} />
  );
});
Meter.displayName = "Meter";
