"use client";

import * as React from "react";
import {
  Combobox as ComboboxPrimitive,
  cn,
  type ComboboxContentProps as CoreComboboxContentProps,
  type ComboboxInputProps as CoreComboboxInputProps,
  type ComboboxItemProps as CoreComboboxItemProps,
  type ComboboxProps as CoreComboboxProps,
} from "@prism-system/ui-core";

const ComboboxInput = React.forwardRef<HTMLInputElement, CoreComboboxInputProps>(
  function ComboboxInput({ className, ...props }, ref) {
    const Input = ComboboxPrimitive.Input;
    return (
      <Input
        ref={ref}
        className={cn("maivand-b-ui", "maivand-b-combobox-input", className)}
        {...props}
      />
    );
  },
);
ComboboxInput.displayName = "Combobox.Input";

const ComboboxContent = React.forwardRef<HTMLDivElement, CoreComboboxContentProps>(
  function ComboboxContent({ className, ...props }, ref) {
    const Content = ComboboxPrimitive.Content;
    return (
      <Content
        ref={ref}
        className={cn("maivand-b-ui", "maivand-b-combobox-content", className)}
        {...props}
      />
    );
  },
);
ComboboxContent.displayName = "Combobox.Content";

const ComboboxItem = React.forwardRef<HTMLDivElement, CoreComboboxItemProps>(function ComboboxItem(
  { className, ...props },
  ref,
) {
  const Item = ComboboxPrimitive.Item;
  return (
    <Item
      ref={ref}
      className={cn("maivand-b-ui", "maivand-b-combobox-item", className)}
      {...props}
    />
  );
});
ComboboxItem.displayName = "Combobox.Item";

const ComboboxRoot = React.forwardRef<HTMLDivElement, CoreComboboxProps>(function Combobox(
  { className, ...props },
  ref,
) {
  return (
    <ComboboxPrimitive
      ref={ref}
      className={cn("maivand-b-ui", "maivand-b-combobox", className)}
      {...props}
    />
  );
});
ComboboxRoot.displayName = "Combobox";

/** Styled access to the shared core combobox; all selection and keyboard behavior stays there. */
export const Combobox = Object.assign(ComboboxRoot, {
  Input: ComboboxInput,
  Content: ComboboxContent,
  Item: ComboboxItem,
});

export type ComboboxProps = CoreComboboxProps;
export type ComboboxInputProps = CoreComboboxInputProps;
export type ComboboxContentProps = CoreComboboxContentProps;
export type ComboboxItemProps = CoreComboboxItemProps;
