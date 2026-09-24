import type { ComponentPropsWithoutRef } from "react";

/**
 * Avatar is a compound component: `Avatar.Image`, `Avatar.Fallback`.
 *
 * The root renders a native `<span>`. `Avatar.Image` uses native `img` props
 * and therefore always carries a required `alt`; `Avatar.Fallback` is the
 * initials/placeholder shown while the image is unavailable. Sizing and shape
 * belong to the design system.
 */
export type AvatarProps = ComponentPropsWithoutRef<"span">;

/**
 * `Avatar.Image` always carries a text alternative: `alt` is required.
 *
 * Native `img` props allow `alt` to be omitted, which is an accessibility
 * hazard, so the contract removes the optional `alt` and re-adds it as a
 * required `string`.
 */
export type AvatarImageProps = Omit<ComponentPropsWithoutRef<"img">, "alt"> & {
  alt: string;
};

export type AvatarFallbackProps = ComponentPropsWithoutRef<"span">;
