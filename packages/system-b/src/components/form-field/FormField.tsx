"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";
import type {
  FormFieldControlProps,
  FormFieldDescriptionProps,
  FormFieldErrorProps,
  FormFieldLabelProps,
  FormFieldProps,
} from "@prism-system/ui-core";

interface FormFieldContextValue {
  id: string;
  required: boolean;
  disabled: boolean;
  invalid: boolean;
  descriptionId: string;
  errorId: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function useFormField(): FormFieldContextValue {
  const value = React.useContext(FormFieldContext);
  if (!value) throw new Error("FormField parts must be used inside <FormField>.");
  return value;
}

const FormFieldRoot = React.forwardRef<HTMLDivElement, FormFieldProps>(function FormField(
  { id, required = false, disabled = false, invalid = false, className, children, ...props },
  ref,
) {
  const value = React.useMemo<FormFieldContextValue>(
    () => ({
      id,
      required,
      disabled,
      invalid,
      descriptionId: `${id}-description`,
      errorId: `${id}-error`,
    }),
    [id, required, disabled, invalid],
  );
  return (
    <FormFieldContext.Provider value={value}>
      <div
        ref={ref}
        className={cn("maivand-b-ui", "maivand-b-form-field", className)}
        data-required={required || undefined}
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </div>
    </FormFieldContext.Provider>
  );
});
FormFieldRoot.displayName = "FormField";

const FormFieldLabel = React.forwardRef<HTMLLabelElement, FormFieldLabelProps>(
  function FormFieldLabel({ className, ...props }, ref) {
    const field = useFormField();
    return (
      <label
        ref={ref}
        htmlFor={field.id}
        className={cn("maivand-b-form-field-label", className)}
        {...props}
      />
    );
  },
);

const FormFieldControl = React.forwardRef<HTMLDivElement, FormFieldControlProps>(
  function FormFieldControl({ asChild = false, className, children, ...props }, ref) {
    const field = useFormField();
    const describedBy =
      [field.descriptionId, field.invalid ? field.errorId : null].filter(Boolean).join(" ") ||
      undefined;
    const owned = {
      id: field.id,
      "aria-describedby": describedBy,
      "aria-invalid": field.invalid || undefined,
      "aria-required": field.required || undefined,
      disabled: field.disabled || undefined,
    };
    const mergedClassName = cn("maivand-b-form-field-control", className);
    if (asChild) {
      if (!React.isValidElement(children)) {
        throw new Error("FormField.Control with asChild requires exactly one React element child.");
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
    const field = useFormField();
    return (
      <p
        ref={ref}
        id={field.descriptionId}
        className={cn("maivand-b-form-field-description", className)}
        {...props}
      />
    );
  },
);

const FormFieldError = React.forwardRef<HTMLParagraphElement, FormFieldErrorProps>(
  function FormFieldError({ className, ...props }, ref) {
    const field = useFormField();
    if (!field.invalid) return null;
    return (
      <p
        ref={ref}
        id={field.errorId}
        role="alert"
        className={cn("maivand-b-form-field-error", className)}
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
