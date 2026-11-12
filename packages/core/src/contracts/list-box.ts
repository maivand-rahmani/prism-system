import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * One option in a `ListBox`.
 *
 * `value` is the submitted value and must be unique within one listbox.
 * `children` is plain text only: native options cannot contain interactive or
 * rich content. Selection and focus are owned by the enclosing native select.
 */
export interface ListBoxOptionProps extends Omit<
  ComponentPropsWithoutRef<"option">,
  "children" | "value" | "selected" | "defaultSelected"
> {
  /** Submitted and reported value. Unique within the listbox. */
  value: string;
  /** Visible plain text. */
  children: string;
}

/**
 * A labelled group inside a `ListBox`, rendered as a native `<optgroup>`.
 *
 * Grouping adds structure and a group heading for assistive technology; it does
 * not create a nested selection model. `children` should contain
 * `ListBox.Option` elements.
 */
export interface ListBoxGroupProps extends Omit<
  ComponentPropsWithoutRef<"optgroup">,
  "label" | "children"
> {
  /** Visible group heading. */
  label: string;
  children: ReactNode;
}

interface ListBoxSharedProps extends Omit<
  ComponentPropsWithoutRef<"select">,
  "children" | "value" | "defaultValue" | "defaultChecked" | "multiple" | "size"
> {
  /** Visible caption. It is the native label of the select. */
  label: ReactNode;
  /** Help text associated with the control through `aria-describedby`. */
  hint?: ReactNode;
  /**
   * Error text associated with the control through `aria-describedby`. It also
   * marks the control invalid and is announced as an alert.
   */
  error?: ReactNode;
  /** Marks the control invalid without rendering a message. */
  invalid?: boolean;
  /**
   * Number of visible rows. Implementations must keep at least two rows so the
   * native control remains a listbox rather than the dropdown owned by
   * `Select`.
   */
  size?: number;
  /** The `ListBox.Option` and `ListBox.Group` elements. */
  children: ReactNode;
}

/**
 * Single-selection ListBox.
 *
 * The native `<select>` owns focus, pointer and keyboard selection, typeahead,
 * form submission, reset, and constraint validation; this contract does not
 * reimplement the listbox keyboard model. Selection is controlled when `value`
 * is provided and uncontrolled with `defaultValue` otherwise. When no value is
 * supplied, the browser selects the first option.
 */
export interface ListBoxSingleProps extends ListBoxSharedProps {
  /** Omit or set to `false` for single selection. */
  multiple?: false;
  /** Controlled selected option value. */
  value?: string;
  /** Initially selected option value for uncontrolled usage. */
  defaultValue?: string;
  /** Called with the selected option value. */
  onValueChange?: (value: string) => void;
}

/**
 * Multiple-selection ListBox. Every selected option is submitted under `name`.
 *
 * Selection is controlled when `value` is provided and uncontrolled with
 * `defaultValue` otherwise. `onValueChange` reports a new array of selected
 * values, normally in document order.
 */
export interface ListBoxMultipleProps extends ListBoxSharedProps {
  multiple: true;
  /** Controlled selected option values. */
  value?: readonly string[];
  /** Initially selected option values for uncontrolled usage. */
  defaultValue?: readonly string[];
  /** Called with the complete next array of selected values. */
  onValueChange?: (value: string[]) => void;
}

/**
 * ListBox is a native `<select>` displayed with multiple visible rows.
 *
 * The `multiple` discriminant determines both the value shape and the callback
 * shape: omit `multiple` for a single string, set it to `true` for a string
 * array. Implementations attach the contents as `ListBox.Option` and
 * `ListBox.Group`, render the select as a listbox (at least two visible rows),
 * and use a native `<label>` for `label`.
 *
 * Form semantics are owned by the native select: `name`, `form`, `required`,
 * `disabled`, native `onChange`, successful-control submission, and form reset
 * are forwarded unchanged. There is no hidden transport input. `onValueChange`
 * is an additional convenience that receives the normalized value(s) after
 * `onChange`; consumers that use it do not need to read the event.
 *
 * Accessibility: the browser provides listbox semantics, option selection, and
 * keyboard behavior for a sized multiple/single select. `label` names the
 * control; `hint` and `error` are associated through `aria-describedby`, and
 * `invalid`/`error` set `aria-invalid`. Option text must stay plain. Visual
 * appearance, option spacing, and the field wrapper belong to the design
 * system.
 */
export type ListBoxProps = ListBoxSingleProps | ListBoxMultipleProps;
