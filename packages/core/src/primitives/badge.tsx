"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../utils/cn.js";
import { cva, type VariantProps } from "../utils/cva.js";

/**
 * Unstyled shadcn-style base recipe for the V1 `Badge` contract.
 *
 * Every class slot is empty on purpose. The recipe preserves the variant/size
 * API shape while a design system owns all color, radius, and typography. The
 * emitted `data-variant`/`data-size` attributes give systems a stable styling
 * hook.
 */
export const badgeVariants = cva("", {
  variants: {
    variant: {
      default: "",
      secondary: "",
      success: "",
      warning: "",
      danger: "",
      info: "",
      outline: "",
    },
    size: {
      sm: "",
      md: "",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

/**
 * Structural base props for the shadcn-style Badge.
 *
 * The V1 `BadgeProps` `dot` affordance is a visual decision owned by the design
 * system wrapper, so it is not part of the core base.
 */
export interface BadgeBaseProps
  extends React.ComponentPropsWithoutRef<"span">, VariantProps<typeof badgeVariants> {
  /** Renders the single child element instead of a native `<span>`. */
  asChild?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeBaseProps>(function Badge(
  { className, variant = "default", size = "md", asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      ref={ref}
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
});
Badge.displayName = "Badge";
