"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  columnVisibilityFeature,
  createColumnHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, type LucideIcon } from "lucide-react";
import type { Paginated, SortSpec } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/feedback/states";
import { ICON_STROKE } from "@/lib/constants";
import { number } from "@/lib/format";
import { cn } from "@/lib/utils";

export const tableFeatureSet = tableFeatures({ rowSortingFeature, columnVisibilityFeature, rowSelectionFeature, rowPaginationFeature });
export type Features = typeof tableFeatureSet;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Columns<T extends RowData> = ColumnDef<Features, T, any>[];

/** Typed column helper for a row type: `const col = columnsFor<Row>()`. */
export function columnsFor<T extends RowData>() {
  return createColumnHelper<Features, T>();
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TFeatures, TData, TValue> {
    /** Right-align numeric columns and use tabular figures. */
    numeric?: boolean;
    className?: string;
    headerClassName?: string;
    /** Hide below this breakpoint in table layout */
    hideBelow?: "md" | "lg" | "xl";
  }
}

const EMPTY: never[] = [];
const PAGE_SIZES = [10, 20, 50, 100];
const HIDE = { md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" } as const;

export interface DataTableProps<T extends RowData> {
  columns: Columns<T>;
  data?: Paginated<T>;
  loading?: boolean;
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  getRowId: (row: T) => string;
  sort?: SortSpec[];
  onSortChange?: (sort: SortSpec[]) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  empty?: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode };
  selectable?: boolean;
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode;
  /** Card layout used below md (tablet portrait and phones). */
  mobileCard?: (row: T) => React.ReactNode;
  rowTone?: (row: T) => string | undefined;
  label: string;
  className?: string;
}

export function DataTable<T extends RowData>({
  columns,
  data,
  loading,
  fetching,
  error,
  onRetry,
  getRowId,
  sort,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  rowHref,
  onRowClick,
  toolbar,
  empty,
  selectable,
  bulkActions,
  mobileCard,
  rowTone,
  label,
  className,
}: DataTableProps<T>) {
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const sorting: SortingState = useMemo(() => (sort ?? []).map((s) => ({ id: s.id, desc: s.desc })), [sort]);

  const allColumns = useMemo<Columns<T>>(() => {
    if (!selectable) return columns;
    const helper = columnsFor<T>();
    return [
      helper.display({
        id: "select",
        enableSorting: false,
        enableHiding: false,
        meta: { className: "w-10", headerClassName: "w-10" },
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all rows on this page"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} onClick={(e) => e.stopPropagation()} />
        ),
      }),
      ...columns,
    ];
  }, [columns, selectable]);

  const rows = data?.rows ?? (EMPTY as T[]);
  const table = useTable({
    features: tableFeatureSet,
    columns: allColumns,
    data: rows,
    getRowId: (r: T) => getRowId(r),
    manualSorting: true,
    manualPagination: true,
    rowCount: data?.total ?? 0,
    state: {
      sorting,
      rowSelection,
      pagination: { pageIndex: data?.page ?? 0, pageSize: data?.pageSize ?? 20 },
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortChange?.(next.map((s) => ({ id: s.id, desc: s.desc })));
    },
    onRowSelectionChange: (updater) => setRowSelection((prev) => (typeof updater === "function" ? updater(prev) : updater)),
  });

  const selectedRows = rows.filter((r) => rowSelection[getRowId(r)]);
  const total = data?.total ?? 0;
  const page = data?.page ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);

  const activate = (row: T) => {
    if (onRowClick) return onRowClick(row);
    const href = rowHref?.(row);
    if (href) router.push(href);
  };
  const interactive = Boolean(onRowClick || rowHref);

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide());

  return (
    <div className={cn("flex min-w-0 flex-col rounded-xl border bg-card", className)}>
      {(toolbar || hideable.length > 0) && (
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {hideable.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="hidden h-8 md:inline-flex" />}>
                <Columns3 strokeWidth={ICON_STROKE} /> Columns
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  {hideable.map((c) => (
                    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}>
                      {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {selectable && selectedRows.length > 0 && bulkActions && (
        <div className="flex items-center gap-3 border-b bg-info-soft/60 px-4 py-2 text-sm">
          <span className="font-medium">{selectedRows.length} selected</span>
          <div className="flex flex-wrap gap-2">{bulkActions(selectedRows, () => setRowSelection({}))}</div>
        </div>
      )}

      <div className={cn("relative min-w-0 transition-opacity", fetching && !loading && "opacity-70")} aria-busy={loading || fetching}>
        {loading ? (
          <TableSkeleton columns={Math.min(allColumns.length, 7)} />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : rows.length === 0 ? (
          <EmptyState icon={empty?.icon} title={empty?.title ?? "No results"} description={empty?.description ?? "Try changing the search or filters."} action={empty?.action} />
        ) : (
          <>
            {mobileCard && (
              <ul className="divide-y md:hidden" aria-label={label}>
                {rows.map((r) => (
                  <li key={getRowId(r)}>
                    {interactive ? (
                      <button type="button" onClick={() => activate(r)} className="block w-full px-4 py-3 text-left hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none">
                        {mobileCard(r)}
                      </button>
                    ) : (
                      <div className="px-4 py-3">{mobileCard(r)}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className={cn("overflow-x-auto scrollbar-thin", mobileCard && "hidden md:block")}>
              <table className="w-full caption-bottom border-collapse text-sm" aria-label={label}>
                <thead className="sticky top-0 bg-card">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b">
                      {hg.headers.map((h) => {
                        const meta = h.column.columnDef.meta;
                        const canSort = h.column.getCanSort();
                        const dir = h.column.getIsSorted();
                        return (
                          <th
                            key={h.id}
                            scope="col"
                            aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                            className={cn("h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4", meta?.numeric && "text-right", meta?.hideBelow && HIDE[meta.hideBelow], meta?.headerClassName)}
                          >
                            {h.isPlaceholder ? null : canSort ? (
                              <button
                                type="button"
                                onClick={h.column.getToggleSortingHandler()}
                                className={cn("-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-foreground", meta?.numeric && "flex-row-reverse")}
                              >
                                <table.FlexRender header={h} />
                                {dir === "asc" ? <ArrowUp className="size-3.5" /> : dir === "desc" ? <ArrowDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-40" />}
                              </button>
                            ) : (
                              <table.FlexRender header={h} />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y">
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={interactive ? () => activate(row.original) : undefined}
                      onKeyDown={
                        interactive
                          ? (e) => {
                              if (e.key === "Enter") activate(row.original);
                            }
                          : undefined
                      }
                      tabIndex={interactive ? 0 : undefined}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={cn(
                        "transition-colors data-[state=selected]:bg-info-soft/50",
                        interactive && "cursor-pointer hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:outline-none",
                        rowTone?.(row.original),
                      )}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        return (
                          <td key={cell.id} className={cn("h-11 px-3 align-middle first:pl-4 last:pr-4", meta?.numeric && "num text-right", meta?.hideBelow && HIDE[meta.hideBelow], meta?.className)}>
                            <table.FlexRender cell={cell} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {!error && (
        <div className="flex flex-col gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite">{loading ? "Loading…" : total ? `${number(from)}-${number(to)} of ${number(total)}` : "0 results"}</p>
          <div className="flex items-center gap-3">
            {onPageSizeChange && (
              <label className="hidden items-center gap-2 sm:flex">
                Rows
                <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="h-7 rounded-md border border-input bg-card px-1.5 text-xs text-foreground outline-none focus-visible:border-ring">
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="num">
              Page {page + 1} of {pageCount}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon-sm" disabled={page <= 0 || loading} onClick={() => onPageChange?.(page - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" disabled={page >= pageCount - 1 || loading} onClick={() => onPageChange?.(page + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
