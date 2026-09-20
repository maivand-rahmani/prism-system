import type { ComponentPropsWithoutRef } from "react";
import type { Direction, Orientation } from "../types/common.js";

export interface RadioGroupOwnProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  form?: string;
  required?: boolean;
  disabled?: boolean;
  dir?: Direction;
  orientation?: Orientation;
  /** When `true`, arrow keys wrap from the last item to the first and back. */
  loop?: boolean;
}

/**
 * RadioGroup is a compound component. Implementations must attach `Item` and
 * `Indicator` as static members of the root component, e.g. `RadioGroup.Item`.
 *
 * Accessibility expectations: the root renders `role="radiogroup"`, each
 * `RadioGroup.Item` renders `role="radio"` with `aria-checked`, arrow-key
 * navigation moves the selection inside the group, and `RadioGroup.Indicator`
 * is only present in the accessibility tree when the owning item is checked.
 */
export type RadioGroupProps = RadioGroupOwnProps & ComponentPropsWithoutRef<"div">;

export type RadioGroupItemProps = ComponentPropsWithoutRef<"button"> & {
  value: string;
  disabled?: boolean;
  required?: boolean;
};

export type RadioGroupIndicatorProps = ComponentPropsWithoutRef<"span"> & {
  /** Keep the indicator mounted even when its item is unchecked. */
  forceMount?: boolean;
};
