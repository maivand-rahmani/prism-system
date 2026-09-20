import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { CheckedState } from "./checkbox.js";
import type { Align, AsChildProp, Direction, Side } from "../types/common.js";

export interface DropdownMenuOwnProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  dir?: Direction;
}

/**
 * DropdownMenu is a compound component. Implementations must attach the
 * sub-components below as static members of the root component, e.g.
 * `DropdownMenu.Item`.
 *
 * Accessibility expectations: the trigger exposes `aria-haspopup="menu"` and
 * `aria-expanded`; the content implements the menu keyboard model
 * (`ArrowUp`/`ArrowDown`/`Home`/`End`/`Escape`, typeahead, and `Enter`/`Space`
 * activation); `DropdownMenu.Sub` exposes `aria-haspopup` on its trigger; and
 * `CheckboxItem`/`RadioItem`/`RadioGroup` expose the corresponding
 * `menuitemcheckbox`/`menuitemradio` roles with `aria-checked`.
 */
export type DropdownMenuProps = DropdownMenuOwnProps & { children?: ReactNode };

export type DropdownMenuTriggerProps = ComponentPropsWithoutRef<"button"> & AsChildProp;

export interface DropdownMenuPortalProps {
  children?: ReactNode;
  container?: HTMLElement | null;
  forceMount?: boolean;
}

export type DropdownMenuContentProps = ComponentPropsWithoutRef<"div"> & {
  side?: Side;
  sideOffset?: number;
  align?: Align;
  alignOffset?: number;
  avoidCollisions?: boolean;
  collisionPadding?: number;
  sticky?: "partial" | "always";
  hideWhenDetached?: boolean;
  forceMount?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onFocusOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
};

export type DropdownMenuGroupProps = ComponentPropsWithoutRef<"div">;
export type DropdownMenuLabelProps = ComponentPropsWithoutRef<"div">;

export type DropdownMenuItemProps = ComponentPropsWithoutRef<"div"> & {
  disabled?: boolean;
  textValue?: string;
  onSelect?: (event: Event) => void;
};

export type DropdownMenuCheckboxItemProps = ComponentPropsWithoutRef<"div"> & {
  checked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
  disabled?: boolean;
  textValue?: string;
  onSelect?: (event: Event) => void;
};

export type DropdownMenuRadioGroupProps = ComponentPropsWithoutRef<"div"> & {
  value?: string;
  onValueChange?: (value: string) => void;
};

export type DropdownMenuRadioItemProps = ComponentPropsWithoutRef<"div"> & {
  value: string;
  disabled?: boolean;
  textValue?: string;
  onSelect?: (event: Event) => void;
};

export type DropdownMenuItemIndicatorProps = ComponentPropsWithoutRef<"span"> & {
  forceMount?: boolean;
};

export type DropdownMenuSeparatorProps = ComponentPropsWithoutRef<"div">;

export type DropdownMenuArrowProps = ComponentPropsWithoutRef<"svg"> & {
  width?: number;
  height?: number;
};

export interface DropdownMenuSubProps {
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export type DropdownMenuSubTriggerProps = ComponentPropsWithoutRef<"div"> &
  AsChildProp & {
    disabled?: boolean;
    textValue?: string;
  };

export type DropdownMenuSubContentProps = ComponentPropsWithoutRef<"div"> & {
  side?: Side;
  sideOffset?: number;
  align?: Align;
  alignOffset?: number;
  avoidCollisions?: boolean;
  collisionPadding?: number;
  forceMount?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onFocusOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
};
