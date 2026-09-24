import type { ComponentPropsWithoutRef } from "react";

/**
 * Fieldset groups related controls. `Fieldset.Legend` is the native caption.
 *
 * Implementations must render the native elements so the group semantics and
 * the legend-to-group association come from the platform rather than from ARIA
 * workarounds.
 */
export type FieldsetProps = ComponentPropsWithoutRef<"fieldset">;
export type FieldsetLegendProps = ComponentPropsWithoutRef<"legend">;
