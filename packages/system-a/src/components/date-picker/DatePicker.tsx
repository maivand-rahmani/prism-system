"use client";

import * as React from "react";
import type { DatePickerProps as CoreDatePickerProps } from "@prism-system/ui-core";
import {
  NativeInputField,
  type NativeInputFieldProps,
} from "../native-input-field/NativeInputField";

export type DatePickerProps = CoreDatePickerProps &
  Pick<NativeInputFieldProps, "label" | "hint" | "error">;

export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { type: _type, ...props },
  ref,
) {
  return (
    <NativeInputField
      ref={ref}
      inputType="date"
      inputClassName="maivand-a-date-picker"
      {...props}
    />
  );
});
DatePicker.displayName = "DatePicker";
