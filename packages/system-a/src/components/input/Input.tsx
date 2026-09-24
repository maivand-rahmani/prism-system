"use client";

import * as React from "react";
import {
  Input as InputPrimitive,
  cn,
  type InputProps as CoreInputProps,
} from "@prism-system/ui-core";

export interface InputProps extends CoreInputProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    id: providedId,
    label,
    hint,
    error,
    invalid = false,
    size = "md",
    startAdornment,
    endAdornment,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const id = providedId || `maivand-a-input-${generatedId.replace(/:/g, "")}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, !error && hint ? hintId : null, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;
  const hasError = Boolean(error || invalid);
  return (
    <div className="maivand-a-ui maivand-a-field">
      {label && (
        <label className="maivand-a-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div
        className={cn(
          "maivand-a-input-shell",
          `maivand-a-input-${size}`,
          hasError && "maivand-a-input-shell-error",
        )}
      >
        {startAdornment && (
          <span className="maivand-a-adornment" aria-hidden="true">
            {startAdornment}
          </span>
        )}
        <InputPrimitive
          ref={ref}
          id={id}
          size={size}
          invalid={hasError}
          className={cn("maivand-a-input", className)}
          aria-describedby={describedBy}
          {...props}
        />
        {endAdornment && <span className="maivand-a-adornment">{endAdornment}</span>}
      </div>
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
Input.displayName = "Input";
