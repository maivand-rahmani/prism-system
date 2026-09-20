import type { ComponentPropsWithoutRef } from "react";
import type { AsChildProp } from "../types/common.js";

export type CardVariant = "default" | "muted" | "outline" | "elevated" | "interactive";

export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardOwnProps extends AsChildProp {
  variant?: CardVariant;
  padding?: CardPadding;
}

/**
 * Card is a compound component. Implementations must attach the sub-components
 * below as static members of the root component, e.g. `Card.Header`.
 */
export type CardProps = CardOwnProps & ComponentPropsWithoutRef<"div">;
export type CardHeaderProps = ComponentPropsWithoutRef<"div">;
export type CardTitleProps = ComponentPropsWithoutRef<"h3">;
export type CardDescriptionProps = ComponentPropsWithoutRef<"p">;
export type CardContentProps = ComponentPropsWithoutRef<"div">;
export type CardFooterProps = ComponentPropsWithoutRef<"div">;
