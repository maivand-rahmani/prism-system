"use client";

import * as React from "react";
import type { SliderProps as CoreSliderProps } from "@prism-system/ui-core";
import {
  NativeInputField,
  type NativeInputFieldProps,
} from "../native-input-field/NativeInputField";

export type SliderProps = CoreSliderProps & Pick<NativeInputFieldProps, "label" | "hint" | "error">;

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { type: _type, ...props },
  ref,
) {
  return (
    <NativeInputField ref={ref} inputType="range" inputClassName="maivand-a-slider" {...props} />
  );
});
Slider.displayName = "Slider";
