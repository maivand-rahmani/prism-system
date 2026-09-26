"use client";

import * as React from "react";
import {
  cn,
  type MetricDescriptionProps as CoreMetricDescriptionProps,
  type MetricLabelProps as CoreMetricLabelProps,
  type MetricProps as CoreMetricProps,
  type MetricValueProps as CoreMetricValueProps,
} from "@prism-system/ui-core";

export type MetricProps = CoreMetricProps;
export type MetricLabelProps = CoreMetricLabelProps;
export type MetricValueProps = CoreMetricValueProps;
export type MetricDescriptionProps = CoreMetricDescriptionProps;

/** A semantic definition list for a compact, accurately labelled statistic. */
const MetricRoot = React.forwardRef<HTMLDListElement, MetricProps>(function Metric(
  { className, ...props },
  ref,
) {
  return <dl ref={ref} className={cn("maivand-b-ui", "maivand-b-metric", className)} {...props} />;
});
MetricRoot.displayName = "Metric";

export const MetricLabel = React.forwardRef<HTMLElement, MetricLabelProps>(function MetricLabel(
  { className, ...props },
  ref,
) {
  return <dt ref={ref} className={cn("maivand-b-metric-label", className)} {...props} />;
});
MetricLabel.displayName = "Metric.Label";

export const MetricValue = React.forwardRef<HTMLElement, MetricValueProps>(function MetricValue(
  { className, ...props },
  ref,
) {
  return <dd ref={ref} className={cn("maivand-b-metric-value", className)} {...props} />;
});
MetricValue.displayName = "Metric.Value";

export const MetricDescription = React.forwardRef<HTMLElement, MetricDescriptionProps>(
  function MetricDescription({ className, ...props }, ref) {
    return <dd ref={ref} className={cn("maivand-b-metric-description", className)} {...props} />;
  },
);
MetricDescription.displayName = "Metric.Description";

export const Metric = Object.assign(MetricRoot, {
  Label: MetricLabel,
  Value: MetricValue,
  Description: MetricDescription,
});
