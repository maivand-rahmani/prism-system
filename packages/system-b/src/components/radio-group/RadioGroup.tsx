"use client";

import * as React from "react";
import {
  RadioGroup as RadioGroupPrimitive,
  RadioGroupIndicator as RadioGroupIndicatorPrimitive,
  RadioGroupItem as RadioGroupItemPrimitive,
  cn,
  type RadioGroupIndicatorProps as CoreRadioGroupIndicatorProps,
  type RadioGroupItemProps as CoreRadioGroupItemProps,
  type RadioGroupProps as CoreRadioGroupProps,
} from "@prism-system/ui-core";

export type RadioGroupProps = CoreRadioGroupProps;
export type RadioGroupItemProps = CoreRadioGroupItemProps;
export type RadioGroupIndicatorProps = CoreRadioGroupIndicatorProps;

function RadioGroupRoot({ className, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive
      className={cn("maivand-b-ui maivand-b-radio-group", className)}
      {...props}
    />
  );
}

export const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  function RadioGroupItem({ className, children, ...props }, ref) {
    const childArray = React.Children.toArray(children);
    const indicators = childArray.filter(
      (child) => React.isValidElement(child) && child.type === RadioGroupIndicator,
    );
    const content = childArray.filter(
      (child) => !(React.isValidElement(child) && child.type === RadioGroupIndicator),
    );
    return (
      <RadioGroupItemPrimitive
        ref={ref}
        className={cn("maivand-b-radio-item", className)}
        {...props}
      >
        {indicators.length > 0 ? indicators : <RadioGroupIndicator />}
        <span className="maivand-b-radio-copy">{content}</span>
      </RadioGroupItemPrimitive>
    );
  },
);

export const RadioGroupIndicator = React.forwardRef<HTMLSpanElement, RadioGroupIndicatorProps>(
  function RadioGroupIndicator({ className, forceMount, ...props }, ref) {
    return (
      <RadioGroupIndicatorPrimitive
        ref={ref}
        className={cn("maivand-b-radio-indicator", className)}
        {...props}
        {...(forceMount ? { forceMount: true } : {})}
      />
    );
  },
);

export const RadioGroup = Object.assign(RadioGroupRoot, {
  Item: RadioGroupItem,
  Indicator: RadioGroupIndicator,
});
