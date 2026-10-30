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
  const id = providedId || `maivand-plr-checkbox-${generatedId.replace(/:/g, "")}`;
  const copyId = `${id}-copy`;
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const hasCopy = Boolean(label || description || children);
  return (
    <span className="maivand-plr-ui maivand-plr-checkbox">
      <CheckboxPrimitive
        ref={ref}
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        invalid={invalid}
        size={size}
        className={cn("maivand-plr-checkbox-input", className)}
        aria-labelledby={ariaLabelledBy || (label ? labelId : children ? copyId : undefined)}
        aria-describedby={ariaDescribedBy || (description ? descriptionId : undefined)}
        {...props}
      >
        <span className="maivand-plr-checkbox-box" aria-hidden="true">
          <svg
            className="maivand-plr-checkbox-mark"
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 18 18"
          >
            <path
              className="maivand-plr-checkbox-check"
              d="M3.5 9.3 7.1 12.8 14.6 5.2"
              pathLength={1}
            />
            <path
              className="maivand-plr-checkbox-vein"
              d="M7.4 12.5c.2-2 1.5-3.7 4.4-5.6"
              pathLength={1}
            />
          </svg>
          <span className="maivand-plr-checkbox-mixed">−</span>
        </span>
      </CheckboxPrimitive>
      {hasCopy && (
        <label className="maivand-plr-checkbox-copy" htmlFor={id} id={copyId}>
          {label && (
            <span className="maivand-plr-checkbox-label" id={labelId}>
              {label}
            </span>
          )}
          {description && (
            <span className="maivand-plr-checkbox-description" id={descriptionId}>
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
