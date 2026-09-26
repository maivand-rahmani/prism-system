"use client";

import * as React from "react";
import { cn, type SliderProps as CoreSliderProps } from "@prism-system/ui-core";

export type SliderProps = CoreSliderProps;

/** Native range control with platform keyboard and form behavior. */
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { className, invalid = false, type: _type, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="range"
      className={cn("maivand-b-ui", "maivand-b-slider", className)}
      aria-invalid={ariaInvalid ?? (invalid || undefined)}
      {...props}
    />
  );
});
Slider.displayName = "Slider";
