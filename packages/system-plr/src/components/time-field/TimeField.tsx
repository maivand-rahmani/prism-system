"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";
import "./time-field.css";

/**
 * Native time-of-day field: `<input type="time">` with the Plan Like Rahmani
 * paper treatment. Every native attribute (`name`, `form`, `disabled`,
 * `required`, `min`, `max`, `step`, `value`/`defaultValue`, `onChange`) and the
 * forwarded ref pass straight to the input. Constraint validation stays with
 * the browser; this component only adds label, hint, and error wiring.
 */
export interface TimeFieldProps extends Omit<React.ComponentPropsWithoutRef<"input">, "type"> {
  /** Visible label, associated with the input through `htmlFor`. */
  label?: React.ReactNode;
  /** Helper text under the field. Replaced by `error` when both are set. */
  hint?: React.ReactNode;
  /** Error text under the field. Announced with `role="alert"` and sets `aria-invalid`. */
  error?: React.ReactNode;
  /** Marks the field invalid and sets `aria-invalid` without adding text. */
  invalid?: boolean;
  /** Fixed to `"time"`; accepted only for explicitness. */
  type?: "time";
}

export const TimeField = React.forwardRef<HTMLInputElement, TimeFieldProps>(function TimeField(
  {
    className,
    id: providedId,
    label,
    hint,
    error,
    invalid = false,
    type: _type,
    "aria-describedby": externalDescribedBy,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const id = providedId || `maivand-plr-time-field-${generatedId.replace(/:/g, "")}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = Boolean(error || invalid || ariaInvalid === true || ariaInvalid === "true");
  const describedBy =
    [error ? errorId : hint ? hintId : null, externalDescribedBy].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div
      className="maivand-plr-ui maivand-plr-field maivand-plr-native-field"
      data-native-input-type="time"
    >
      {label && (
        <label className="maivand-plr-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="maivand-plr-native-control-track">
        <input
          ref={ref}
          id={id}
          type="time"
          className={cn(
            "maivand-plr-native-control",
            "maivand-plr-native-control-time",
            "maivand-plr-time-field",
            hasError && "maivand-plr-native-control-error",
            className,
          )}
          aria-describedby={describedBy}
          aria-invalid={hasError ? true : ariaInvalid}
          {...props}
        />
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
TimeField.displayName = "TimeField";
