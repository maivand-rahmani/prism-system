"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";

/** Plain-text option. Native options hold text only, so no interactive content is allowed. */
export interface ListBoxOptionProps extends Omit<
  React.ComponentPropsWithoutRef<"option">,
  "children" | "value" | "selected" | "defaultSelected"
> {
  /** Submitted and reported value. Unique within the listbox. */
  value: string;
  /** Visible text. */
  children: string;
}

/** Labelled set of options, rendered as a native `<optgroup>`. */
export interface ListBoxGroupProps extends Omit<
  React.ComponentPropsWithoutRef<"optgroup">,
  "label" | "children"
> {
  /** Visible group heading. Required by the native element. */
  label: string;
  children: React.ReactNode;
}

interface ListBoxSharedProps extends Omit<
  React.ComponentPropsWithoutRef<"select">,
  "children" | "value" | "defaultValue" | "defaultChecked" | "multiple" | "size"
> {
  /** Visible caption. It is the native label of the listbox. */
  label: React.ReactNode;
  /** Help text linked to the listbox through `aria-describedby`. */
  hint?: React.ReactNode;
  /** Error text. It also marks the listbox invalid and is announced as an alert. */
  error?: React.ReactNode;
  /** Marks the listbox invalid without a message. */
  invalid?: boolean;
  /**
   * Visible rows before the list scrolls. Native listboxes need at least two rows; below that
   * the browser draws a dropdown, which belongs to `Select`. Default 5.
   */
  size?: number;
  /** Class applied to the native `<select>`. `className` is applied to the field wrapper. */
  selectClassName?: string;
  children: React.ReactNode;
}

/** Single selection. `value` is the selected option's value, or the first option by default. */
export interface ListBoxSingleProps extends ListBoxSharedProps {
  multiple?: false;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

/** Multiple selection. Each selected option is submitted under `name`. */
export interface ListBoxMultipleProps extends ListBoxSharedProps {
  multiple: true;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
}

export type ListBoxProps = ListBoxSingleProps | ListBoxMultipleProps;

const DEFAULT_ROWS = 5;
const MIN_ROWS = 2;

const ListBoxOption = React.forwardRef<HTMLOptionElement, ListBoxOptionProps>(
  function ListBoxOption({ className, children, value, ...props }, ref) {
    return (
      <option
        ref={ref}
        value={value}
        className={cn("maivand-plr-list-box-option", className)}
        {...props}
      >
        {children}
      </option>
    );
  },
);
ListBoxOption.displayName = "ListBox.Option";

const ListBoxGroup = React.forwardRef<HTMLOptGroupElement, ListBoxGroupProps>(function ListBoxGroup(
  { className, label, children, ...props },
  ref,
) {
  return (
    <optgroup
      ref={ref}
      label={label}
      className={cn("maivand-plr-list-box-group", className)}
      {...props}
    >
      {children}
    </optgroup>
  );
});
ListBoxGroup.displayName = "ListBox.Group";

const ListBoxBase = React.forwardRef<HTMLSelectElement, ListBoxProps>(function ListBox(props, ref) {
  const {
    className,
    selectClassName,
    label,
    hint,
    error,
    invalid = false,
    size = DEFAULT_ROWS,
    id: providedId,
    multiple,
    value,
    defaultValue,
    onValueChange,
    children,
    "aria-describedby": externalDescribedBy,
    "aria-invalid": ariaInvalid,
    onChange,
    ...rest
  } = props;
  const generatedId = React.useId();
  const id = providedId || `maivand-plr-list-box-${generatedId.replace(/:/g, "")}`;
  const messageId = `${id}-message`;
  const hasError = Boolean(error || invalid || ariaInvalid === true || ariaInvalid === "true");
  const describedBy =
    [error || hint ? messageId : null, externalDescribedBy].filter(Boolean).join(" ") || undefined;
  const rows = Math.max(MIN_ROWS, Math.round(size));

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event);
    if (!onValueChange) return;
    const target = event.currentTarget;
    if (multiple) {
      (onValueChange as (next: string[]) => void)(
        Array.from(target.selectedOptions, (option) => option.value),
      );
    } else {
      (onValueChange as (next: string) => void)(target.value);
    }
  };

  return (
    <div className={cn("maivand-plr-ui maivand-plr-list-box-field", className)}>
      <label className="maivand-plr-label" htmlFor={id}>
        {label}
      </label>
      <select
        {...rest}
        ref={ref}
        id={id}
        multiple={multiple === true}
        size={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        className={cn("maivand-plr-list-box", selectClassName)}
        aria-invalid={hasError ? true : ariaInvalid}
        aria-describedby={describedBy}
      >
        {children}
      </select>
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
});
ListBoxBase.displayName = "ListBox";

/**
 * A native listbox. Selection, keyboard navigation, labelling, and form submission come from
 * the browser's `<select>`. Use `ListBox.Option` and `ListBox.Group` for its contents.
 *
 * Overloads: pass `multiple` (with array `value`/`defaultValue`/`onValueChange`) for multiple
 * selection, or omit it for single selection.
 */
export interface ListBoxComponent {
  (props: ListBoxSingleProps & React.RefAttributes<HTMLSelectElement>): React.ReactElement | null;
  (props: ListBoxMultipleProps & React.RefAttributes<HTMLSelectElement>): React.ReactElement | null;
  displayName?: string;
  Option: typeof ListBoxOption;
  Group: typeof ListBoxGroup;
}

export const ListBox = Object.assign(ListBoxBase, {
  Option: ListBoxOption,
  Group: ListBoxGroup,
}) as unknown as ListBoxComponent;
