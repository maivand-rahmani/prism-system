import type { ComponentPropsWithoutRef } from "react";

/**
 * DescriptionList is a grouped term/description structure. Sub-components are
 * attached as static members: `DescriptionList.Item`, `DescriptionList.Term`,
 * `DescriptionList.Description`.
 *
 * The root renders a native `<dl>`, each item a `div` grouping a `dt` term and
 * one or more `dd` descriptions. The `div` group inside `dl` is valid HTML and
 * keeps every term next to its descriptions in the accessibility tree. No
 * column, divider, or spacing props exist; those are visual decisions owned by
 * the design system.
 */
export type DescriptionListProps = ComponentPropsWithoutRef<"dl">;
export type DescriptionListItemProps = ComponentPropsWithoutRef<"div">;
export type DescriptionListTermProps = ComponentPropsWithoutRef<"dt">;
export type DescriptionListDescriptionProps = ComponentPropsWithoutRef<"dd">;
