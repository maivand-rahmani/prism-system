"use client";

import * as React from "react";
import {
  cn,
  type FormFieldControlProps,
  type FormFieldDescriptionProps,
  type FormFieldErrorProps,
  type FormFieldLabelProps,
  type FormFieldProps,
} from "@prism-system/ui-core";

type FieldState = {
  id: string;
  required: boolean;
  disabled: boolean;
  invalid: boolean;
  describedBy: string;
};

const FieldContext = React.createContext<FieldState | null>(null);

function useField(): FieldState {
  const value = React.useContext(FieldContext);
  if (!value) throw new Error("FormField parts must be used inside FormField.");
  return value;
}

const FormFieldRoot = React.forwardRef<HTMLDivElement, FormFieldProps>(function FormField(
  { id, required = false, disabled = false, invalid = false, className, children, ...props },
  ref,
) {
  const describedBy = `${id}-description${invalid ? ` ${id}-error` : ""}`;
  const value = React.useMemo(
    () => ({ id, required, disabled, invalid, describedBy }),
    [id, required, disabled, invalid, describedBy],
  );
  return (
    <FieldContext.Provider value={value}>
      <div
        ref={ref}
        className={cn("maivand-a-ui", "maivand-a-form-field", className)}
        {...props}
      >
        {children}
      </div>
    </FieldContext.Provider>
  );
});
FormFieldRoot.displayName = "FormField";

const FormFieldLabel = React.forwardRef<HTMLLabelElement, FormFieldLabelProps>(
  function FormFieldLabel({ className, ...props }, ref) {
    const field = useField();
    return (
      <label
        ref={ref}
        htmlFor={field.id}
        className={cn("maivand-a-form-field-label", className)}
        {...props}
      />
    );
  },
);

const FormFieldControl = React.forwardRef<HTMLDivElement, FormFieldControlProps>(
  function FormFieldControl({ asChild = false, className, children, ...props }, ref) {
    const field = useField();
    const mergedClassName = cn("maivand-a-form-field-control", className);
    const owned = {
      id: field.id,
      "aria-describedby": field.describedBy || undefined,
      "aria-invalid": field.invalid || undefined,
      "aria-required": field.required || undefined,
      "aria-disabled": field.disabled || undefined,
      disabled: field.disabled || undefined,
    };
    if (asChild) {
      if (!React.isValidElement(children)) {
        throw new Error("FormField.Control with asChild requires one React element.");
      }
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        ...props,
        ...owned,
        className: cn(child.props.className, mergedClassName),
        ref,
      } as never);
    }
    return (
      <div ref={ref} {...owned} className={mergedClassName} {...props}>
        {children}
      </div>
    );
  },
);

const FormFieldDescription = React.forwardRef<HTMLParagraphElement, FormFieldDescriptionProps>(
  function FormFieldDescription({ className, ...props }, ref) {
    const field = useField();
    return (
      <p
        ref={ref}
        id={`${field.id}-description`}
        className={cn("maivand-a-form-field-description", className)}
        {...props}
      />
    );
  },
);

const FormFieldError = React.forwardRef<HTMLParagraphElement, FormFieldErrorProps>(
  function FormFieldError({ className, ...props }, ref) {
    const field = useField();
    if (!field.invalid) return null;
    return (
      <p
        ref={ref}
        id={`${field.id}-error`}
        role="alert"
        className={cn("maivand-a-form-field-error", className)}
        {...props}
      />
    );
  },
);

export const FormField = Object.assign(FormFieldRoot, {
  Label: FormFieldLabel,
  Control: FormFieldControl,
  Description: FormFieldDescription,
  Error: FormFieldError,
});
export type {
  FormFieldProps,
  FormFieldLabelProps,
  FormFieldControlProps,
  FormFieldDescriptionProps,
  FormFieldErrorProps,
};
