"use client";

import * as React from "react";
import { cn, type IconComponent, type IconProps } from "@prism-system/ui-core";
import type { LucideIcon } from "lucide-react";

const ui = "maivand-plr-ui";

interface IconGlyphProps extends IconProps {
  /** The Lucide glyph this Prism icon currently draws. */
  icon: LucideIcon;
}

/**
 * Shared Prism icon behavior for Plan Like Rahmani.
 *
 * The glyph is a package implementation detail. Color always inherits
 * `currentColor`; the system's own ink and theme therefore reach the icon
 * without a color prop. A consumer can replace any single glyph later without
 * changing the public `*Icon` export or its props.
 *
 * Accessibility is safe by default: without a name the SVG is decorative and
 * hidden from assistive technology. `label` (or an explicit `aria-label` /
 * `aria-labelledby`) makes the icon meaningful. An icon-only button should own
 * the accessible name itself and keep its icon decorative.
 */
export const IconGlyph = React.forwardRef<SVGSVGElement, IconGlyphProps>(function IconGlyph(
  { icon: Glyph, size = "1em", label, decorative, className, ...props },
  ref,
) {
  const hasLabel = typeof label === "string" && label.trim().length > 0;
  const hasAriaLabel = props["aria-label"] !== undefined;
  const hasAriaLabelledBy = props["aria-labelledby"] !== undefined;
  const isDecorative = decorative === true || (!hasLabel && !hasAriaLabel && !hasAriaLabelledBy);

  return (
    <Glyph
      ref={ref}
      size={size}
      strokeWidth={1.75}
      className={cn(ui, "maivand-plr-icon", className)}
      focusable="false"
      {...(isDecorative
        ? { "aria-hidden": true }
        : {
            role: "img",
            ...(hasLabel ? { "aria-label": label } : {}),
          })}
      {...props}
    />
  );
});
IconGlyph.displayName = "IconGlyph";

/** Create one public Prism icon component with a stable display name. */
export function createIcon(displayName: string, Glyph: LucideIcon): IconComponent {
  const Icon = React.forwardRef<SVGSVGElement, IconProps>(function Icon(props, ref) {
    return <IconGlyph ref={ref} icon={Glyph} {...props} />;
  });
  Icon.displayName = displayName;
  return Icon;
}
