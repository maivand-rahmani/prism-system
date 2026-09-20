import type { ComponentPropsWithoutRef } from "react";
import type { Size } from "../types/common.js";

export interface SwitchOwnProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  value?: string;
  /** Marks the control as invalid and sets `aria-invalid`. */
  invalid?: boolean;
  /** Control size. Purely a size hint, not a visual token. */
  size?: Size;
}

/**
 * Switch renders an on/off control with `role="switch"` and `aria-checked`
 * (the model used by Radix/shadcn), so the DOM prop baseline is `<button>`.
 *
 * Accessibility expectations: toggling must be reachable by keyboard
 * (`Space`/`Enter`), expose `aria-checked`, and keep the accessible name stable.
 * `Switch.Thumb` is the movable visual indicator and carries no interaction.
 */
export type SwitchProps = SwitchOwnProps &
  Omit<
    ComponentPropsWithoutRef<"button">,
    "checked" | "defaultChecked" | "onChange" | "value" | "name" | "disabled" | "type"
  >;

export type SwitchThumbProps = ComponentPropsWithoutRef<"span">;
