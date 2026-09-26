import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface ComboboxOwnProps {
  /**
   * Controlled committed selection.
   *
   * The committed selection is independent of the query text: editing
   * `Combobox.Input` invalidates it and reports `onValueChange("")`
   * immediately. When `value` is provided the parent owns the state and is
   * expected to apply the reported changes; meanwhile the primitive keeps
   * suppressing the stale value locally, so a controlled root whose parent has
   * not rerendered yet cannot submit the old selection under the new query.
   * Native form reset only clears that suppression: resetting is not an edit,
   * so the parent's current `value` stands until the parent applies its own
   * reset (see the behavior contract below).
   */
  value?: string;
  /** Initial committed selection for uncontrolled usage. */
  defaultValue?: string;
  /**
   * Called when the committed selection should change.
   *
   * Selecting an enabled option reports that option's value. Editing the input
   * after a selection reports `""` (invalidation); selecting an enabled option
   * again reports its value. For controlled roots this callback is the signal
   * to update `value`.
   */
  onValueChange?: (value: string) => void;
  /**
   * Controlled text query shown in `Combobox.Input`. Query text is
   * display/filter text only: it never becomes the submitted value and never
   * satisfies `required`.
   */
  inputValue?: string;
  /**
   * Initial text query for uncontrolled usage. Defaults to `""`. Native form
   * reset restores an uncontrolled query to this value.
   */
  defaultInputValue?: string;
  /**
   * Called when the text query should change, including the edit that
   * invalidates the committed selection.
   */
  onInputValueChange?: (inputValue: string) => void;
  /** Controlled popup visibility. */
  open?: boolean;
  /** Initial popup visibility for uncontrolled usage. Defaults to `false`. */
  defaultOpen?: boolean;
  /** Called when the popup visibility should change. */
  onOpenChange?: (open: boolean) => void;
  /** Disables the input and the hidden form value. */
  disabled?: boolean;
  /**
   * Marks the field required. Validity is selection-based: while `required` is
   * set and no selection is committed, the visible `Combobox.Input` fails
   * native form constraint validation through `setCustomValidity`, so the form
   * cannot submit. Query text alone never satisfies `required`.
   */
  required?: boolean;
  /**
   * Localized message rendered, announced, and used as the native
   * custom-validity message while `required` is set and no selection is
   * committed. Consumers localize this string; when omitted, a non-localized
   * fallback message is used so native validation still blocks submission.
   */
  requiredMessage?: string;
  /** Marks the field as invalid and sets `aria-invalid` on the input. */
  invalid?: boolean;
  /**
   * Form field name. Implementations render a hidden input carrying it with the
   * committed selection. The hidden input is only a value transport: it is not
   * the validation target, and it submits an empty value until an enabled
   * option is selected (again).
   */
  name?: string;
  children?: ReactNode;
}

/**
 * Combobox is a compound component whose parts are attached as static members:
 * `Combobox.Input`, `Combobox.Content`, `Combobox.Item`. The root is callable
 * and renders a plain wrapper plus a hidden named form value; it owns the
 * state coordination and ARIA relationships for its parts.
 *
 * Behavior contract (implementation-owned):
 * - `Combobox.Input` is the actual focusable text input and carries the
 *   combobox ARIA (`role="combobox"`, `aria-expanded`, `aria-controls`,
 *   `aria-haspopup="listbox"`, `aria-autocomplete="list"`, and
 *   `aria-activedescendant` while an option is active). Focus stays on the
 *   input during keyboard navigation and pointer selection.
 * - `Combobox.Content` is the listbox popup and `Combobox.Item` an option with
 *   `aria-selected`. Option values must be unique within one root.
 * - Keyboard: `ArrowDown`/`ArrowUp` open the popup and activate the first/last
 *   enabled option when none is active, then move without wrapping;
 *   `Enter` selects only the active enabled option; `Escape` closes without
 *   committing, preserves the typed query, and does not restore a selection
 *   invalidated by editing; `Tab` closes without preventing native focus
 *   movement. Disabled options are skipped and can never be committed.
 * - Editing: any edit of `Combobox.Input` after a selection immediately
 *   invalidates the committed selection (`onValueChange("")`) and the hidden
 *   named input submits an empty value until the user selects an enabled
 *   option again or, in controlled usage, the parent supplies a new value.
 * - Filtering: consumers filter by conditionally rendering `Combobox.Item`
 *   children; core performs no asynchronous search, data fetching, or debounced
 *   filtering, and query text never affects the committed value by itself.
 * - Required validity: `required` is enforced with native constraint validation
 *   on the visible input (the focusable control), keyed to a committed
 *   selection — never to query text. `requiredMessage` is exposed (and
 *   associated with the input) while `required` is set, no selection is
 *   committed, and the field was interacted with. The hidden input carries
 *   `name`, the committed value, and `disabled`.
 * - Reset: native form reset restores uncontrolled selection and query to
 *   `defaultValue`/`defaultInputValue` and clears any invalidated-selection
 *   marker. Resetting is not an edit, so a reset never marks a selection
 *   invalidated and reports no value change: a controlled parent owns reset
 *   and must reset `value`/`inputValue` itself, and until it does, the
 *   parent's current `value` again represents the committed selection. This
 *   keeps a controlled value that already equals the parent's reset value from
 *   staying suppressed forever.
 */
export type ComboboxProps = ComboboxOwnProps & Omit<ComponentPropsWithoutRef<"div">, "onChange">;

/**
 * The focusable text input.
 *
 * Root-owned ARIA (`role`, `aria-expanded`, `aria-controls`,
 * `aria-haspopup`, `aria-autocomplete`, `aria-activedescendant`) and the
 * controlled value are omitted so consumers cannot break the combobox
 * relationship. `id`, `aria-describedby`, `aria-invalid`, `disabled`,
 * `required`, and refs are accepted and forwarded so `FormField.Control`
 * `asChild` can attach label/description/error wiring.
 *
 * This input is the native constraint-validation target for `required`:
 * implementations connect `setCustomValidity`/`requiredMessage` to whether an
 * enabled option is committed and clear the custom error after selection.
 * Native `required` is not rendered because query text alone must not satisfy
 * it. `required` maps to `aria-required`; `aria-invalid` reflects explicit
 * `invalid` plus a required field that was interacted with without a committed
 * selection.
 */
export type ComboboxInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  | "type"
  | "name"
  | "value"
  | "defaultValue"
  | "onChange"
  | "role"
  | "aria-expanded"
  | "aria-controls"
  | "aria-activedescendant"
  | "aria-autocomplete"
  | "aria-haspopup"
> & {
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
};

/** The listbox popup. Root-owned `role`, `id`, and visibility are omitted. */
export type ComboboxContentProps = Omit<ComponentPropsWithoutRef<"div">, "role" | "id" | "hidden">;

/**
 * One option.
 *
 * `value` is the committed selection this option yields. `textValue` overrides
 * the string committed to the input on selection; implementations fall back to
 * the string children, then to `value`. Root-owned `role`, `id`, and
 * `aria-selected` are omitted. `disabled` options are not selectable, so they
 * can never become the committed selection.
 */
export type ComboboxItemProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "role" | "id" | "aria-selected" | "aria-disabled"
> & {
  value: string;
  /** Skips the option in keyboard navigation and selection. */
  disabled?: boolean;
  /** Text used for selection; defaults to string children, then `value`. */
  textValue?: string;
};
