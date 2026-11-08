import * as React from "react";
import { X } from "lucide-react";
import { format as defaultFormat, type Format } from "../lib/format";
import { cn } from "../lib/utils";
import { Button } from "./button";

// Select many, then act: the state (`useSelection`), and the bar that says how many are chosen and
// holds what can be done to them (`BulkBar`). `DataTable`'s `selection` prop draws the checkboxes.
//
// The selection is pruned to the rows that exist. After a bulk removal, a refetch or a new filter,
// a key whose row is gone is not counted and not acted on: the bar never says "3 selected" over
// two visible rows, and an action never reaches a row the person cannot see. (Gmail and Linear
// both drop a selection a filter hides; acting on hidden rows is how a bulk delete surprises.)
//
// Shift extends a range from the last row clicked, on every surface (`useSelectRows`), and
// `initial` chooses a row when it first appears rather than only on mount, so a selection seeded
// from data still applies once the data arrives (both from strata-react issue #32, a review screen
// of face crops with the likely matches pre-chosen).
//
// The count is the bar's live region, and only the count: it is always mounted, so a screen reader
// hears "2 bookings selected" on each change, and the buttons are outside it, so their names are
// not read again with every tick. The actions are a labelled group. Per the research, at most one
// of them is filled (`variant="default"`), named with its verb and count ("Withdraw 3"), and a
// reversible bulk removal goes through `useUndoable` like a single one, not through a confirm.

/** Which rows start chosen: their keys, or a test on each row. Either applies to a row the first time it appears. */
export type InitialSelection<T> = Iterable<string> | ((row: T) => boolean);

type SelectionState = { keys: readonly string[]; seen: ReadonlySet<string>; raw: ReadonlySet<string> };

// Bring the state up to the rows now shown: drop keys whose row has gone, and choose the rows seen
// for the first time that `initial` names. A row seen before keeps the person's choice, even if it
// left and came back (it returns unchosen, as it was forgotten when it left).
function reconcile<T>(prev: SelectionState, rows: readonly T[], keys: readonly string[], initial: (row: T, key: string) => boolean): SelectionState {
  const present = new Set(keys);
  const raw = new Set([...prev.raw].filter((k) => present.has(k)));
  const seen = new Set(prev.seen);
  rows.forEach((row, i) => {
    const key = keys[i];
    if (seen.has(key)) return;
    seen.add(key);
    if (initial(row, key)) raw.add(key);
  });
  return { keys, seen, raw };
}

const sameKeys = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * Chosen row keys, pruned to the rows that exist, and the calls that change them. Spread into
 * `DataTable`'s or `SelectableGrid`'s `selection` with a `rowLabel`. `initial` (keys, or a test on
 * the row) chooses each row the first time it appears, so a selection seeded from data that loads
 * later, or a next page, still starts right.
 */
export function useSelection<T>(rows: readonly T[], rowKey: (row: T) => string, initial: InitialSelection<T> = []) {
  // `initial` is read when a row first appears, so a new function each render is fine.
  const initialRef = React.useRef(initial);
  initialRef.current = initial;
  const test = (row: T, key: string) => {
    const init = initialRef.current;
    return typeof init === "function" ? init(row) : new Set(init).has(key);
  };
  const keys = rows.map(rowKey);
  const [state, setState] = React.useState<SelectionState>(() =>
    reconcile({ keys: [], seen: new Set(), raw: new Set() }, rows, keys, test),
  );
  // Adjusted while rendering (React's pattern for state derived from props), not in an effect, so
  // the first paint of new rows already shows them chosen. Compared by key, not by array identity,
  // so `rows={data ?? []}` does not loop.
  let current = state;
  if (!sameKeys(state.keys, keys)) {
    current = reconcile(state, rows, keys, test);
    setState(current);
  }
  const selected = current.raw;
  // rowKey is usually an inline arrow, so it is left out of the dependencies: the rows change.
  const selectedRows = React.useMemo(() => rows.filter((r) => selected.has(rowKey(r))), [rows, selected]);
  // A key with no row is never kept, so an action never reaches a row the person cannot see.
  const onChange = React.useCallback(
    (next: Set<string>) =>
      setState((s) => {
        const present = new Set(s.keys);
        return { ...s, raw: new Set([...next].filter((k) => present.has(k))) };
      }),
    [],
  );
  const clear = React.useCallback(() => setState((s) => ({ ...s, raw: new Set() })), []);
  return { selected, selectedRows, count: selected.size, onChange, clear };
}

/** The part of a selection the surfaces drawing it (`DataTable`, `SelectableGrid`) need. */
type SelectionLike<T> = {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  isSelectable?: (row: T) => boolean;
};

/**
 * Selecting rows of a surface in the order it shows them: one row, a range with Shift, and all
 * shown. Shared by `DataTable` and `SelectableGrid`, so a range and select-all behave the same on
 * both. `rows` are in display order (after sorting) and include rows a virtualised surface has not
 * rendered.
 *
 * A range runs from the last row clicked (the anchor) to this one, over the selectable rows
 * between, and sets them all to this row's new state, as Gmail and Finder do: Shift-clicking an
 * unchosen row chooses the run, Shift-clicking a chosen one clears it. Every click moves the
 * anchor. An anchor that has left the rows (filtered, removed) makes the next Shift-click a plain
 * one.
 * @internal
 */
export function useSelectRows<T>(rows: readonly T[], rowKey: (row: T) => string, selection?: SelectionLike<T>) {
  const anchor = React.useRef<string | undefined>(undefined);
  const keys = selection ? rows.filter((r) => selection.isSelectable?.(r) ?? true).map(rowKey) : [];
  const chosen = selection ? keys.filter((k) => selection.selected.has(k)).length : 0;
  const allChecked: boolean | "mixed" = chosen === 0 ? false : chosen === keys.length ? true : "mixed";

  const toggle = (key: string, on: boolean, { shiftKey }: { shiftKey: boolean }) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    const from = shiftKey && anchor.current !== undefined ? keys.indexOf(anchor.current) : -1;
    const to = keys.indexOf(key);
    if (from >= 0 && to >= 0) {
      const [a, b] = from < to ? [from, to] : [to, from];
      for (const k of keys.slice(a, b + 1)) {
        if (on) next.add(k);
        else next.delete(k);
      }
    } else if (on) next.add(key);
    else next.delete(key);
    anchor.current = key;
    selection.onChange(next);
  };

  // A full or mixed box clears what is shown; an empty one selects every selectable row shown.
  // Keys outside `rows` (filtered away) are left as they are.
  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (allChecked === false) keys.forEach((k) => next.add(k));
    else keys.forEach((k) => next.delete(k));
    selection.onChange(next);
  };

  return { toggle, all: { checked: allChecked, toggle: toggleAll, disabled: keys.length === 0 } };
}

/** The bar for a selection: a polite live count ("2 bookings selected"), the bulk actions, and Clear selection. Renders only the live region while nothing is chosen. */
export function BulkBar({
  count,
  noun,
  onClear,
  children,
  format = defaultFormat,
  className,
}: {
  count: number;
  /** What is chosen, singular, or singular and plural: `"booking"`, `["person", "people"]`. */
  noun: string | [one: string, many: string];
  onClear: () => void;
  /** The actions. At most one filled button, named with its verb and count. */
  children: React.ReactNode;
  /** The product's formatters, for the count's figures and plural. Default en-GB. */
  format?: Format;
  className?: string;
}) {
  const [one, many] = typeof noun === "string" ? [noun, `${noun}s`] : noun;
  const label = `${format.count(count, one, many)} selected`;
  return (
    <div
      className={cn(
        count > 0 && "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-surface bg-surface-sunken py-1.5 pr-1.5 pl-3",
        className,
      )}
    >
      <p aria-live="polite" className={count > 0 ? "type-label tabular-nums" : "sr-only"}>
        {count > 0 ? label : `No ${many} selected`}
      </p>
      {count > 0 && (
        <div role="group" aria-label={`Actions for the selected ${many}`} className="flex flex-1 flex-wrap items-center gap-2">
          {children}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
            <X aria-hidden />
            Clear selection
          </Button>
        </div>
      )}
    </div>
  );
}
