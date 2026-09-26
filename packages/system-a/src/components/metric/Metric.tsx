import * as React from "react";
import {
  cn,
  type MetricDescriptionProps,
  type MetricLabelProps,
  type MetricProps,
  type MetricValueProps,
} from "@prism-system/ui-core";

export type { MetricDescriptionProps, MetricLabelProps, MetricProps, MetricValueProps };

const MetricRoot = React.forwardRef<HTMLDListElement, MetricProps>(function Metric(
  { className, ...props },
  ref,
) {
  return <dl ref={ref} className={cn("maivand-a-ui", "maivand-a-metric", className)} {...props} />;
});
MetricRoot.displayName = "Metric";

export const MetricLabel = React.forwardRef<HTMLElement, MetricLabelProps>(function MetricLabel(
  { className, ...props },
  ref,
) {
  return <dt ref={ref} className={cn("maivand-a-metric-label", className)} {...props} />;
});
MetricLabel.displayName = "MetricLabel";

export const MetricValue = React.forwardRef<HTMLElement, MetricValueProps>(function MetricValue(
  { className, ...props },
  ref,
) {
  return <dd ref={ref} className={cn("maivand-a-metric-value", className)} {...props} />;
});
MetricValue.displayName = "MetricValue";

export const MetricDescription = React.forwardRef<HTMLElement, MetricDescriptionProps>(
  function MetricDescription({ className, ...props }, ref) {
    return <dd ref={ref} className={cn("maivand-a-metric-description", className)} {...props} />;
  },
);
MetricDescription.displayName = "MetricDescription";

export const Metric = Object.assign(MetricRoot, {
  Label: MetricLabel,
  Value: MetricValue,
  Description: MetricDescription,
});
