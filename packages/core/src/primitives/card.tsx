"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../utils/cn.js";

/**
 * Structural base props for the shadcn-style Card root.
 *
 * `variant` and `padding` are forwarded as `data-*` attributes only; core does
 * not define any surface, border, radius, or shadow values. The full
 * `CardProps` contract is satisfied by a design system wrapper that adds
 * classes and assembles the compound `Card.Header`/`Card.Title`/... members.
 */
export interface CardBaseProps extends React.ComponentPropsWithoutRef<"div"> {
  variant?: "default" | "muted" | "outline" | "elevated" | "interactive";
  padding?: "none" | "sm" | "md" | "lg";
  /** Renders the single child element instead of a native `<div>`. */
  asChild?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardBaseProps>(function Card(
  { className, variant = "default", padding = "md", asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      ref={ref}
      data-slot="card"
      data-variant={variant}
      data-padding={padding}
      className={cn(className)}
      {...props}
    />
  );
});
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} data-slot="card-header" className={cn(className)} {...props} />;
  },
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<"h3">>(
  function CardTitle({ className, ...props }, ref) {
    return <h3 ref={ref} data-slot="card-title" className={cn(className)} {...props} />;
  },
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<"p">
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} data-slot="card-description" className={cn(className)} {...props} />;
});
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} data-slot="card-content" className={cn(className)} {...props} />;
  },
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  function CardFooter({ className, ...props }, ref) {
    return <div ref={ref} data-slot="card-footer" className={cn(className)} {...props} />;
  },
);
CardFooter.displayName = "CardFooter";
