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
import { Checkbox } from "./checkbox";
import { Chevron } from "./disclosure";

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
//
// Selection is opt-in (`selection`), because checkboxes belong only where a bulk action exists
// (one of 23 real product screens had them; a checkbox on every row is a generated-UI tell). When
// it is on, the first column is a checkbox per row, named from the row (`rowLabel` is required),
// disabled where `isSelectable` says no; the header's "Select all shown" covers the selectable rows
// in `rows` (all of them, not only the rendered ones of a virtualised table) and is mixed when some
// are chosen. Selected rows take the sunken fill, not a ring, so a selection never reads as focus.
// The table only draws the selection; the state is the caller's, usually `useSelection`, and the
// actions live in a `BulkBar`.
//
// Expansion is opt-in too (`expansion`): a row opens a detail row under it, for what belongs to
// the row but would crowd the table (a firing's pieces, a batch's faces). It follows `Disclosure`:
// the toggle is a button with `aria-expanded`, named for what it shows (`rowLabel`, "Pieces in
// firing 412"), and the detail is mounted only while open, so a `useLoad` inside it runs on the
// first open and not for every row on load. The detail row spans the data columns, starts under
// the first of them, and has no rule between it and its row, so the two read as one. State is the
// caller's, usually `useExpanded` (which can keep it in the URL). A virtualised table measures
// each detail row, so details of any height scroll correctly.

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Right-aligns and sets tabular figures. Use for every quantity. */
  numeric?: boolean;
  sort?: (a: T, b: T) => number;
  /** Cells that may hold long text get truncated rather than stretching the table. */
  truncate?: boolean;
  /** Keep the header for screen readers only, as for a column of row actions. `header` still names it. */
  hideHeader?: boolean;
  className?: string;
};

/** Row selection for a `DataTable`: the chosen row keys, how to change them, and how to name each row's checkbox. */
export type RowSelection<T> = {
  /** Keys (from `rowKey`) of the chosen rows. */
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Names the row in its checkbox ("Select <rowLabel>"). Required: an unnamed checkbox is a column of "checkbox, not checked". */
  rowLabel: (row: T) => string;
  /** Rows that cannot be chosen get a disabled checkbox and are left out of select-all. Default: every row. */
  isSelectable?: (row: T) => boolean;
};

/** Row expansion for a `DataTable`: the open row keys, how to change them, how to name each toggle, and the detail to show. */
export type RowExpansion<T> = {
  /** Keys (from `rowKey`) of the open rows. */
  expanded: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Names the row's toggle by what it shows: "Pieces in firing 412". Its state is `aria-expanded`, so the name stays the same open or closed. */
  rowLabel: (row: T) => string;
  /** The row's detail, mounted only while it is open. Return an element whose component makes any request, so the request runs on open. */
  detail: (row: T) => React.ReactNode;
  /** Rows with nothing to show get no toggle. Default: every row. */
  isExpandable?: (row: T) => boolean;
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
  /** Adds a checkbox column and "Select all shown". Use only where a `BulkBar` acts on the selection. */
  selection?: RowSelection<T>;
  /** Adds a toggle per row that opens a detail row under it. Spread `useExpanded()` in with a `rowLabel` and `detail`. */
  expansion?: RowExpansion<T>;
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

type Meta = { numeric?: boolean; truncate?: boolean; hideHeader?: boolean; className?: string };

function useSelectAll<T>(rows: T[], rowKey: (row: T) => string, selection?: RowSelection<T>) {
  return React.useMemo(() => {
    if (!selection) return undefined;
    const keys = rows.filter((r) => selection.isSelectable?.(r) ?? true).map(rowKey);
    const chosen = keys.filter((k) => selection.selected.has(k)).length;
    const checked: boolean | "mixed" = chosen === 0 ? false : chosen === keys.length ? true : "mixed";
    const toggle = () => {
      const next = new Set(selection.selected);
      // A full or mixed box clears what is shown; an empty one selects every selectable row shown.
      // Keys outside `rows` (filtered away) are left as they are.
      if (checked === false) keys.forEach((k) => next.add(k));
      else keys.forEach((k) => next.delete(k));
      selection.onChange(next);
    };
    return { checked, toggle, disabled: keys.length === 0 };
  }, [rows, rowKey, selection]);
}

function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  sortState: [sort, setSort],
  virtualizeFrom = 100,
  maxHeight = 480,
  selection,
  expansion,
  className,
}: DataTableProps<T> & { sortState: SortState }) {
  const baseId = React.useId();
  const selectAll = useSelectAll(rows, rowKey, selection);
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
        meta: { numeric: c.numeric, truncate: c.truncate, hideHeader: c.hideHeader, className: c.className } satisfies Meta,
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
    // No pagination here, and expansion is the caller's state, not TanStack's: nothing to reset. Left on, TanStack resets the page
    // index whenever `rows` is a new array; a screen that filters its rows on every render (the
    // kiln room after Withdraw) then re-renders forever and the tab freezes. Found by the
    // example app's visual suite, which jsdom did not show.
    autoResetAll: false,
  });

  const toggle = (key: string) =>
    setSort({ key, dir: sort?.key === key && sort.dir === "ascending" ? "descending" : "ascending" });

  const modelRows = table.getRowModel().rows;
  const canExpand = (row: T) => expansion?.isExpandable?.(row) ?? true;
  // What the body draws, in order: every row, and a detail line after each open one. The
  // virtualiser counts these lines, so an open detail takes its own measured slot.
  const lines = React.useMemo(
    () =>
      expansion
        ? modelRows.flatMap((row) =>
            expansion.expanded.has(row.id) && canExpand(row.original)
              ? [{ row, detail: false }, { row, detail: true }]
              : [{ row, detail: false }],
          )
        : modelRows.map((row) => ({ row, detail: false })),
    // canExpand reads `expansion`, which is a dependency.
    [modelRows, expansion],
  );
  const virtual = modelRows.length >= virtualizeFrom;
  const scroller = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: virtual ? lines.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (lines[i]?.detail ? 160 : 41),
    // Keyed by row and line kind, not by position: opening or closing a detail shifts every line
    // after it, and a measured detail height must stay with its detail, not pass to the row that
    // takes its index (rows are not measured, so a wrong height would never be corrected).
    getItemKey: (i) => (lines[i] ? `${lines[i].row.id}${lines[i].detail ? "\u0000detail" : ""}` : i),
    overscan: 8,
    // Until the region is measured, assume it is full height: the first paint (and a test DOM
    // with no layout) shows the first page of rows instead of none.
    initialRect: { width: 0, height: maxHeight },
  });
  const items = virtual ? virtualizer.getVirtualItems() : [];
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const visible = virtual ? items.map((i) => ({ ...lines[i.index], index: i.index })) : lines.map((l, index) => ({ ...l, index }));
  const lead = (selection ? 1 : 0) + (expansion ? 1 : 0);

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn("relative min-w-0 overflow-x-auto", virtual && "overflow-y-auto", className)}
      style={virtual ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse type-body-sm" aria-rowcount={virtual ? lines.length + 1 : undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead className={cn(virtual && "sticky top-0 z-10 bg-background")}>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {selectAll && (
                <th scope="col" className="w-8 py-2 pr-2 text-left align-bottom">
                  <Checkbox
                    className="-my-1"
                    label="Select all shown"
                    hideLabel
                    checked={selectAll.checked}
                    disabled={selectAll.disabled}
                    onCheckedChange={selectAll.toggle}
                  />
                </th>
              )}
              {expansion && (
                <th scope="col" className="w-10 py-2 pr-2">
                  <span className="sr-only">Details</span>
                </th>
              )}
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta as Meta | undefined;
                const active = sort?.key === header.id && header.column.getCanSort() ? sort.dir : undefined;
                const Icon = active === "ascending" ? ArrowUp : active === "descending" ? ArrowDown : ArrowUpDown;
                const rendered = flexRender(header.column.columnDef.header, header.getContext());
                const label = meta?.hideHeader ? <span className="sr-only">{rendered}</span> : rendered;
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
          {visible.map(({ row, detail, index }) => {
            const chosen = selection?.selected.has(row.id) ?? false;
            const detailId = `${baseId}-detail-${row.id}`;
            if (detail && expansion)
              return (
                <tr
                  key={`${row.id}-detail`}
                  ref={virtual ? virtualizer.measureElement : undefined}
                  data-index={index}
                  className={cn(chosen && "bg-surface-sunken")}
                  aria-rowindex={virtual ? index + 2 : undefined}
                >
                  {lead > 0 && <td colSpan={lead} />}
                  <td id={detailId} colSpan={columns.length} className="pt-0.5 pb-4 align-top">
                    {expansion.detail(row.original)}
                  </td>
                </tr>
              );
            const open = expansion?.expanded.has(row.id) ?? false;
            return (
            <tr
              key={row.id}
              className={cn("border-t border-border", chosen && "bg-surface-sunken")}
              aria-rowindex={virtual ? index + 2 : undefined}
            >
              {selection && (
                <td className="w-8 py-2.5 pr-2 align-middle">
                  <Checkbox
                    className="-my-0.5"
                    label={`Select ${selection.rowLabel(row.original)}`}
                    hideLabel
                    checked={chosen}
                    disabled={!(selection.isSelectable?.(row.original) ?? true)}
                    onCheckedChange={(on) => {
                      const next = new Set(selection.selected);
                      if (on) next.add(row.id);
                      else next.delete(row.id);
                      selection.onChange(next);
                    }}
                  />
                </td>
              )}
              {expansion && (
                <td className="w-10 py-2.5 pr-2 align-middle">
                  {canExpand(row.original) && (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={open ? detailId : undefined}
                      aria-label={expansion.rowLabel(row.original)}
                      title={expansion.rowLabel(row.original)}
                      onClick={() => {
                        const next = new Set(expansion.expanded);
                        if (open) next.delete(row.id);
                        else next.add(row.id);
                        expansion.onChange(next);
                      }}
                      className="-my-1.5 grid size-(--control-h-sm) cursor-pointer place-items-center rounded-control hover:bg-muted"
                    >
                      <Chevron open={open} />
                    </button>
                  )}
                </td>
              )}
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
            );
          })}
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
