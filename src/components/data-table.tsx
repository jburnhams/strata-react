import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Button as AriaButton,
  Cell as AriaCell,
  Column as AriaColumn,
  Row as AriaRow,
  Table as AriaTable,
  TableBody,
  TableHeader,
  TableLayout,
  Virtualizer,
  type Selection,
} from "react-aria-components";
import { useSearchParams } from "react-router";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { TableSelectionCheckbox, useShiftNote } from "./checkbox";
import { useSelectRows } from "./selection";
import { Chevron } from "./disclosure";

// The table real product screens use: 12px muted sentence-case headers, row rules (no zebra),
// numbers right-aligned in tabular figures, one status mark and at most one action per row.
//
// The split (Jonathan, 2026-11-12): React Aria's Table draws it and owns what a person does with it
// (focus and arrow-key navigation, a header that sorts, selection, row and cell semantics for screen
// readers), and TanStack Table owns the data model (here the sort: `useTable` with the row-sorting
// feature, so the data model can grow pagination, filtering or grouping without touching the markup).
// From `virtualizeFrom` rows React Aria's Virtualizer with `TableLayout` draws only the visible rows
// and keeps the header in place (a table with no detail rows uses a fixed 41px row; one with them
// measures its rows). The column API stays small on purpose (key, header, cell, numeric, sort), so a
// screen reads as a list of decisions about columns, not as table plumbing. `sortParam` keeps the
// sort in the URL (?sort=when.desc) so a sorted view can be linked and survives a reload.
//
// A table is a `grid`, its rows `row`s and its cells `gridcell`s (the first column is the row
// header, which React Aria requires): that is the role the keyboard model belongs to. A sortable
// header is the column header itself, pressed or Enter: `aria-sort` is "none" until it is sorted.
//
// Selection is opt-in (`selection`), because checkboxes belong only where a bulk action exists
// (one of 23 real product screens had them; a checkbox on every row is a generated-UI tell). When
// it is on, the first column is a checkbox per row (React Aria's selection checkbox), named from the
// row (`rowLabel` is required), disabled where `isSelectable` says no; the header's "Select all shown"
// covers the selectable rows in `rows` (all of them, not only the rendered ones of a virtualised
// table) and is mixed when some are chosen, and then clears them. Only the checkbox or Space
// chooses a row: a click on a cell does nothing to the selection. Shift-click on a checkbox (or
// Shift+Space) chooses or clears the run from the last row clicked, in the sorted order shown
// (`useSelectRows`, shared with `SelectableGrid`; React Aria extends a range on a row press, but a
// checkbox always toggles one row). Selected rows take the sunken fill, not a ring, so a selection
// never reads as focus. The table only draws the selection; the state is the caller's, usually
// `useSelection`, and the actions live in a `BulkBar`.
//
// Expansion is opt-in too (`expansion`): a row opens a detail row under it, for what belongs to
// the row but would crowd the table (a firing's pieces, a batch's faces). It follows `Disclosure`:
// the toggle is a button with `aria-expanded`, named for what it shows (`rowLabel`, "Pieces in
// firing 412"), and the detail is mounted only while open, so a `useLoad` inside it runs on the
// first open and not for every row on load. The detail is one more row of the grid, spanning the
// data columns and starting under the first of them, with no rule between it and its row; it can
// be focused but never chosen. The toggle does not carry `aria-controls`: a grid cell has no DOM id
// to point at. State is the caller's, usually `useExpanded` (which can keep it in the URL).
//
// Missing values (strata-react issue #47, from the Tubes Library table): a column that gives
// `value` gets a typed sort (numbers, then text in the locale's order with numbers in it read as
// numbers, then dates) and a placeholder for a row whose value is `null` or `undefined`: an en
// dash in the muted ink, named "No value" for a screen reader, or the column's `missing` word
// where the word carries meaning ("Never"). Missing rows sort after every real value in both
// directions, because "not known" is not "smallest"; a column's own `sort` still decides the
// order among the rows that have a value. Without `value` a column works as before.

/** What a column's `value` may be: a number, text or a date, or `null`/`undefined` when the row has none. */
export type CellValue = number | string | Date | null | undefined;

export type Column<T> = {
  key: string;
  header: string;
  /** Right-aligns and sets tabular figures. Use for every quantity. */
  numeric?: boolean;
  /** Orders two rows. With `value`, it orders only rows that have one (missing ones go last); `false` turns off `value`'s default sort. */
  sort?: ((a: T, b: T) => number) | false;
  /** What the cell shows when the row's `value` is missing, where the word carries meaning ("Never"). Default an en dash. */
  missing?: string;
  /** Cells that may hold long text get truncated rather than stretching the table. */
  truncate?: boolean;
  /** Keep the header for screen readers only, as for a column of row actions. `header` still names it. */
  hideHeader?: boolean;
  className?: string;
} & (
  | {
      cell: (row: T) => React.ReactNode;
      /** The row's value for this column: gives a typed default sort with missing values last, and the missing placeholder. */
      value?: (row: T) => CellValue;
    }
  | {
      /** How a row with a value is drawn. Default: numbers through `format.decimal`, dates through `format.date`, text as it is. */
      cell?: (row: T) => React.ReactNode;
      /** The row's value for this column: gives a typed default sort with missing values last, and the missing placeholder. */
      value: (row: T) => CellValue;
    }
);

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const kind = (v: number | string | Date) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);

/** Orders two present values: numbers, then text (locale order, numbers in text read as numbers), then dates. */
function compareValues(a: number | string | Date, b: number | string | Date) {
  if (kind(a) !== kind(b)) return kind(a) - kind(b);
  if (typeof a === "string") return collator.compare(a, b as string);
  return Number(a) - Number(b);
}

/** A cell with no value: the column's word, or an en dash named "No value" for a screen reader. */
function Missing({ word }: { word?: string }) {
  return word ? (
    <span className="text-muted-foreground">{word}</span>
  ) : (
    <span className="text-muted-foreground">
      <span aria-hidden>{format.missing}</span>
      <span className="sr-only">No value</span>
    </span>
  );
}

function drawValue(v: number | string | Date) {
  return typeof v === "number" ? format.decimal(v) : v instanceof Date ? format.date(v) : v;
}

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

/** A table on React Aria's Table with TanStack Table's data model: muted headers, row rules, right-aligned tabular numbers, sortable headers with `aria-sort`, virtualised from `virtualizeFrom` rows, sort optionally kept in the URL (`sortParam`). */
export function DataTable<T>(props: DataTableProps<T>) {
  // Two thin wrappers so each calls its hooks unconditionally.
  return props.sortParam ? <UrlSortedTable {...props} sortParam={props.sortParam} /> : <LocalSortedTable {...props} />;
}

function LocalSortedTable<T>(props: DataTableProps<T>) {
  return <Table {...(props as unknown as DataTableProps<Rec>)} sortState={useLocalSort(props.initialSort)} />;
}

function UrlSortedTable<T>(props: DataTableProps<T> & { sortParam: string }) {
  return <Table {...(props as unknown as DataTableProps<Rec>)} sortState={useUrlSort(props.sortParam, props.initialSort)} />;
}

// The one TanStack feature in use for now: sorting, on the client. TanStack Table 9 is tree-shaken by feature, so
// nothing else (pagination, filtering, TanStack's own selection or expansion) is bundled.
const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
// TanStack Table 9 requires object or array rows. Every row a DataTable draws is a record, but the
// public `T` stays unconstrained so an app's row types need no change: the cast is in the two wrappers.
type Rec = Record<string, any>; // TanStack's own RowData

function Table<T extends Rec>({
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
  const defs = React.useMemo<ColumnDef<typeof features, T, unknown>[]>(
    () =>
      columns.map((c): ColumnDef<typeof features, T, unknown> => {
        const { value, sort } = c;
        if (!value) {
          return {
            id: c.key,
            // TanStack only sorts columns with an accessor; the row itself is enough, since the
            // column's own comparator does the work.
            accessorFn: (row) => row,
            header: c.header,
            cell: (info) => c.cell?.(info.row.original),
            enableSorting: Boolean(sort),
            sortFn: sort ? (a, b) => sort(a.original, b.original) : undefined,
          };
        }
        // The accessor is the value, with null as undefined, so TanStack's `sortUndefined: "last"`
        // keeps missing rows at the end whichever way the column is sorted (it applies before the
        // direction is). The comparator then sees only rows that have a value.
        return {
          id: c.key,
          accessorFn: (row) => value(row) ?? undefined,
          header: c.header,
          cell: (info) => {
            const v = value(info.row.original);
            if (v == null) return <Missing word={c.missing} />;
            return c.cell ? c.cell(info.row.original) : drawValue(v);
          },
          enableSorting: sort !== false,
          sortUndefined: "last",
          sortFn: sort
            ? (a, b) => sort(a.original, b.original)
            : (a, b) => compareValues(a.getValue<number | string | Date>(c.key), b.getValue<number | string | Date>(c.key)),
        };
      }),
    [columns],
  );

  const sortable = (c: Column<T>) => (c.value ? c.sort !== false : Boolean(c.sort));
  const sorting: SortingState = sort && columns.some((c) => c.key === sort.key && sortable(c))
    ? [{ id: sort.key, desc: sort.dir === "descending" }]
    : [];

  const table = useTable({
    features,
    data: rows,
    columns: defs,
    state: { sorting },
    getRowId: (row) => rowKey(row),
    // No pagination here, and expansion is the caller's state, not TanStack's: nothing to reset. Left on, TanStack resets the page
    // index whenever `rows` is a new array; a screen that filters its rows on every render (the
    // kiln room after Withdraw) then re-renders forever and the tab freezes. Found by the
    // example app's visual suite, which jsdom did not show.
    autoResetAll: false,
  });

  const modelRows = table.getRowModel().rows;
  const canExpand = (row: T) => expansion?.isExpandable?.(row) ?? true;
  const virtual = modelRows.length >= virtualizeFrom;
  const lead = (selection ? 1 : 0) + (expansion ? 1 : 0);

  // Selection is React Aria's: its checkboxes (`slot="selection"`), its Space and Shift-range
  // keys, its select-all. We translate to and from our `RowSelection`, which holds keys of rows
  // only (an open detail row is a row of the grid too, and is never chosen).
  const shownKeys = React.useMemo(() => new Set(modelRows.map((r) => r.id)), [modelRows]);
  const selectableKeys = modelRows.filter((r) => selection?.isSelectable?.(r.original) ?? true).map((r) => r.id);
  const detailKey = (id: string) => `${id}\u0000detail`;
  const disabledKeys = React.useMemo(() => {
    const keys: string[] = [];
    for (const r of modelRows) {
      if (selection && !(selection.isSelectable?.(r.original) ?? true)) keys.push(r.id);
      if (expansion && canExpand(r.original)) keys.push(detailKey(r.id));
    }
    return keys;
    // canExpand reads `expansion`.
  }, [modelRows, selection, expansion]);
  // Shift-click on a checkbox extends a range from the last one clicked (issue #32). React Aria
  // extends on a row press and Shift+Space, but a checkbox always toggles one row, so the range is
  // still ours: Shift is noted on the press, and a change of exactly one row is a click.
  const shift = useShiftNote();
  const sortedRows = React.useMemo(() => modelRows.map((r) => r.original), [modelRows]);
  const select = useSelectRows(sortedRows, rowKey, selection);
  const changeSelection = (next: Selection) => {
    if (!selection) return;
    if (next !== "all") {
      const nextShown = new Set([...next].map(String).filter((k) => shownKeys.has(k)));
      const added = [...nextShown].filter((k) => !selection.selected.has(k));
      const removed = [...selection.selected].filter((k) => shownKeys.has(k) && !nextShown.has(k));
      if (added.length + removed.length === 1) {
        select.toggle(added[0] ?? removed[0], added.length === 1, shift.take());
        return;
      }
    }
    // What the table does not show (filtered away) is left as it is, as `useSelection` prunes it.
    const outside = [...selection.selected].filter((k) => !shownKeys.has(k));
    // React Aria's select-all chooses everything when only some are chosen; a mixed box clears
    // what is shown here (Gmail's rule, kept from before), so "all" over a part-chosen set clears.
    const chosen = selectableKeys.filter((k) => selection.selected.has(k)).length;
    const picked =
      next === "all" ? (chosen > 0 && chosen < selectableKeys.length ? [] : selectableKeys) : [...next].map(String).filter((k) => shownKeys.has(k));
    selection.onChange(new Set([...outside, ...picked]));
  };

  const grid = (
    <AriaTable
      aria-label={caption}
      selectionMode={selection ? "multiple" : "none"}
      selectionBehavior="toggle"
      selectedKeys={selection ? new Set([...selection.selected].filter((k) => shownKeys.has(k))) : undefined}
      onSelectionChange={changeSelection}
      disabledKeys={disabledKeys}
      sortDescriptor={sort && columns.some((c) => c.key === sort.key && sortable(c)) ? { column: sort.key, direction: sort.dir } : undefined}
      onSortChange={(d) => setSort({ key: String(d.column), dir: d.direction })}
      className={cn("w-full border-collapse type-body-sm outline-none", virtual && "overflow-auto")}
      style={virtual ? { maxHeight } : undefined}
    >
      <TableHeader className={cn(virtual && "bg-background")}>
        {selection && (
          <AriaColumn id={SELECT} textValue="Select all shown" width={32} className="w-8 py-2 pr-2 text-left align-bottom outline-offset-[-2px]">
            <TableSelectionCheckbox label="Select all shown" className="-my-1" disabled={selectableKeys.length === 0} />
          </AriaColumn>
        )}
        {expansion && (
          <AriaColumn id={EXPAND} textValue="Details" width={40} className="w-10 py-2 pr-2 outline-offset-[-2px]">
            <span className="sr-only">Details</span>
          </AriaColumn>
        )}
        {columns.map((c, i) => (
          <AriaColumn
            key={c.key}
            id={c.key}
            textValue={c.header}
            // React Aria requires a row header; the first data column is the row's name.
            isRowHeader={i === 0}
            allowsSorting={sortable(c)}
            // Widths apply only to a virtualised table (a plain one sizes its columns to their
            // content): numbers take less than text. `last:pr-0` would match every cell of a
            // virtualised table, where each sits alone in a wrapper, so the last column is named.
            width={c.numeric ? "0.6fr" : "1fr"}
            className={cn(
              "py-2 text-left align-bottom type-caption font-normal text-muted-foreground outline-offset-[-2px]",
              i < columns.length - 1 && "pr-4",
              c.numeric && "text-right",
            )}
          >
            {({ allowsSorting, sortDirection }) => {
              const Icon = sortDirection === "ascending" ? ArrowUp : sortDirection === "descending" ? ArrowDown : ArrowUpDown;
              const label = c.hideHeader ? <span className="sr-only">{c.header}</span> : c.header;
              return allowsSorting ? (
                <span
                  className={cn(
                    "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-control px-1 transition-state hover:text-foreground",
                    c.numeric && "flex-row-reverse",
                    sortDirection && "text-foreground",
                  )}
                >
                  {label}
                  <Icon aria-hidden className={cn("size-3.5", !sortDirection && "opacity-50")} />
                </span>
              ) : (
                label
              );
            }}
          </AriaColumn>
        ))}
      </TableHeader>
      <TableBody>
        {modelRows.flatMap((row) => {
          const open = (expansion?.expanded.has(row.id) ?? false) && canExpand(row.original);
          const cells = new Map(row.getAllCells().map((cell) => [cell.column.id, cell]));
          const items = [
            <AriaRow
              key={row.id}
              id={row.id}
              textValue={selection?.rowLabel(row.original) ?? expansion?.rowLabel(row.original) ?? row.id}
              // A row's own press does nothing: only its checkbox, or Space, chooses it, so a click on
              // a cell never changes the selection (React Aria's "toggle" would otherwise make every row a switch).
              onAction={selection ? noop : undefined}
              className={cn("border-t border-border outline-offset-[-2px] selected:bg-surface-sunken", open && "selected:bg-surface-sunken")}
            >
              {selection && (
                <AriaCell className="w-8 py-2.5 pr-2 align-middle">
                  <TableSelectionCheckbox label={`Select ${selection.rowLabel(row.original)}`} className="-my-0.5" />
                </AriaCell>
              )}
              {expansion && (
                <AriaCell className="w-10 py-2.5 pr-2 align-middle">
                  {canExpand(row.original) && (
                    <AriaButton
                      aria-expanded={open}
                      aria-label={expansion.rowLabel(row.original)}
                      onPress={() => {
                        const next = new Set(expansion.expanded);
                        if (open) next.delete(row.id);
                        else next.add(row.id);
                        expansion.onChange(next);
                      }}
                      className="-my-1.5 grid size-(--control-h-sm) cursor-pointer place-items-center rounded-control hover:bg-muted"
                    >
                      <Chevron open={open} />
                    </AriaButton>
                  )}
                </AriaCell>
              )}
              {columns.map((c, i) => {
                const cell = cells.get(c.key)!;
                return (
                  <AriaCell
                    key={c.key}
                    className={cn(
                      "py-2.5 align-middle",
                      i < columns.length - 1 && "pr-4",
                      c.numeric && "text-right tabular-nums",
                      c.truncate && "max-w-48 truncate",
                      c.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </AriaCell>
                );
              })}
            </AriaRow>,
          ];
          if (open && expansion)
            items.push(
              <AriaRow key={detailKey(row.id)} id={detailKey(row.id)} textValue={expansion.rowLabel(row.original)} className="outline-offset-[-2px]">
                {lead > 0 && <AriaCell colSpan={lead} />}
                <AriaCell colSpan={columns.length} className="pt-0.5 pb-4 align-top">
                  {expansion.detail(row.original)}
                </AriaCell>
              </AriaRow>,
            );
          return items;
        })}
      </TableBody>
    </AriaTable>
  );

  return (
    <div
      className={cn("relative min-w-0", !virtual && "overflow-x-auto", className)}
      onMouseDownCapture={shift.handlers.onMouseDown}
      onKeyDownCapture={shift.handlers.onKeyDown}
    >
      {virtual ? (
        <Virtualizer layout={TableLayout} layoutOptions={expansion ? { estimatedRowHeight: 41, headingHeight: 36 } : { rowHeight: 41, headingHeight: 36 }}>
          {grid}
        </Virtualizer>
      ) : (
        grid
      )}
    </div>
  );
}

const SELECT = "\u0000select";
const EXPAND = "\u0000expand";
const noop = () => {};

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
