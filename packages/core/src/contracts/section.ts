import type { ComponentPropsWithoutRef } from "react";

/**
 * Section is a landmark-capable page region. Sub-components are attached as
 * static members: `Section.Header`, `Section.Title`, `Section.Description`,
 * `Section.Content`, `Section.Footer`.
 *
 * The root renders a native `<section>`; parts use semantic native elements so
 * heading and text structure stays meaningful before any styling is applied.
 */
export type SectionProps = ComponentPropsWithoutRef<"section">;
export type SectionHeaderProps = ComponentPropsWithoutRef<"div">;
export type SectionTitleProps = ComponentPropsWithoutRef<"h2">;
export type SectionDescriptionProps = ComponentPropsWithoutRef<"p">;
export type SectionContentProps = ComponentPropsWithoutRef<"div">;
export type SectionFooterProps = ComponentPropsWithoutRef<"div">;
