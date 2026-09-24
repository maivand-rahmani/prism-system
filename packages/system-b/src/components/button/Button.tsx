"use client";

import * as React from "react";
import { Button as ButtonPrimitive, cn, type ButtonProps as CoreButtonProps } from "@prism-system/ui-core";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends CoreButtonProps {
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    loadingText,
    fullWidth = false,
    leftIcon,
    rightIcon,
    asChild = false,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const content = asChild ? (
    loading && loadingText ? (
      loadingText
    ) : (
      children
    )
  ) : (
    <>
      {loading && <span className="maivand-b-spinner" aria-hidden="true" />}
      {!loading && leftIcon}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && rightIcon}
    </>
  );
  return (
    <ButtonPrimitive
      ref={ref}
      asChild={asChild}
      variant={variant}
      size={size}
      className={cn(
        "maivand-b-ui maivand-b-button",
        `maivand-b-button-${variant}`,
        `maivand-b-button-${size}`,
        fullWidth && "maivand-b-button-full",
        className,
      )}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {content}
    </ButtonPrimitive>
  );
});
Button.displayName = "Button";
