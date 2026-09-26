"use client";

import * as React from "react";
import { cn, type NumberFieldProps as CoreNumberFieldProps } from "@prism-system/ui-core";

export type NumberFieldProps = CoreNumberFieldProps;

/** Native numeric entry, preserving browser stepping and validation semantics. */
export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  function NumberField(
    { className, invalid = false, type: _type, "aria-invalid": ariaInvalid, ...props },
    ref,
  ) {
    return (
      <input
        ref={ref}
        type="number"
        className={cn("maivand-b-ui", "maivand-b-number-field", className)}
        aria-invalid={ariaInvalid ?? (invalid || undefined)}
        {...props}
      />
    );
  },
);
NumberField.displayName = "NumberField";
