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
  const id = providedId || `maivand-a-textarea-${generatedId.replace(/:/g, "")}`;
  const hasError = Boolean(error || invalid);
  const describedBy =
    [error ? `${id}-error` : hint ? `${id}-hint` : null, props["aria-describedby"]]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="maivand-a-ui maivand-a-field">
      {label && (
        <label className="maivand-a-label" htmlFor={id}>
          {label}
        </label>
      )}
      <TextareaPrimitive
        ref={ref}
        id={id}
        size={size}
        invalid={hasError}
        className={cn("maivand-a-textarea", className)}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <span className="maivand-a-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="maivand-a-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
});
Textarea.displayName = "Textarea";
