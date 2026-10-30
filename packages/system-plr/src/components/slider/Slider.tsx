"use client";

import * as React from "react";
import type { SliderProps as CoreSliderProps } from "@prism-system/ui-core";
import {
  NativeInputField,
  type NativeInputFieldProps,
} from "../native-input-field/NativeInputField";

export type SliderProps = CoreSliderProps & Pick<NativeInputFieldProps, "label" | "hint" | "error">;

function resolveSliderValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { type: _type, label, hint, error, min, max, value, defaultValue, onChange, style, ...props },
  ref,
) {
  const [liveValue, setLiveValue] = React.useState<number | null>(null);
  const parsedMinimum = Number(min ?? 0);
  const parsedMaximum = Number(max ?? 100);
  const minimum = Number.isFinite(parsedMinimum) ? parsedMinimum : 0;
  const maximum = Number.isFinite(parsedMaximum) ? parsedMaximum : 100;
  const currentValue =
    resolveSliderValue(value) ??
    liveValue ??
    resolveSliderValue(defaultValue) ??
    (minimum + maximum) / 2;
  const progress =
    maximum > minimum
      ? `${Math.max(0, Math.min(100, ((currentValue - minimum) / (maximum - minimum)) * 100))}%`
      : "0%";
  const progressStyle = {
    ...style,
    "--maivand-plr-slider-progress": progress,
  } as React.CSSProperties;
  const handleChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      if (value === undefined) setLiveValue(event.currentTarget.valueAsNumber);
      onChange?.(event);
    },
    [onChange, value],
  );

  return (
    <NativeInputField
      ref={ref}
      inputType="range"
      inputClassName="maivand-plr-slider"
      label={label}
      hint={hint}
      error={error}
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      style={progressStyle}
      {...props}
    />
  );
});
Slider.displayName = "Slider";
