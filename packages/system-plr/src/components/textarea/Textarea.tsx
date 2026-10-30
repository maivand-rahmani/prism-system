"use client";

import * as React from "react";
import {
  Textarea as TextareaPrimitive,
  cn,
  type TextareaProps as CoreTextareaProps,
} from "@prism-system/ui-core";

export interface TextareaProps extends CoreTextareaProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id: providedId, label, hint, error, invalid = false, size = "md", ...props },
  ref,
) {
  const generatedId = React.useId();
  const id = providedId || `maivand-plr-textarea-${generatedId.replace(/:/g, "")}`;
  const hasError = Boolean(
    error || invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true",
  );
  const describedBy =
    [error ? `${id}-error` : hint ? `${id}-hint` : null, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="maivand-plr-ui maivand-plr-field">
      {label && (
        <label className="maivand-plr-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="maivand-plr-textarea-sheet">
        <TextareaPrimitive
          ref={ref}
          id={id}
          size={size}
          invalid={hasError}
          className={cn("maivand-plr-textarea", className)}
          {...props}
          aria-describedby={describedBy}
        />
      </div>
      {error ? (
        <span className="maivand-plr-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="maivand-plr-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
Textarea.displayName = "Textarea";
