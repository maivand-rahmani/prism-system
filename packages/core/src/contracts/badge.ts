import type { ComponentPropsWithoutRef } from "react";
import type { AsChildProp } from "../types/common.js";

export type BadgeVariant =
  "default" | "secondary" | "success" | "warning" | "danger" | "info" | "outline";

export type BadgeSize = "sm" | "md";

export interface BadgeOwnProps extends AsChildProp {
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Renders a leading status dot. */
  dot?: boolean;
}

export type BadgeProps = BadgeOwnProps & ComponentPropsWithoutRef<"span">;
