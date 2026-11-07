import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSearchParams } from "react-router";
import { cn } from "../lib/utils";

// The table real product screens use: 12px muted sentence-case headers, row rules (no zebra),
// numbers right-aligned in tabular figures, one status mark and at most one action per row.
// Sortable headers are buttons and look sortable; aria-sort says which way. The scroll container is
// a labelled, focusable region so keyboard users can scroll a wide table.
//
// Underneath: TanStack Table for the row model and sorting, TanStack Virtual once a table passes
// `virtualizeFrom` rows (only the visible rows are in the DOM; the header sticks). The column API
// stays small on purpose (key, header, cell, numeric, sort), so a screen reads as a list of
// decisions about columns, not as table plumbing. `sortParam` keeps the sort in the URL
// (?sort=when.desc) so a sorted view can be linked and survives a reload.

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Right-aligns and sets tabular figures. Use for every quantity. */
  numeric?: boolean;
  sort?: (a: T, b: T) => number;
  /** Cells that may hold long text get truncated rather than stretching the table. */
  truncate?: boolean;
  className?: string;
};

export type Sort = { key: string; dir: "ascending" | "descending" };

export type DataTableProps<T> = {
  /** Names the table for screen readers and labels the scroll region. */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSort?: Sort;
  /** Keep the sort in this URL search parameter. Needs a React Router context. */
  sortParam?: string;
  /** Row count from which only the visible rows render. Default 100. */
  virtualizeFrom?: number;
  /** Height of the scroll region once virtualised, in px. Default 480. */
  maxHeight?: number;
  className?: string;
};

type SortState = [Sort | undefined, (next: Sort) => void];

function useLocalSort(initial?: Sort): SortState {
  const [sort, setSort] = React.useState(initial);
  return [sort, setSort];
}

/** Reads a sort from its URL form (`pieces.desc`). */
export function parseSort(value: string | null): Sort | undefined {
  if (!value) return undefined;
  const [key, dir] = value.split(".");
  if (!key) return undefined;
  return { key, dir: dir === "desc" ? "descending" : "ascending" };
}

/** Writes a sort in its URL form (`pieces.desc`). */
export function serialiseSort(sort: Sort) {
  return `${sort.key}.${sort.dir === "descending" ? "desc" : "asc"}`;
}

function useUrlSort(param: string, initial?: Sort): SortState {
  const [params, setParams] = useSearchParams();
  const sort = parseSort(params.get(param)) ?? initial;
  const set = React.useCallback(
    (next: Sort) =>
      setParams(
        (p) => {
          const out = new URLSearchParams(p);
          out.set(param, serialiseSort(next));
          return out;
        },
        { replace: true },
      ),
    [param, setParams],
  );
  return [sort, set];
}

/** A table on TanStack Table: muted headers, row rules, right-aligned tabular numbers, sortable headers with `aria-sort`, virtualised from `virtualizeFrom` rows, sort optionally kept in the URL (`sortParam`). */
export function DataTable<T>(props: DataTableProps<T>) {
  // Two thin wrappers so each calls its hooks unconditionally.
  return props.sortParam ? <UrlSortedTable {...props} sortParam={props.sortParam} /> : <LocalSortedTable {...props} />;
}

function LocalSortedTable<T>(props: DataTableProps<T>) {
  return <Table {...props} sortState={useLocalSort(props.initialSort)} />;
}

function UrlSortedTable<T>(props: DataTableProps<T> & { sortParam: string }) {
  return <Table {...props} sortState={useUrlSort(props.sortParam, props.initialSort)} />;
}

type Meta = { numeric?: boolean; truncate?: boolean; className?: string };

function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  sortState: [sort, setSort],
  virtualizeFrom = 100,
  maxHeight = 480,
  className,
}: DataTableProps<T> & { sortState: SortState }) {
  const defs = React.useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        // TanStack only sorts columns with an accessor; the row itself is enough, since the
        // column's own comparator does the work.
        accessorFn: (row) => row,
        header: c.header,
        cell: (info) => c.cell(info.row.original),
        enableSorting: Boolean(c.sort),
        sortingFn: c.sort ? (a, b) => c.sort!(a.original, b.original) : undefined,
        meta: { numeric: c.numeric, truncate: c.truncate, className: c.className } satisfies Meta,
      })),
    [columns],
  );

  const sorting: SortingState = sort && columns.some((c) => c.key === sort.key && c.sort)
    ? [{ id: sort.key, desc: sort.dir === "descending" }]
    : [];

  const table = useReactTable({
    data: rows,
    columns: defs,
    state: { sorting },
    getRowId: (row) => rowKey(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // No pagination or expansion here, so nothing to reset. Left on, TanStack resets the page
    // index whenever `rows` is a new array; a screen that filters its rows on every render (the
    // kiln room after Withdraw) then re-renders forever and the tab freezes. Found by the
    // example app's visual suite, which jsdom did not show.
    autoResetAll: false,
  });

  const toggle = (key: string) =>
    setSort({ key, dir: sort?.key === key && sort.dir === "ascending" ? "descending" : "ascending" });

  const modelRows = table.getRowModel().rows;
  const virtual = modelRows.length >= virtualizeFrom;
  const scroller = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: virtual ? modelRows.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => 41,
    overscan: 8,
    // Until the region is measured, assume it is full height: the first paint (and a test DOM
    // with no layout) shows the first page of rows instead of none.
    initialRect: { width: 0, height: maxHeight },
  });
  const items = virtual ? virtualizer.getVirtualItems() : [];
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const visible = virtual ? items.map((i) => modelRows[i.index]) : modelRows;

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn("min-w-0 overflow-x-auto", virtual && "overflow-y-auto", className)}
      style={virtual ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse type-body-sm" aria-rowcount={virtual ? modelRows.length + 1 : undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead className={cn(virtual && "sticky top-0 z-10 bg-background")}>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta as Meta | undefined;
                const active = sort?.key === header.id && header.column.getCanSort() ? sort.dir : undefined;
                const Icon = active === "ascending" ? ArrowUp : active === "descending" ? ArrowDown : ArrowUpDown;
                const label = flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={active}
                    className={cn(
                      "py-2 pr-4 text-left align-bottom type-caption text-muted-foreground last:pr-0",
                      meta?.numeric && "text-right",
                    )}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={() => toggle(header.id)}
                        className={cn(
                          "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-control px-1 transition-state hover:text-foreground",
                          meta?.numeric && "flex-row-reverse",
                          active && "text-foreground",
                        )}
                      >
                        {label}
                        <Icon aria-hidden className={cn("size-3.5", !active && "opacity-50")} />
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {padTop > 0 && <tr aria-hidden style={{ height: padTop }} />}
          {visible.map((row, i) => (
            <tr
              key={row.id}
              className="border-t border-border"
              aria-rowindex={virtual ? (items[i]?.index ?? 0) + 2 : undefined}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as Meta | undefined;
                return (
                  <td
                    key={cell.id}
                    className={cn(
                      "py-2.5 pr-4 align-middle last:pr-0",
                      meta?.numeric && "text-right tabular-nums",
                      meta?.truncate && "max-w-48 truncate",
                      meta?.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
          {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }} />}
        </tbody>
      </table>
    </div>
  );
}

/** The loading placeholder for a `DataTable`, shaped like its rows. */
export function TableSkeleton({ rows = 4, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden className="grid gap-0">
      <div className="flex gap-4 py-2">
        {Array.from({ length: columns }, (_, i) => (
          <div key={i} className="h-3 flex-1 rounded-control bg-muted" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-t border-border py-3.5">
          {Array.from({ length: columns }, (_, i) => (
            <div key={i} className="h-4 flex-1 rounded-control bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
