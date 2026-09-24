import type { ComponentPropsWithoutRef } from "react";

/**
 * Table is a semantic data table with no data model: sorting, filtering, and
 * pagination belong to the product.
 *
 * Compound parts map to native elements: `Table.Caption` (`caption`),
 * `Table.Header` (`thead`), `Table.Body` (`tbody`), `Table.Footer` (`tfoot`),
 * `Table.Row` (`tr`), `Table.Head` (`th`), `Table.Cell` (`td`).
 *
 * Accessibility contract: implementations must render the native table markup
 * so header cells keep their association with data cells. A table must have an
 * accessible name, either through `Table.Caption` or via `aria-label` /
 * `aria-labelledby` on the root; column and row headers should declare `scope`.
 */
export type TableProps = ComponentPropsWithoutRef<"table">;
export type TableCaptionProps = ComponentPropsWithoutRef<"caption">;
export type TableHeaderProps = ComponentPropsWithoutRef<"thead">;
export type TableBodyProps = ComponentPropsWithoutRef<"tbody">;
export type TableFooterProps = ComponentPropsWithoutRef<"tfoot">;
export type TableRowProps = ComponentPropsWithoutRef<"tr">;
export type TableHeadProps = ComponentPropsWithoutRef<"th">;
export type TableCellProps = ComponentPropsWithoutRef<"td">;
