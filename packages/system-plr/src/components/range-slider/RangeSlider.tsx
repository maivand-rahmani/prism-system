"use client";

import * as React from "react";
import { cn } from "@prism-system/ui-core";
import "./range-slider.css";

/** An ordered `[start, end]` pair, on the step grid and within `min`–`max`. */
export type RangeSliderValue = [number, number];

export interface RangeSliderProps extends Omit<
  React.ComponentPropsWithoutRef<"div">,
  "defaultValue" | "onChange" | "children"
> {
  /**
   * Visible group name. Both thumbs are announced inside this group, so it is
   * required: a range without a name is not understandable.
   */
  label: React.ReactNode;
  /** Helper text under the control. Replaced by `error` when both are set. */
  hint?: React.ReactNode;
  /** Error text under the control. Announced with `role="alert"`; sets `aria-invalid` on both thumbs. */
  error?: React.ReactNode;
  /** Marks both thumbs invalid without adding text. */
  invalid?: boolean;
  /** Disables both thumbs. */
  disabled?: boolean;
  /** Lowest selectable value. Defaults to `0`. */
  min?: number;
  /** Highest selectable value. Defaults to `100`. */
  max?: number;
  /** Distance between selectable values. Defaults to `1`. */
  step?: number;
  /**
   * Controlled `[start, end]`. The thumbs always show an ordered, on-grid pair,
   * so out-of-order input is displayed normalized; the parent's value is never rewritten.
   */
  value?: RangeSliderValue;
  /** Initial `[start, end]` when uncontrolled. Defaults to the full range. Restored when the owning form resets. */
  defaultValue?: RangeSliderValue;
  /** Called with the new ordered pair after a user change. */
  onValueChange?: (value: RangeSliderValue) => void;
  /** Accessible name of the start thumb. Defaults to `"Start"`; pass a localized string. */
  startLabel?: string;
  /** Accessible name of the end thumb. Defaults to `"End"`; pass a localized string. */
  endLabel?: string;
  /** Form field name for the start value. Omit it and nothing is submitted for the start value. */
  startName?: string;
  /** Form field name for the end value. Omit it and nothing is submitted for the end value. */
  endName?: string;
  /** Associates both inputs with a form by its `id`. */
  form?: string;
}

interface RangeBounds {
  lo: number;
  hi: number;
  st: number;
}

function resolveBounds(min?: number, max?: number, step?: number): RangeBounds {
  const lo = typeof min === "number" && Number.isFinite(min) ? min : 0;
  const hiRaw = typeof max === "number" && Number.isFinite(max) ? max : 100;
  const hi = Math.max(lo, hiRaw);
  const st = typeof step === "number" && Number.isFinite(step) && step > 0 ? step : 1;
  return { lo, hi, st };
}

/** Snap to the same grid a native range input uses (anchored at `min`, never above `max`). */
function snapToStep(raw: number, { lo, hi, st }: RangeBounds): number {
  if (!Number.isFinite(raw)) return lo;
  const clamped = Math.min(hi, Math.max(lo, raw));
  let snapped = lo + Math.round((clamped - lo) / st) * st;
  if (snapped > hi) snapped = lo + Math.floor((hi - lo) / st) * st;
  return Number(snapped.toFixed(10));
}

function normalizePair(pair: readonly [number, number], bounds: RangeBounds): RangeSliderValue {
  const first = snapToStep(pair[0], bounds);
  const second = snapToStep(pair[1], bounds);
  return first <= second ? [first, second] : [second, first];
}

function defaultPair(defaultValue: RangeSliderValue | undefined, bounds: RangeBounds) {
  return normalizePair(defaultValue ?? [bounds.lo, bounds.hi], bounds);
}

export const RangeSlider = React.forwardRef<HTMLDivElement, RangeSliderProps>(function RangeSlider(
  {
    className,
    id: providedId,
    label,
    hint,
    error,
    invalid = false,
    disabled = false,
    min,
    max,
    step,
    value: valueProp,
    defaultValue,
    onValueChange,
    startLabel = "Start",
    endLabel = "End",
    startName,
    endName,
    form,
    style,
    "aria-describedby": externalDescribedBy,
    "aria-invalid": externalAriaInvalid,
    ...props
  },
  ref,
) {
  const generatedId = React.useId();
  const baseId = providedId || `maivand-plr-range-slider-${generatedId.replace(/:/g, "")}`;
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const startId = `${baseId}-start`;
  const endId = `${baseId}-end`;

  const bounds = resolveBounds(min, max, step);
  const { lo, hi, st } = bounds;
  const isControlled = valueProp !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState<RangeSliderValue>(() =>
    defaultPair(defaultValue, bounds),
  );
  // Re-normalize the default when bounds change, without mutating the prop or
  // waiting for another input event to keep the thumbs inside the native range.
  const rawPair = isControlled ? valueProp : uncontrolled;
  const [start, end] = normalizePair(rawPair, bounds);

  const startRef = React.useRef<HTMLInputElement>(null);

  // Latest values for the form reset listener, which is attached once per mount.
  const latest = React.useRef({ isControlled, defaultValue, bounds, start, end, onValueChange });
  latest.current = { isControlled, defaultValue, bounds, start, end, onValueChange };

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
    const handleReset = (event: Event) => {
      const task = setTimeout(() => {
        pendingResetTasks.current.delete(task);
        if (!resetTaskMounted.current || event.defaultPrevented) return;
        const state = latest.current;
        if (state.isControlled) return;
        const restored = defaultPair(state.defaultValue, state.bounds);
        if (restored[0] === state.start && restored[1] === state.end) return;
        setUncontrolled(restored);
        state.onValueChange?.(restored);
      }, 0);
      pendingResetTasks.current.add(task);
    };
    formElement.addEventListener("reset", handleReset);
    return () => formElement.removeEventListener("reset", handleReset);
    // Only a changed explicit form association needs a rebind; values and callbacks are
    // read through refs so consumer renders do not drop a pending reset subscription.
  }, [form]);

  const commit = (next: RangeSliderValue) => {
    if (!isControlled) setUncontrolled(next);
    if (next[0] !== start || next[1] !== end) onValueChange?.(next);
  };

  const handleStart = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Both thumbs share one native domain, so pointer positions stay aligned;
    // clamp the logical start boundary here to keep the pair ordered.
    const next = Math.min(snapToStep(event.currentTarget.valueAsNumber, bounds), end);
    commit([next, end]);
  };

  const handleEnd = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Math.max(snapToStep(event.currentTarget.valueAsNumber, bounds), start);
    commit([start, next]);
  };

  const span = hi - lo;
  const toPercent = (v: number) => (span > 0 ? ((v - lo) / span) * 100 : 0);
  const rootStyle = {
    ...style,
    "--maivand-plr-range-start": `${toPercent(start)}%`,
    "--maivand-plr-range-end": `${toPercent(end)}%`,
  } as React.CSSProperties;

  // When both thumbs sit at the top of the range they overlap; the start thumb
  // must then be the one on top, or it could never move back down the track.
  const startOnTop = span > 0 && start === end && start >= hi - st;

  const hasError = Boolean(
    error || invalid || externalAriaInvalid === true || externalAriaInvalid === "true",
  );
  const describedBy =
    [error ? errorId : hint ? hintId : null, externalDescribedBy].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div
      {...props}
      ref={ref}
      id={baseId}
      role="group"
      aria-labelledby={labelId}
      aria-invalid={hasError ? true : externalAriaInvalid}
      className={cn("maivand-plr-ui", "maivand-plr-field", "maivand-plr-range-slider", className)}
      data-disabled={disabled ? "" : undefined}
      data-start-on-top={startOnTop ? "" : undefined}
      style={rootStyle}
    >
      <span className="maivand-plr-label" id={labelId}>
        {label}
      </span>
      <div className="maivand-plr-range-slider-control">
        <span className="maivand-plr-range-slider-track" aria-hidden="true">
          <span className="maivand-plr-range-slider-fill" />
        </span>
        <input
          ref={startRef}
          id={startId}
          name={startName}
          form={form}
          type="range"
          className={cn(
            "maivand-plr-range-slider-input",
            "maivand-plr-range-slider-input-start",
            hasError && "maivand-plr-range-slider-input-error",
          )}
          min={lo}
          max={hi}
          step={st}
          value={start}
          onChange={handleStart}
          disabled={disabled}
          aria-label={startLabel}
          aria-valuemin={lo}
          aria-valuemax={end}
          aria-describedby={describedBy}
          aria-invalid={hasError ? true : undefined}
        />
        <input
          id={endId}
          name={endName}
          form={form}
          type="range"
          className={cn(
            "maivand-plr-range-slider-input",
            "maivand-plr-range-slider-input-end",
            hasError && "maivand-plr-range-slider-input-error",
          )}
          min={lo}
          max={hi}
          step={st}
          value={end}
          onChange={handleEnd}
          disabled={disabled}
          aria-label={endLabel}
          aria-valuemin={start}
          aria-valuemax={hi}
          aria-describedby={describedBy}
          aria-invalid={hasError ? true : undefined}
        />
      </div>
      <output
        className="maivand-plr-range-slider-values"
        htmlFor={`${startId} ${endId}`}
        aria-live="off"
      >
        {`${start} – ${end}`}
      </output>
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
});
RangeSlider.displayName = "RangeSlider";
