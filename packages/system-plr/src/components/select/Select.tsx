"use client";

import * as React from "react";
import {
  Select as SelectPrimitive,
  SelectContent as SelectContentPrimitive,
  SelectGroup as SelectGroupPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectLabel as SelectLabelPrimitive,
  SelectSeparator as SelectSeparatorPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue as SelectValuePrimitive,
  cn,
  type SelectContentProps as CoreSelectContentProps,
  type SelectGroupProps as CoreSelectGroupProps,
  type SelectItemProps as CoreSelectItemProps,
  type SelectLabelProps as CoreSelectLabelProps,
  type SelectProps as CoreSelectProps,
  type SelectSeparatorProps as CoreSelectSeparatorProps,
  type SelectTriggerProps as CoreSelectTriggerProps,
  type SelectValueProps as CoreSelectValueProps,
} from "@prism-system/ui-core";

export interface SelectProps extends CoreSelectProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
}
type SelectFieldState = {
  id: string;
  messageId?: string;
  invalid: boolean;
  placeholder?: React.ReactNode;
};
const SelectFieldContext = React.createContext<SelectFieldState | null>(null);
const SelectRoot = function Select({
  className,
  label,
  hint,
  error,
  size: _size = "md",
  id: providedId,
  invalid: _invalid,
  placeholder,
  children,
  ...props
}: SelectProps) {
  const generatedId = React.useId();
  const id = providedId || `maivand-plr-select-${generatedId.replace(/:/g, "")}`;
  const messageId = `${id}-message`;
  const hasError = Boolean(error || _invalid);
  const fieldState = React.useMemo(
    () => ({
      id,
      messageId: error || hint ? messageId : undefined,
      invalid: hasError,
      placeholder,
    }),
    [error, hasError, hint, id, messageId, placeholder],
  );
  return (
    <div className={cn("maivand-plr-ui maivand-plr-select-field", className)}>
      {label && (
        <label className="maivand-plr-label" htmlFor={id}>
          {label}
        </label>
      )}
      <SelectFieldContext.Provider value={fieldState}>
        <SelectPrimitive {...props}>{children}</SelectPrimitive>
      </SelectFieldContext.Provider>
      {(error || hint) && (
        <span
          id={messageId}
          className={error ? "maivand-plr-error" : "maivand-plr-hint"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
};
SelectRoot.displayName = "Select";
export const SelectTrigger = React.forwardRef<HTMLButtonElement, CoreSelectTriggerProps>(
  function SelectTrigger(
    {
      className,
      size = "md",
      invalid = false,
      id: providedId,
      "aria-invalid": externalInvalid,
      "aria-describedby": externalDescribedBy,
      ...props
    },
    ref,
  ) {
    const fieldId = React.useContext(SelectFieldContext);
    const isInvalid = Boolean(
      fieldId?.invalid || invalid || externalInvalid === true || externalInvalid === "true",
    );
    const describedBy =
      [fieldId?.messageId, externalDescribedBy].filter(Boolean).join(" ") || undefined;
    return (
      <SelectTriggerPrimitive
        ref={ref}
        id={providedId || fieldId?.id}
        size={size}
        invalid={isInvalid}
        aria-invalid={isInvalid || externalInvalid}
        aria-describedby={describedBy}
        className={cn("maivand-plr-select-trigger", `maivand-plr-input-${size}`, className)}
        {...props}
      />
    );
  },
);
export const SelectValue = React.forwardRef<HTMLSpanElement, CoreSelectValueProps>(
  function SelectValue({ className, placeholder, ...props }, ref) {
    const fieldState = React.useContext(SelectFieldContext);
    // An explicit Select.Value placeholder wins; the root placeholder is the fallback.
    const resolvedPlaceholder = placeholder !== undefined ? placeholder : fieldState?.placeholder;
    return (
      <SelectValuePrimitive
        ref={ref}
        className={cn("maivand-plr-select-value", className)}
        placeholder={resolvedPlaceholder}
        {...props}
      />
    );
  },
);
export const SelectContent = React.forwardRef<HTMLDivElement, CoreSelectContentProps>(
  function SelectContent({ className, forceMount, position = "popper", ...props }, ref) {
    return (
      <SelectContentPrimitive
        ref={ref}
        className={cn("maivand-plr-ui maivand-plr-select-content", className)}
        position={position}
        {...props}
        {...(forceMount ? { forceMount: true } : {})}
      />
    );
  },
);
export const SelectGroup = React.forwardRef<HTMLDivElement, CoreSelectGroupProps>(
  function SelectGroup({ className, ...props }, ref) {
    return (
      <SelectGroupPrimitive
        ref={ref}
        className={cn("maivand-plr-select-group", className)}
        {...props}
      />
    );
  },
);
export const SelectLabel = React.forwardRef<HTMLDivElement, CoreSelectLabelProps>(
  function SelectLabel({ className, ...props }, ref) {
    return (
      <SelectLabelPrimitive
        ref={ref}
        className={cn("maivand-plr-select-label", className)}
        {...props}
      />
    );
  },
);
export const SelectItem = React.forwardRef<HTMLDivElement, CoreSelectItemProps>(function SelectItem(
  { className, ...props },
  ref,
) {
  return (
    <SelectItemPrimitive
      ref={ref}
      className={cn("maivand-plr-select-item", className)}
      {...props}
    />
  );
});
export const SelectSeparator = React.forwardRef<HTMLDivElement, CoreSelectSeparatorProps>(
  function SelectSeparator({ className, ...props }, ref) {
    return (
      <SelectSeparatorPrimitive
        ref={ref}
        className={cn("maivand-plr-select-separator", className)}
        {...props}
      />
    );
  },
);
export const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Value: SelectValue,
  Content: SelectContent,
  Group: SelectGroup,
  Label: SelectLabel,
  Item: SelectItem,
  Separator: SelectSeparator,
});
