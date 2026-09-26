"use client";

import * as React from "react";
import { cn, type DatePickerProps as CoreDatePickerProps } from "@prism-system/ui-core";

export type DatePickerProps = CoreDatePickerProps;

/** Native date entry with the browser's calendar and keyboard behavior intact. */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { className, invalid = false, type: _type, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="date"
      className={cn("maivand-b-ui", "maivand-b-date-picker", className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      {...props}
    />
  );
});
DatePicker.displayName = "DatePicker";
