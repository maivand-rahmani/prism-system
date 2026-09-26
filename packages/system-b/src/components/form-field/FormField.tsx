"use client";

import * as React from "react";
import { cn, mergeProps, useComposedRefs } from "@prism-system/ui-core";
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
  parts: { description: boolean; error: boolean };
  setPart: (part: "description" | "error", present: boolean) => void;
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
  const [parts, setParts] = React.useState({ description: false, error: false });
  const setPart = React.useCallback((part: "description" | "error", present: boolean) => {
    setParts((current) => (current[part] === present ? current : { ...current, [part]: present }));
  }, []);
  const value = React.useMemo<FormFieldContextValue>(
    () => ({
      id,
      required,
      disabled,
      invalid,
      descriptionId: `${id}-description`,
      errorId: `${id}-error`,
      parts,
      setPart,
    }),
    [id, required, disabled, invalid, parts, setPart],
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

const FormFieldControl = React.forwardRef<HTMLElement, FormFieldControlProps>(
  function FormFieldControl({ asChild = false, className, children, ...props }, ref) {
    const field = useFormField();
    const child =
      asChild && React.isValidElement(children)
        ? (children as React.ReactElement<{
            className?: string;
            ref?: React.Ref<HTMLElement>;
            "aria-describedby"?: string;
          }>)
        : null;
    const childProps = child?.props as
      { className?: string; ref?: React.Ref<HTMLElement>; "aria-describedby"?: string } | undefined;
    const childRef = child
      ? React.version.startsWith("18.")
        ? (child as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref
        : child.props.ref
      : undefined;
    const composedRef = useComposedRefs(ref, childRef);
    const describedBy =
      [
        ...new Set(
          [
            field.parts.description && field.descriptionId,
            field.invalid && field.parts.error && field.errorId,
            (props as Record<string, unknown>)["aria-describedby"],
            childProps?.["aria-describedby"],
          ]
            .filter(Boolean)
            .join(" ")
            .split(/\s+/)
            .filter(Boolean),
        ),
      ].join(" ") || undefined;
    const owned = {
      id: field.id,
      "aria-describedby": describedBy,
      "aria-invalid": field.invalid ? true : undefined,
      "aria-required": field.required ? true : undefined,
      "aria-disabled": field.disabled ? true : undefined,
      disabled: field.disabled ? true : undefined,
    };
    const mergedClassName = cn("maivand-b-form-field-control", className);
    if (asChild) {
      if (!child) {
        throw new Error("FormField.Control with asChild requires exactly one React element child.");
      }
      return React.cloneElement(child, {
        ...mergeProps(
          child.props as Record<string, unknown>,
          props as Record<string, unknown>,
          owned,
        ),
        className: cn(child.props.className, mergedClassName),
        ref: composedRef,
      } as never);
    }
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={mergedClassName} {...props}>
        {children}
      </div>
    );
  },
);

const FormFieldDescription = React.forwardRef<HTMLParagraphElement, FormFieldDescriptionProps>(
  function FormFieldDescription({ className, ...props }, ref) {
    const field = useFormField();
    const { setPart } = field;
    React.useEffect(() => {
      setPart("description", true);
      return () => setPart("description", false);
    }, [setPart]);
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
    const { setPart, invalid } = field;
    React.useEffect(() => {
      if (!invalid) return;
      setPart("error", true);
      return () => setPart("error", false);
    }, [invalid, setPart]);
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
