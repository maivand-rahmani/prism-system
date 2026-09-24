"use client";

import * as React from "react";
import {
  Checkbox as CheckboxPrimitive,
  cn,
  type CheckboxProps as CoreCheckboxProps,
} from "@prism-system/ui-core";

export interface CheckboxProps extends CoreCheckboxProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
}
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  {
    className,
    id: providedId,
    label,
    description,
    children,
    checked,
    defaultChecked,
    onCheckedChange,
    invalid = false,
    size = "md",
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const id = providedId || `maivand-a-checkbox-${generatedId.replace(/:/g, "")}`;
  const copyId = `${id}-copy`;
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const hasCopy = Boolean(label || description || children);
  return (
    <span className="maivand-a-ui maivand-a-checkbox">
      <CheckboxPrimitive
        ref={ref}
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        invalid={invalid}
        size={size}
        className={cn("maivand-a-checkbox-input", className)}
        aria-labelledby={ariaLabelledBy || (label ? labelId : children ? copyId : undefined)}
        aria-describedby={ariaDescribedBy || (description ? descriptionId : undefined)}
        {...props}
      >
        <span className="maivand-a-checkbox-box" aria-hidden="true">
          <span className="maivand-a-checkbox-mark">{checked === "indeterminate" ? "–" : "✓"}</span>
        </span>
      </CheckboxPrimitive>
      {hasCopy && (
        <label className="maivand-a-checkbox-copy" htmlFor={id} id={copyId}>
          {label && (
            <span className="maivand-a-checkbox-label" id={labelId}>
              {label}
            </span>
          )}
          {description && (
            <span className="maivand-a-checkbox-description" id={descriptionId}>
              {description}
            </span>
          )}
          {children}
        </label>
      )}
    </span>
  );
});
Checkbox.displayName = "Checkbox";
