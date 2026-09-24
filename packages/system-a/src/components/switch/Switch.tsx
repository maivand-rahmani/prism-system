"use client";

import * as React from "react";
import {
  Switch as SwitchPrimitive,
  SwitchThumb as SwitchThumbPrimitive,
  cn,
  type SwitchProps as CoreSwitchProps,
  type SwitchThumbProps as CoreSwitchThumbProps,
} from "@prism-system/ui-core";

export type SwitchProps = CoreSwitchProps;
export type SwitchThumbProps = CoreSwitchThumbProps;
const SwitchRoot = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, size = "md", invalid = false, children, ...props },
  ref,
) {
  const hasThumb = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && child.type === SwitchThumb,
  );
  return (
    <SwitchPrimitive
      ref={ref}
      size={size}
      invalid={invalid}
      className={cn("maivand-a-ui maivand-a-switch", `maivand-a-switch-${size}`, className)}
      {...props}
    >
      {children}
      {!hasThumb && <SwitchThumb />}
    </SwitchPrimitive>
  );
});
export const SwitchThumb = React.forwardRef<HTMLSpanElement, SwitchThumbProps>(function SwitchThumb(
  { className, ...props },
  ref,
) {
  return (
    <SwitchThumbPrimitive
      ref={ref}
      className={cn("maivand-a-switch-thumb", className)}
      {...props}
    />
  );
});
export const Switch = Object.assign(SwitchRoot, { Thumb: SwitchThumb });
