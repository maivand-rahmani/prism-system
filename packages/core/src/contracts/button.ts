import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { AsChildProp } from "../types/common.js";

/**
 * Button variants.
 *
 * `primary` is the main call to action, `destructive` marks irreversible
 * actions, and `link` renders as inline text-styled action.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonOwnProps extends AsChildProp {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Renders a busy state. Implementations must keep the accessible name stable
   * and expose `aria-busy` while loading.
   */
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export type ButtonProps = ButtonOwnProps & ComponentPropsWithoutRef<"button">;
