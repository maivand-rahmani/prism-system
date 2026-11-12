"use client";

import * as React from "react";
import { cn, useIsomorphicLayoutEffect } from "@prism-system/ui-core";
import "./date-range-picker.css";

/** Ordered ISO calendar dates (`YYYY-MM-DD`); empty string represents an unset date. */
export type DateRangePickerValue = [start: string, end: string];

/**
 * Two native date inputs for selecting a date range. The browser owns date
 * parsing, display, keyboard behavior, and timezone-free ISO values. Each
 * endpoint has its own label and optional form name. A reversed range is kept
 * visible and reported through native validity; the component never silently
 * changes a date selected by the caller.
 */
export interface DateRangePickerProps extends Omit<
  React.ComponentPropsWithoutRef<"div">,
  "defaultValue" | "onChange" | "children"
> {
  /** Visible name for the date-range group. */
  label: React.ReactNode;
  /** Accessible label for the first date. Defaults to `"Start date"`. */
  startLabel?: React.ReactNode;
  /** Accessible label for the second date. Defaults to `"End date"`. */
  endLabel?: React.ReactNode;
  /** Form name for the first input. Omit it and the start date is not submitted. */
  startName?: string;
  /** Form name for the second input. Omit it and the end date is not submitted. */
  endName?: string;
  /** Controlled `[start, end]` ISO dates. Empty strings are valid unset values. */
  value?: DateRangePickerValue;
  /** Initial `[start, end]` ISO dates when uncontrolled; restored by form reset. */
  defaultValue?: DateRangePickerValue;
  /** Called with the unchanged selected pair after either input changes. */
  onValueChange?: (value: DateRangePickerValue) => void;
  /** Lowest date accepted by either endpoint, in native ISO form. */
  min?: string;
  /** Highest date accepted by either endpoint, in native ISO form. */
  max?: string;
  /** Marks the group invalid without adding error text. */
  invalid?: boolean;
  /** Error text under both inputs; takes precedence over `hint`. */
  error?: React.ReactNode;
  /** Helper text under both inputs. */
  hint?: React.ReactNode;
  /** Localized native validation message when the dates are reversed. */
  rangeErrorMessage?: string;
  /** Localized native validation message when a supplied date is malformed. */
  invalidDateMessage?: string;
  /** Makes both dates mandatory. */
  required?: boolean;
  /** Disables both dates (and therefore excludes them from form submission). */
  disabled?: boolean;
  /** Makes both dates read-only. */
  readOnly?: boolean;
  /** Associates both inputs with a form by its `id`. */
  form?: string;
}

function validISODate(value: string): boolean {
  // A browser date input reports an empty string for malformed values. This
  // check avoids timezone conversion and rejects invalid calendar dates.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (yearNumber === 0 || monthNumber < 1 || monthNumber > 12) return false;
  const leapYear = yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dayNumber >= 1 && dayNumber <= daysPerMonth[monthNumber - 1];
}

export const DateRangePicker = React.forwardRef<HTMLDivElement, DateRangePickerProps>(
  function DateRangePicker(
    {
      className,
      id: providedId,
      label,
      startLabel = "Start date",
      endLabel = "End date",
      startName,
      endName,
      value: valueProp,
      defaultValue,
      onValueChange,
      min,
      max,
      invalid = false,
      error,
      hint,
      rangeErrorMessage = "Start date must be on or before end date.",
      invalidDateMessage = "Enter a valid calendar date.",
      required = false,
      disabled = false,
      readOnly = false,
      form,
      "aria-describedby": externalDescribedBy,
      ...props
    },
    ref,
  ) {
    const generatedId = React.useId();
    const id = providedId || `maivand-plr-date-range-${generatedId.replace(/:/g, "")}`;
    const labelId = `${id}-label`;
    const startId = `${id}-start`;
    const endId = `${id}-end`;
    const hintId = `${id}-hint`;
    const errorId = `${id}-error`;

    const isControlled = valueProp !== undefined;
    const initialValue = defaultValue ?? ["", ""];
    const [uncontrolledValue, setUncontrolledValue] = React.useState<DateRangePickerValue>(() => [
      initialValue[0],
      initialValue[1],
    ]);
    const value = isControlled ? valueProp : uncontrolledValue;
    const startRef = React.useRef<HTMLInputElement>(null);
    const endRef = React.useRef<HTMLInputElement>(null);
    const current = React.useRef({ value, isControlled, initialValue, onValueChange });
    current.current = { value, isControlled, initialValue, onValueChange };

    const hasRangeError = Boolean(value[0] && value[1] && value[0] > value[1]);
    const hasInvalidValue = Boolean(
      (value[0] && !validISODate(value[0])) || (value[1] && !validISODate(value[1])),
    );
    const hasError = Boolean(error || invalid || hasRangeError || hasInvalidValue);
    const describedBy =
      [
        error || hasRangeError || hasInvalidValue ? errorId : hint ? hintId : null,
        externalDescribedBy,
      ]
        .filter(Boolean)
        .join(" ") || undefined;

    const syncValidity = React.useCallback(() => {
      const [start, end] = current.current.value;
      const reversed = Boolean(start && end && start > end);
      const malformed = Boolean((start && !validISODate(start)) || (end && !validISODate(end)));
      const message = reversed ? rangeErrorMessage : malformed ? invalidDateMessage : "";
      startRef.current?.setCustomValidity(message);
      endRef.current?.setCustomValidity(message);
    }, [invalidDateMessage, rangeErrorMessage]);
    const latestSyncValidity = React.useRef(syncValidity);
    latestSyncValidity.current = syncValidity;

    useIsomorphicLayoutEffect(() => {
      syncValidity();
    }, [syncValidity, value]);

    // A user-clicked reset runs the native reset algorithm synchronously, but a delegated
    // React `onReset` can still call `preventDefault()` after Chromium's microtask checkpoint.
    // Reconcile only in a later task, once every reset listener and the native default action
    // have run, so the final `defaultPrevented` verdict is observable. Each reset event keeps
    // its own task: a later cancelled reset must not discard an earlier accepted one.
    const pendingResetTasks = React.useRef(new Set<ReturnType<typeof setTimeout>>());
    const resetTaskMounted = React.useRef(true);
    React.useEffect(() => {
      resetTaskMounted.current = true;
      const tasks = pendingResetTasks.current;
      return () => {
        resetTaskMounted.current = false;
        for (const task of tasks) clearTimeout(task);
        tasks.clear();
      };
    }, []);

    React.useEffect(() => {
      const formElement = startRef.current?.form;
      if (!formElement) return;
      const reset = (event: Event) => {
        const task = setTimeout(() => {
          pendingResetTasks.current.delete(task);
          if (!resetTaskMounted.current || event.defaultPrevented) return;
          const state = current.current;
          if (!state.isControlled) {
            const restored: DateRangePickerValue = [state.initialValue[0], state.initialValue[1]];
            current.current.value = restored;
            setUncontrolledValue(restored);
            state.onValueChange?.(restored);
          }
          latestSyncValidity.current();
        }, 0);
        pendingResetTasks.current.add(task);
      };
      formElement.addEventListener("reset", reset);
      return () => formElement.removeEventListener("reset", reset);
      // Only a changed explicit form association needs a rebind; values and callbacks are
      // read through refs so consumer renders do not drop a pending reset subscription.
    }, [form]);

    const change = (index: 0 | 1, event: React.ChangeEvent<HTMLInputElement>) => {
      const next: DateRangePickerValue = [...current.current.value];
      next[index] = event.currentTarget.value;
      if (!isControlled) {
        current.current.value = next;
        setUncontrolledValue(next);
        syncValidity();
      }
      onValueChange?.(next);
    };

    return (
      <div
        {...props}
        ref={ref}
        id={id}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={hasError ? true : undefined}
        className={cn("maivand-plr-ui", "maivand-plr-field", "maivand-plr-date-range", className)}
      >
        <span className="maivand-plr-label" id={labelId}>
          {label}
        </span>
        <div className="maivand-plr-date-range-fields">
          <div className="maivand-plr-date-range-field">
            <label className="maivand-plr-date-range-label" htmlFor={startId}>
              {startLabel}
            </label>
            <input
              ref={startRef}
              id={startId}
              name={startName}
              form={form}
              type="date"
              className={cn(
                "maivand-plr-native-control",
                "maivand-plr-native-control-date",
                "maivand-plr-date-range-input",
                hasError && "maivand-plr-date-range-input-error",
              )}
              value={value[0]}
              min={min}
              max={max}
              required={required}
              disabled={disabled}
              readOnly={readOnly}
              aria-describedby={describedBy}
              aria-invalid={hasError ? true : undefined}
              onChange={(event) => change(0, event)}
            />
          </div>
          <div className="maivand-plr-date-range-field">
            <label className="maivand-plr-date-range-label" htmlFor={endId}>
              {endLabel}
            </label>
            <input
              ref={endRef}
              id={endId}
              name={endName}
              form={form}
              type="date"
              className={cn(
                "maivand-plr-native-control",
                "maivand-plr-native-control-date",
                "maivand-plr-date-range-input",
                hasError && "maivand-plr-date-range-input-error",
              )}
              value={value[1]}
              min={min}
              max={max}
              required={required}
              disabled={disabled}
              readOnly={readOnly}
              aria-describedby={describedBy}
              aria-invalid={hasError ? true : undefined}
              onChange={(event) => change(1, event)}
            />
          </div>
        </div>
        {error ? (
          <span className="maivand-plr-error" id={errorId} role="alert">
            {error}
          </span>
        ) : hasRangeError ? (
          <span className="maivand-plr-error" id={errorId} role="alert">
            {rangeErrorMessage}
          </span>
        ) : hasInvalidValue ? (
          <span className="maivand-plr-error" id={errorId} role="alert">
            {invalidDateMessage}
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
DateRangePicker.displayName = "DateRangePicker";
