import type { ComponentPropsWithoutRef } from "react";

/**
 * Metric is a compact statistic. Sub-components are attached as static members:
 * `Metric.Label`, `Metric.Value`, and the optional `Metric.Description`.
 *
 * The root renders a native `<dl>` so the label/value association comes from
 * the platform rather than from ARIA: `Metric.Label` is a `dt` and both
 * `Metric.Value` and `Metric.Description` are `dd`, which allows one label to
 * carry a value plus supporting context. Units, precision, and formatting
 * belong to the product copy; the contract exposes no appearance props.
 */
export type MetricProps = ComponentPropsWithoutRef<"dl">;
export type MetricLabelProps = ComponentPropsWithoutRef<"dt">;
export type MetricValueProps = ComponentPropsWithoutRef<"dd">;
export type MetricDescriptionProps = ComponentPropsWithoutRef<"dd">;
