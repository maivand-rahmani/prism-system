import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { Size } from "../types/common.js";

export type InputSize = Size;

export interface InputOwnProps {
  size?: InputSize;
  /** Marks the field as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
}

/**
 * Note: the native `size` attribute (a number) is intentionally omitted so the
 * contract's `size` refers to the control size only.
 */
export type InputProps = InputOwnProps & Omit<ComponentPropsWithoutRef<"input">, "size">;
