"use client";

import * as React from "react";
import { cn, useComposedRefs } from "@prism-system/ui-core";
import "./search-field.css";

/**
 * Native search box: `<input type="search">` with a visible label, a decorative
 * search glyph, and a real clear button that appears once the field has text.
 *
 * Native behavior is kept: `name`/`form` submission, Enter-to-submit inside a
 * form, the browser's Escape clearing, and `form.reset()`. Uncontrolled use
 * restores `defaultValue` on reset. Clearing goes through the same `input`
 * event as typing, so `onChange` and `onValueChange` both fire.
 */
export interface SearchFieldProps extends Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "value" | "defaultValue" | "size"
> {
  /**
   * Visible label, always associated with the input. Required because the
   * input needs an accessible name even when the label is visually hidden.
   */
  label: React.ReactNode;
  /** Visually hides the label while keeping it for assistive technology. */
  hideLabel?: boolean;
  /** Helper text under the field. Replaced by `error` when both are set. */
  hint?: React.ReactNode;
  /** Error text under the field. Announced with `role="alert"` and sets `aria-invalid`. */
  error?: React.ReactNode;
  /** Marks the field invalid and sets `aria-invalid` without adding text. */
  invalid?: boolean;
  /** Controlled text. Omit to let the field own its text. */
  value?: string;
  /** Initial text when uncontrolled. Restored when the owning form resets. */
  defaultValue?: string;
  /** Called with the new text on every change, including clearing. */
  onValueChange?: (value: string) => void;
  /** Native React change handler. Fires for typing, browser Escape, and clearing. */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /**
   * Accessible name of the clear button. Defaults to English; pass a localized
   * string for other languages.
   */
  clearLabel?: string;
  /** Fixed to `"search"`; accepted only for explicitness. */
  type?: "search";
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchField(
    {
      className,
      id: providedId,
      label,
      hideLabel = false,
      hint,
      error,
      invalid = false,
      value: valueProp,
      defaultValue,
      onValueChange,
      onChange,
      clearLabel = "Clear search",
      disabled = false,
      readOnly = false,
      type: _type,
      "aria-describedby": externalDescribedBy,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) {
    const generatedId = React.useId();
    const id = providedId || `maivand-plr-search-field-${generatedId.replace(/:/g, "")}`;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;
    const inputRef = React.useRef<HTMLInputElement>(null);
    const composedRef = useComposedRefs(inputRef, ref);

    const isControlled = valueProp !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? "");
    const currentValue = isControlled ? valueProp : uncontrolledValue;
    const hasValue = currentValue.length > 0;
    const canClear = hasValue && !disabled && !readOnly;

    // Latest values for the native reset listener, which is attached once per mount.
    const latest = React.useRef({ isControlled, defaultValue, uncontrolledValue, onValueChange });
    latest.current = { isControlled, defaultValue, uncontrolledValue, onValueChange };

    React.useEffect(() => {
      const form = inputRef.current?.form;
      if (!form) return;
      const handleReset = (event: Event) => {
        queueMicrotask(() => {
          if (event.defaultPrevented) return;
          const state = latest.current;
          if (state.isControlled) return;
          const restored = state.defaultValue ?? "";
          if (restored === state.uncontrolledValue) return;
          setUncontrolledValue(restored);
          state.onValueChange?.(restored);
        });
      };
      form.addEventListener("reset", handleReset);
      return () => form.removeEventListener("reset", handleReset);
    }, []);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.currentTarget.value;
      if (!isControlled) setUncontrolledValue(next);
      onChange?.(event);
      onValueChange?.(next);
    };

    const handleClear = () => {
      const input = inputRef.current;
      if (!input) return;
      const previous = input.value;
      if (!previous) return;
      // Use React's ordinary change path: native input, controlled/uncontrolled
      // state, and both callbacks stay in sync without synthetic DOM events.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "");
      const event = new Event("input", { bubbles: true });
      input.dispatchEvent(event);
      input.focus();
    };

    const hasError = Boolean(error || invalid || ariaInvalid === true || ariaInvalid === "true");
    const describedBy =
      [error ? errorId : hint ? hintId : null, externalDescribedBy].filter(Boolean).join(" ") ||
      undefined;

    return (
      <div
        className="maivand-plr-ui maivand-plr-field maivand-plr-native-field maivand-plr-search-field"
        data-native-input-type="search"
      >
        <label
          className={cn("maivand-plr-label", hideLabel && "maivand-plr-search-field-label-hidden")}
          htmlFor={id}
        >
          {label}
        </label>
        <div className="maivand-plr-native-control-track">
          <div className="maivand-plr-search-field-shell">
            <span className="maivand-plr-search-field-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="m15.5 15.5 4.2 4.2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              enterKeyHint="search"
              {...props}
              ref={composedRef}
              id={id}
              type="search"
              className={cn(
                "maivand-plr-native-control",
                "maivand-plr-native-control-search",
                "maivand-plr-search-input",
                hasError && "maivand-plr-native-control-error",
                className,
              )}
              value={currentValue}
              onChange={handleChange}
              disabled={disabled}
              readOnly={readOnly}
              aria-describedby={describedBy}
              aria-invalid={hasError ? true : ariaInvalid}
            />
            {canClear && (
              <button
                type="button"
                className="maivand-plr-search-field-clear"
                aria-label={clearLabel}
                onClick={handleClear}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                  <path
                    d="m6.5 6.5 11 11m0-11-11 11"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
        {error ? (
          <span className="maivand-plr-error" id={errorId} role="alert">
            {error}
          </span>
        ) : hint ? (
          <span className="maivand-plr-hint" id={hintId}>
            {hint}
          </span>
        ) : null}
      </div>
    );
  },
);
SearchField.displayName = "SearchField";
