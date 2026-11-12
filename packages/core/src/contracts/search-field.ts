import type { ChangeEventHandler, ComponentPropsWithoutRef, ReactNode } from "react";

export interface SearchFieldOwnProps {
  /**
   * Visible label, always associated with the input. Required because the input
   * needs an accessible name even when the label is visually hidden.
   */
  label: ReactNode;
  /** Visually hides the label while keeping it for assistive technology. */
  hideLabel?: boolean;
  /** Helper text under the field. Replaced by `error` when both are set. */
  hint?: ReactNode;
  /** Error text under the field. Announced with `role="alert"` and sets `aria-invalid`. */
  error?: ReactNode;
  /** Marks the field invalid and sets `aria-invalid` without adding text. */
  invalid?: boolean;
  /** Controlled text. Omit to let the field own its text. */
  value?: string;
  /** Initial text when uncontrolled. Restored when the owning form resets. */
  defaultValue?: string;
  /** Called with the new text on every change, including clearing. */
  onValueChange?: (value: string) => void;
  /** Native React change handler. Fires for typing, browser Escape, and clearing. */
  onChange?: ChangeEventHandler<HTMLInputElement>;
  /**
   * Accessible name of the clear button. Defaults to English; pass a localized
   * string for other languages.
   */
  clearLabel?: string;
}

/**
 * SearchField is the native search control: `<input type="search">`, with a
 * visible label and an optional clear affordance.
 *
 * The native `type` is fixed and removed from the prop base; only the matching
 * literal may be supplied. Native `name`/`form` submission, Enter-to-submit
 * inside a form, browser Escape clearing, value/change/ref semantics, and
 * `form.reset()` are kept. Uncontrolled use restores `defaultValue` on reset.
 *
 * Accessibility and validation expectations (implementation-owned):
 * - `label` is always associated through `htmlFor`; `hideLabel` removes it only
 *   visually, not from the accessibility tree.
 * - The clear control is a real button named by `clearLabel`. It appears only
 *   while the field has text and is neither disabled nor read-only, returns
 *   focus to the input after clearing, and routes the change through the same
 *   `input` event as typing, so `onChange` and `onValueChange` both fire.
 * - `hint`/`error` are wired through `aria-describedby`; `error` is announced
 *   (`role="alert"`) and sets `aria-invalid`.
 * - Native constraints such as `required`, `pattern`, `minLength`, and
 *   `maxLength` remain browser-owned. Controlled values are never rewritten by
 *   the component.
 */
export type SearchFieldProps = SearchFieldOwnProps &
  Omit<ComponentPropsWithoutRef<"input">, "type" | "value" | "defaultValue" | "size"> & {
    /** Fixed to `"search"`; accepted only for explicitness. */
    type?: "search";
  };
