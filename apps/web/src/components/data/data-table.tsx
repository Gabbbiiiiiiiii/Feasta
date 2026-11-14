"use client";

import {ArrowDown, ArrowUp, ArrowUpDown} from "lucide-react";
import type {ReactNode} from "react";

import {ApplicationEmptyState, ApplicationErrorState, TableLoadingSkeleton, type ApplicationEmptyKind, type ApplicationErrorKind} from "@/components/feedback/application-states";
import {EmptyState} from "@/components/feedback/states";
import {LoadingSkeleton} from "@/components/feedback/loading";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

export type SortDirection = "ascending" | "descending";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  headerClassName?: string;
  cellClassName?: string;
};

export type DataTableSort = {
  columnId: string;
  direction: SortDirection;
};

export type DataTableProps<T> = {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  caption: string;
  loading?: boolean;
  updating?: boolean;
  error?: string;
  errorKind?: ApplicationErrorKind;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyKind?: ApplicationEmptyKind;
  rowActions?: (row: T) => ReactNode;
  rowActionsLabel?: string;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  renderMobileRow?: (row: T) => ReactNode;
  className?: string;
};

function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  loading = false,
  updating = false,
  error,
  errorKind = "load",
  onRetry,
  emptyTitle = "No results",
  emptyDescription = "No records match the current query.",
  emptyKind,
  rowActions,
  rowActionsLabel = "Actions",
  sort,
  onSortChange,
  renderMobileRow,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return <TableLoadingSkeleton caption={caption} className={className} />;
  }
  if (error) {
    return (
      <div className={cn("rounded-card border border-border bg-card", className)}>
        <ApplicationErrorState kind={errorKind} description={error} onRetry={onRetry} />
      </div>
    );
  }
  if (rows.length === 0 && !updating) {
    if (emptyKind && emptyTitle === "No results" && emptyDescription === "No records match the current query.") {
      return <div className={cn("rounded-card border border-border bg-card", className)}><ApplicationEmptyState kind={emptyKind} /></div>;
    }
    return (
      <div className={cn("rounded-card border border-border bg-card", className)}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  const toggleSort = (column: DataTableColumn<T>) => {
    if (!column.sortable || !onSortChange) return;
    onSortChange({
      columnId: column.id,
      direction:
        sort?.columnId === column.id && sort.direction === "ascending"
          ? "descending"
          : "ascending",
    });
  };

  return (
    <div className={cn("min-w-0", className)}>
      <span role="status" className="sr-only">{updating ? "Loading results..." : ""}</span>
      {renderMobileRow ? (
        <div className="grid gap-3 md:hidden" aria-busy={updating} aria-label={`${caption}, mobile view`}>
          {updating ? Array.from({length: 4}, (_, index) => (
            <div key={index} aria-hidden="true" className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
              <div className="flex justify-between gap-3">
                <div className="grid flex-1 gap-2"><LoadingSkeleton className="h-5 w-2/3" /><LoadingSkeleton className="h-4 w-1/2" /></div>
                <LoadingSkeleton className="h-6 w-20" />
              </div>
              <div className="grid grid-cols-2 gap-3"><LoadingSkeleton className="h-8 w-3/4" /><LoadingSkeleton className="h-8 w-5/6" /></div>
              <LoadingSkeleton className="h-8 w-full" />
            </div>
          )) : null}
          {!updating && rows.map((row) => (
            <div key={getRowId(row)}>{renderMobileRow(row)}</div>
          ))}
        </div>
      ) : null}
      <div className={cn("max-w-full overflow-x-auto overscroll-x-contain rounded-card border border-border bg-card shadow-card", renderMobileRow && "hidden md:block")}> 
        <table aria-busy={updating} className="w-full min-w-[42rem] border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-muted bg-secondary text-foreground">
            <tr>
              {columns.map((column) => {
                const activeSort = sort?.columnId === column.id ? sort.direction : undefined;
                const SortIcon = activeSort === "ascending"
                  ? ArrowUp
                  : activeSort === "descending"
                    ? ArrowDown
                    : ArrowUpDown;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={column.sortable ? activeSort ?? "none" : undefined}
                    className={cn("px-4 py-3 text-sm font-bold", column.headerClassName)}
                  >
                    {column.sortable ? (
                      <Button
                        variant="ghost"
                        size="compact"
                        className="-ml-3"
                        onClick={() => toggleSort(column)}
                        disabled={!onSortChange}
                        aria-label={`Sort by ${column.header}`}
                      >
                        {column.header}
                        <SortIcon aria-hidden="true" className="size-4" />
                      </Button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {rowActions ? <th scope="col" className="px-4 py-3 text-right text-sm font-bold">{rowActionsLabel}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-muted">
            {updating ? Array.from({length: 4}, (_, rowIndex) => (
              <tr key={rowIndex} aria-hidden="true">
                {columns.map((column, columnIndex) => (
                  <td key={column.id} className={cn("h-20 px-4 py-4 align-top", column.cellClassName)}>
                    <LoadingSkeleton className={cn("h-4 max-w-full", ["w-3/4", "w-2/3", "w-1/2"][(rowIndex + columnIndex) % 3])} />
                    {columnIndex === 0 || columnIndex === columns.length - 1 ? <LoadingSkeleton className="mt-2 h-4 w-5/6" /> : null}
                  </td>
                ))}
                {rowActions ? <td className="px-4 py-4 align-top"><LoadingSkeleton className="ml-auto h-8 w-20" /></td> : null}
              </tr>
            )) : null}
            {!updating && rows.map((row) => (
              <tr key={getRowId(row)} className="hover:bg-table-hover focus-within:bg-accent">
                {columns.map((column) => (
                  <td key={column.id} className={cn("max-w-md px-4 py-4 align-top text-sm", column.cellClassName)}>
                    {column.cell(row)}
                  </td>
                ))}
                {rowActions ? <td className="px-4 py-3 text-right align-top">{rowActions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export {DataTable};
