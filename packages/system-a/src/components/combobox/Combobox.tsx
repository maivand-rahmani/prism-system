"use client";

import * as React from "react";
import {
  Combobox as ComboboxPrimitive,
  cn,
  type ComboboxContentProps,
  type ComboboxInputProps,
  type ComboboxItemProps,
  type ComboboxProps as CoreComboboxProps,
} from "@prism-system/ui-core";

type PrimitiveInputProps = ComboboxInputProps;
type PrimitiveContentProps = ComboboxContentProps;
type PrimitiveItemProps = ComboboxItemProps;

export interface ComboboxProps extends CoreComboboxProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  id?: string;
}

type ComboboxFieldState = {
  id: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  invalid: boolean;
};
const ComboboxFieldContext = React.createContext<ComboboxFieldState | null>(null);

const ComboboxRoot = function Combobox({
  className,
  id: providedId,
  label,
  hint,
  error,
  invalid = false,
  children,
  ...props
}: ComboboxProps) {
  const generatedId = React.useId();
  const inputId = providedId
    ? `${providedId}-input`
    : `maivand-a-combobox-${generatedId.replace(/:/g, "")}`;
  const hasError = invalid || Boolean(error);
  const state = React.useMemo(
    () => ({ id: inputId, hint, error, invalid: hasError }),
    [inputId, hint, error, hasError],
  );
  return (
    <ComboboxFieldContext.Provider value={state}>
      <div className={cn("maivand-a-ui", "maivand-a-combobox-field", className)}>
        {label && (
          <label className="maivand-a-label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <ComboboxPrimitive
          {...props}
          id={providedId}
          invalid={hasError}
          className="maivand-a-combobox-root"
        >
          {children}
        </ComboboxPrimitive>
        {error ? (
          <span className="maivand-a-error" id={`${inputId}-error`} role="alert">
            {error}
          </span>
        ) : hint ? (
          <span className="maivand-a-hint" id={`${inputId}-hint`}>
            {hint}
          </span>
        ) : null}
      </div>
    </ComboboxFieldContext.Provider>
  );
};
ComboboxRoot.displayName = "Combobox";

export const ComboboxInput = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Input>,
  PrimitiveInputProps
>(function ComboboxInput(
  {
    className,
    id: providedId,
    invalid,
    "aria-describedby": externalDescribedBy,
    "aria-invalid": externalInvalid,
    ...props
  },
  ref,
) {
  const field = React.useContext(ComboboxFieldContext);
  const id = providedId || field?.id;
  const describedBy =
    [
      field?.error ? `${field.id}-error` : field?.hint ? `${field.id}-hint` : null,
      externalDescribedBy,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const isInvalid = Boolean(
    field?.invalid || invalid || externalInvalid === true || externalInvalid === "true",
  );
  return (
    <ComboboxPrimitive.Input
      ref={ref}
      id={id}
      className={cn("maivand-a-combobox-input", className)}
      aria-describedby={describedBy}
      aria-invalid={isInvalid ? true : externalInvalid}
      invalid={isInvalid}
      {...props}
    />
  );
});
ComboboxInput.displayName = "ComboboxInput";

export const ComboboxContent = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Content>,
  PrimitiveContentProps
>(function ComboboxContent({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.Content
      ref={ref}
      className={cn("maivand-a-ui", "maivand-a-combobox-content", className)}
      {...props}
    />
  );
});
ComboboxContent.displayName = "ComboboxContent";

export const ComboboxItem = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Item>,
  PrimitiveItemProps
>(function ComboboxItem({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.Item
      ref={ref}
      className={cn("maivand-a-combobox-item", className)}
      {...props}
    />
  );
});
ComboboxItem.displayName = "ComboboxItem";

export const Combobox = Object.assign(ComboboxRoot, {
  Input: ComboboxInput,
  Content: ComboboxContent,
  Item: ComboboxItem,
});

export type { ComboboxInputProps, ComboboxContentProps, ComboboxItemProps };
