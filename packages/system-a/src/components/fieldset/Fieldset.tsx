import * as React from "react";
import {
  cn,
  type FieldsetLegendProps,
  type FieldsetProps,
} from "@prism-system/ui-core";

export type { FieldsetProps, FieldsetLegendProps };
const FieldsetRoot = React.forwardRef<HTMLFieldSetElement, FieldsetProps>(function Fieldset(
  { className, ...props },
  ref,
) {
  return (
    <fieldset
      ref={ref}
      className={cn("maivand-a-ui", "maivand-a-fieldset", className)}
      {...props}
    />
  );
});
FieldsetRoot.displayName = "Fieldset";
export const FieldsetLegend = React.forwardRef<HTMLLegendElement, FieldsetLegendProps>(
  function FieldsetLegend({ className, ...props }, ref) {
    return (
      <legend
        ref={ref}
        className={cn("maivand-a-fieldset-legend", className)}
        {...props}
      />
    );
  },
);
FieldsetLegend.displayName = "FieldsetLegend";
export const Fieldset = Object.assign(FieldsetRoot, { Legend: FieldsetLegend });
