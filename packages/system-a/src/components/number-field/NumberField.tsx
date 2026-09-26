"use client";

import * as React from "react";
import type { NumberFieldProps as CoreNumberFieldProps } from "@prism-system/ui-core";
import {
  NativeInputField,
  type NativeInputFieldProps,
} from "../native-input-field/NativeInputField";

export type NumberFieldProps = CoreNumberFieldProps &
  Pick<NativeInputFieldProps, "label" | "hint" | "error">;

export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  function NumberField({ type: _type, ...props }, ref) {
    return (
      <NativeInputField
        ref={ref}
        inputType="number"
        inputClassName="maivand-a-number-field"
        {...props}
      />
    );
  },
);
NumberField.displayName = "NumberField";
