import * as React from "react";
import {
  cn,
  type TableBodyProps,
  type TableCaptionProps,
  type TableCellProps,
  type TableFooterProps,
  type TableHeadProps,
  type TableHeaderProps,
  type TableProps,
  type TableRowProps,
} from "@prism-system/ui-core";

export type {
  TableProps,
  TableCaptionProps,
  TableHeaderProps,
  TableBodyProps,
  TableFooterProps,
  TableRowProps,
  TableHeadProps,
  TableCellProps,
};

const TableRoot = React.forwardRef<HTMLTableElement, TableProps>(function Table(
  { className, ...props },
  ref,
) {
  return (
    <table ref={ref} className={cn("maivand-plr-ui", "maivand-plr-table", className)} {...props} />
  );
});
TableRoot.displayName = "Table";

export const TableCaption = React.forwardRef<HTMLTableCaptionElement, TableCaptionProps>(
  function TableCaption({ className, ...props }, ref) {
    return <caption ref={ref} className={cn("maivand-plr-table-caption", className)} {...props} />;
  },
);
TableCaption.displayName = "TableCaption";

export const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  function TableHeader({ className, ...props }, ref) {
    return <thead ref={ref} className={cn("maivand-plr-table-header", className)} {...props} />;
  },
);
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(
  function TableBody({ className, ...props }, ref) {
    return <tbody ref={ref} className={cn("maivand-plr-table-body", className)} {...props} />;
  },
);
TableBody.displayName = "TableBody";

export const TableFooter = React.forwardRef<HTMLTableSectionElement, TableFooterProps>(
  function TableFooter({ className, ...props }, ref) {
    return <tfoot ref={ref} className={cn("maivand-plr-table-footer", className)} {...props} />;
  },
);
TableFooter.displayName = "TableFooter";

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow(
  { className, ...props },
  ref,
) {
  return <tr ref={ref} className={cn("maivand-plr-table-row", className)} {...props} />;
});
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { className, ...props },
  ref,
) {
  return <th ref={ref} className={cn("maivand-plr-table-head", className)} {...props} />;
});
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { className, ...props },
  ref,
) {
  return <td ref={ref} className={cn("maivand-plr-table-cell", className)} {...props} />;
});
TableCell.displayName = "TableCell";

export const Table = Object.assign(TableRoot, {
  Caption: TableCaption,
  Header: TableHeader,
  Body: TableBody,
  Footer: TableFooter,
  Row: TableRow,
  Head: TableHead,
  Cell: TableCell,
});
