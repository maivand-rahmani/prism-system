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
  const id = providedId || `maivand-plr-input-${generatedId.replace(/:/g, "")}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, !error && hint ? hintId : null, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;
  const hasError = Boolean(
    error || invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true",
  );
  return (
    <div className="maivand-plr-ui maivand-plr-field">
      {label && (
        <label className="maivand-plr-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div
        className={cn(
          "maivand-plr-input-shell",
          `maivand-plr-input-${size}`,
          hasError && "maivand-plr-input-shell-error",
        )}
      >
        {startAdornment && (
          <span className="maivand-plr-adornment" aria-hidden="true">
            {startAdornment}
          </span>
        )}
        <InputPrimitive
          ref={ref}
          id={id}
          size={size}
          invalid={hasError}
          className={cn("maivand-plr-input", className)}
          {...props}
          aria-describedby={describedBy}
        />
        {endAdornment && <span className="maivand-plr-adornment">{endAdornment}</span>}
      </div>
      {error ? (
        <span className="maivand-plr-error" id={errorId} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="maivand-plr-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
Input.displayName = "Input";
