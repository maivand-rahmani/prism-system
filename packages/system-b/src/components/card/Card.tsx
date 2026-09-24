"use client";

import * as React from "react";
import {
  Card as CardPrimitive,
  CardContent as CardContentPrimitive,
  CardDescription as CardDescriptionPrimitive,
  CardFooter as CardFooterPrimitive,
  CardHeader as CardHeaderPrimitive,
  CardTitle as CardTitlePrimitive,
  cn,
  type CardContentProps as CoreCardContentProps,
  type CardDescriptionProps as CoreCardDescriptionProps,
  type CardFooterProps as CoreCardFooterProps,
  type CardHeaderProps as CoreCardHeaderProps,
  type CardProps as CoreCardProps,
  type CardTitleProps as CoreCardTitleProps,
} from "@prism-system/ui-core";

export type CardProps = CoreCardProps;
export type CardHeaderProps = CoreCardHeaderProps;
export type CardTitleProps = CoreCardTitleProps;
export type CardDescriptionProps = CoreCardDescriptionProps;
export type CardContentProps = CoreCardContentProps;
export type CardFooterProps = CoreCardFooterProps;

const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "default", padding = "md", asChild = false, ...props },
  ref,
) {
  return (
    <CardPrimitive
      ref={ref}
      variant={variant}
      padding={padding}
      asChild={asChild}
      className={cn(
        "maivand-b-ui maivand-b-card",
        `maivand-b-card-${variant}`,
        `maivand-b-card-padding-${padding}`,
        className,
      )}
      {...props}
    />
  );
});
CardRoot.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader(
  { className, ...props },
  ref,
) {
  return (
    <CardHeaderPrimitive ref={ref} className={cn("maivand-b-card-header", className)} {...props} />
  );
});

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  function CardContent({ className, ...props }, ref) {
    return (
      <CardContentPrimitive
        ref={ref}
        className={cn("maivand-b-card-content", className)}
        {...props}
      />
    );
  },
);

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter(
  { className, ...props },
  ref,
) {
  return (
    <CardFooterPrimitive ref={ref} className={cn("maivand-b-card-footer", className)} {...props} />
  );
});

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <CardTitlePrimitive ref={ref} className={cn("maivand-b-card-title", className)} {...props} />
    );
  },
);

export const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <CardDescriptionPrimitive
        ref={ref}
        className={cn("maivand-b-card-description", className)}
        {...props}
      />
    );
  },
);

CardHeader.displayName = "CardHeader";
CardContent.displayName = "CardContent";
CardFooter.displayName = "CardFooter";
CardTitle.displayName = "CardTitle";
CardDescription.displayName = "CardDescription";

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
});
