import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { Align, AsChildProp, Side, Size } from "../types/common.js";

export interface SelectOwnProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  invalid?: boolean;
  placeholder?: ReactNode;
}

/**
 * Select is a compound component. Implementations must attach the sub-components
 * below as static members of the root component, e.g. `Select.Trigger`.
 *
 * Accessibility expectations: the trigger exposes `role="combobox"` with
 * `aria-expanded`/`aria-controls`, and the popup implements the listbox keyboard
 * model (`ArrowUp`/`ArrowDown`/`Home`/`End`/`Enter`/`Escape`).
 */
export type SelectProps = SelectOwnProps & { children?: ReactNode };

export type SelectSize = Size;

export type SelectTriggerProps = ComponentPropsWithoutRef<"button"> &
  AsChildProp & {
    size?: SelectSize;
    invalid?: boolean;
    placeholder?: ReactNode;
  };

export interface SelectValueProps {
  placeholder?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export type SelectContentProps = ComponentPropsWithoutRef<"div"> & {
  position?: "item-aligned" | "popper";
  side?: Side;
  sideOffset?: number;
  align?: Align;
  alignOffset?: number;
  forceMount?: boolean;
};

export type SelectGroupProps = ComponentPropsWithoutRef<"div">;
export type SelectLabelProps = ComponentPropsWithoutRef<"div">;

export type SelectItemProps = ComponentPropsWithoutRef<"div"> & {
  value: string;
  disabled?: boolean;
  /** Optional text used for typeahead and for rendering the trigger value. */
  textValue?: string;
};

export type SelectSeparatorProps = ComponentPropsWithoutRef<"div">;
