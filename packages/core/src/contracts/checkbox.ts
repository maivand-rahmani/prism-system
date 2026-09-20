import type { ComponentPropsWithoutRef } from "react";
import type { Size } from "../types/common.js";

/** Tri-state checked value used by Checkbox and similar controls. */
export type CheckedState = boolean | "indeterminate";

export type CheckboxSize = Size;

export interface CheckboxOwnProps {
  checked?: CheckedState;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: CheckedState) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  /** Marks the control as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  size?: CheckboxSize;
}

/**
 * Checkbox renders a button-like control with `role="checkbox"` (the same model
 * used by Radix/shadcn primitives), so the DOM prop baseline is `<button>`.
 */
export type CheckboxProps = CheckboxOwnProps &
  Omit<
    ComponentPropsWithoutRef<"button">,
    "checked" | "defaultChecked" | "onChange" | "value" | "name" | "disabled" | "type"
  >;
