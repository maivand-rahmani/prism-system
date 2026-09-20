"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../utils/cn.js";
import { cva, type VariantProps } from "../utils/cva.js";

/**
 * Unstyled shadcn-style base recipe for the V1 `Button` contract.
 *
 * The base and every variant/size slot are intentionally empty: core never owns
 * colors, typography, spacing, radius, borders, shadows, or motion. A design
 * system supplies the class values and may target the emitted
 * `data-variant`/`data-size` attributes from its own stylesheet.
 */
export const buttonVariants = cva("", {
  variants: {
    variant: {
      primary: "",
      secondary: "",
      outline: "",
      ghost: "",
      destructive: "",
      link: "",
    },
    size: {
      sm: "",
      md: "",
      lg: "",
      icon: "",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

/**
 * Structural base props for the shadcn-style Button.
 *
 * This is deliberately narrower than the full V1 `ButtonProps` contract: the
 * visual concerns (`loading`, `leftIcon`, `rightIcon`, `fullWidth`) belong to a
 * design system wrapper, which can compose this base and add its own classes.
 */
export interface ButtonBaseProps
  extends React.ComponentPropsWithoutRef<"button">, VariantProps<typeof buttonVariants> {
  /** Renders the single child element instead of a native `<button>`. */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonBaseProps>(function Button(
  { className, variant = "primary", size = "md", asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
Button.displayName = "Button";
