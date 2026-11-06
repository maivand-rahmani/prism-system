/**
 * The shared, optional Prism icon catalog.
 *
 * Icons are deliberately **not** part of the component contract. They are one
 * neutral vocabulary of fifty semantic names that any design system may ship in
 * whole, in part, or not at all. A system's generated `design-system.json`
 * manifest declares the names it really provides; a name absent from that
 * declaration is unavailable, and core must never imply otherwise.
 *
 * Core owns only the vocabulary, its types, and the public prop shape. It owns
 * no SVG path data, no Lucide dependency, no colors, no stroke width, no
 * motion, and no runtime that renders an icon. Each design system owns its
 * visual implementation and exports one component per declared name from its
 * own `./icons` entrypoint using the stable `${Name}Icon` export convention.
 *
 * @packageDocumentation
 */

import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";

/* -------------------------------------------------------------------------- */
/* Canonical vocabulary                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The five canonical semantic groups, in presentation order.
 *
 * Category membership is documentation and tooling metadata only. It is never
 * an availability list: availability is the presence of a name in a system's
 * generated manifest icon declaration.
 */
export const ICON_CATEGORIES = {
  navigation: [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "ChevronLeft",
    "ChevronRight",
    "ChevronUp",
    "ChevronDown",
    "Menu",
    "Home",
  ],
  actions: [
    "Plus",
    "Minus",
    "Close",
    "Check",
    "Search",
    "Filter",
    "Settings",
    "Edit",
    "Trash",
    "Copy",
  ],
  files: [
    "Download",
    "Upload",
    "Share",
    "Link",
    "ExternalLink",
    "File",
    "Folder",
    "Image",
    "Calendar",
    "Clock",
  ],
  feedback: [
    "Info",
    "Help",
    "Warning",
    "Error",
    "Success",
    "Loading",
    "Eye",
    "EyeOff",
    "Lock",
    "Unlock",
  ],
  interface: [
    "User",
    "Users",
    "Mail",
    "Bell",
    "Heart",
    "Star",
    "MoreHorizontal",
    "MoreVertical",
    "Refresh",
    "LogOut",
  ],
} as const satisfies Record<string, readonly string[]>;

/** A canonical icon group key. */
export type IconCategory = keyof typeof ICON_CATEGORIES;

/**
 * All fifty canonical Prism icon names, in canonical order.
 *
 * Prism names are semantic and stable. They are intentionally not Lucide export
 * names: a system may implement `Close` with Lucide `X`, replace it with a
 * custom drawing later, and the public Prism name never changes.
 */
export const ICON_NAMES = [
  ...ICON_CATEGORIES.navigation,
  ...ICON_CATEGORIES.actions,
  ...ICON_CATEGORIES.files,
  ...ICON_CATEGORIES.feedback,
  ...ICON_CATEGORIES.interface,
] as const;

/** A canonical Prism icon name, e.g. `"Search"`. */
export type IconName = (typeof ICON_NAMES)[number];

/** The one stable suffix every public icon component export uses. */
export const ICON_EXPORT_SUFFIX = "Icon" as const;

/** A public icon export name, e.g. `"SearchIcon"`. */
export type IconExportName = `${IconName}${typeof ICON_EXPORT_SUFFIX}`;

/** The public export name for a canonical icon name. */
export function iconExportName(name: IconName): IconExportName {
  return `${name}${ICON_EXPORT_SUFFIX}`;
}

const ICON_NAME_SET: ReadonlySet<string> = new Set<string>(ICON_NAMES);

/**
 * Runtime guard for a canonical icon name.
 *
 * Useful in consumer adapters and validation helpers; it only checks the shared
 * vocabulary, never whether a particular system ships the icon.
 */
export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && ICON_NAME_SET.has(value);
}

/** Every icon name belonging to one canonical group, in canonical order. */
export function iconNamesInCategory(category: IconCategory): readonly IconName[] {
  return ICON_CATEGORIES[category];
}

/* -------------------------------------------------------------------------- */
/* Public prop and component shape                                            */
/* -------------------------------------------------------------------------- */

/**
 * Props shared by every Prism icon component.
 *
 * Icons are SVGs that inherit `currentColor` by default, so `color` must never
 * be required at the call site. The design system owns the default stroke
 * width, line caps, fill, optical size, and any optional motion; the shared API
 * only standardizes the cross-system behavior below.
 *
 * - `size` sets both width and height. A design system chooses its default
 *   (Prism's convention is `1em` so an icon follows its text or control), and
 *   explicit numeric or CSS-length values remain possible.
 * - `className`, `style`, and every standard SVG attribute pass through.
 * - `ref` is part of the published component type because implementations use
 *   `forwardRef`, which works with every supported React version.
 * - Decorative icons are the safe default: without an accessible name the
 *   rendered SVG is hidden from assistive technology and cannot receive focus.
 *   Pass `label` (or `aria-label`/`aria-labelledby`) only when the icon itself
 *   conveys meaning. An icon-only button should instead own its accessible name
 *   and keep its icon decorative.
 * - `decorative: true` forces the safe hidden treatment even if a label is
 *   present, which is useful for purely ornamental repeats.
 */
export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Square rendered size; a system default such as `"1em"` is applied. */
  size?: number | string;
  /** Accessible name for a meaningful icon. Omit for decorative icons. */
  label?: string;
  /** Force decorative treatment (hidden from assistive technology). */
  decorative?: boolean;
}

/**
 * The stable public type of every icon component a design system exports.
 *
 * Implementations must accept {@link IconProps} and forward an SVG `ref`. The
 * concrete visual implementation (Lucide, a local SVG, or a future custom
 * drawing) is not part of this type, so it can be replaced without changing a
 * consumer import.
 */
export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

/** Whether a name is one of the shared canonical icon names. */
export function isCanonicalIconExportName(value: unknown): value is IconExportName {
  if (typeof value !== "string" || !value.endsWith(ICON_EXPORT_SUFFIX)) return false;
  return isIconName(value.slice(0, -ICON_EXPORT_SUFFIX.length));
}

/** The canonical icon name behind a public export name, or `null`. */
export function iconNameFromExportName(value: unknown): IconName | null {
  return isCanonicalIconExportName(value)
    ? (value.slice(0, -ICON_EXPORT_SUFFIX.length) as IconName)
    : null;
}
