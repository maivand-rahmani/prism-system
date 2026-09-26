"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";

export type NativeInputFieldProps = Omit<React.ComponentPropsWithoutRef<"input">, "type"> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  invalid?: boolean;
};

type NativeInputType = "date" | "number" | "range" | "file";

/** Shared field wiring for the native input contracts; the ref always targets the input. */
export const NativeInputField = React.forwardRef<
  HTMLInputElement,
  NativeInputFieldProps & {
    inputType: NativeInputType;
    inputClassName: string;
  }
>(function NativeInputField(
  {
    inputType,
    inputClassName,
    className,
    id: providedId,
    label,
    hint,
    error,
    invalid = false,
    "aria-describedby": externalDescribedBy,
    "aria-invalid": ariaInvalid,
    "aria-labelledby": ariaLabelledBy,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const id = providedId || `maivand-a-${inputType}-${generatedId.replace(/:/g, "")}`;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = Boolean(error || invalid || ariaInvalid === true || ariaInvalid === "true");
  const describedBy =
    [error ? errorId : hint ? hintId : null, externalDescribedBy].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="maivand-a-ui maivand-a-field">
      {label && (
        <label className="maivand-a-label" htmlFor={id} id={labelId}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        type={inputType}
        className={cn(
          "maivand-a-native-control",
          `maivand-a-native-control-${inputType}`,
          hasError && "maivand-a-native-control-error",
          className,
          inputClassName,
        )}
        aria-describedby={describedBy}
        aria-invalid={hasError ? true : ariaInvalid}
        aria-labelledby={ariaLabelledBy || (label ? labelId : undefined)}
        {...props}
      />
      {error ? (
        <span className="maivand-a-error" id={errorId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="maivand-a-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
NativeInputField.displayName = "NativeInputField";
