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
// The count is the bar's live region, and only the count: it is always mounted, so a screen reader
// hears "2 bookings selected" on each change, and the buttons are outside it, so their names are
// not read again with every tick. The actions are a labelled group. Per the research, at most one
// of them is filled (`variant="default"`), named with its verb and count ("Withdraw 3"), and a
// reversible bulk removal goes through `useUndoable` like a single one, not through a confirm.

/** Chosen row keys, pruned to the rows that exist, and the calls that change them. Spread into `DataTable`'s `selection` with a `rowLabel`. */
export function useSelection<T>(rows: readonly T[], rowKey: (row: T) => string, initial: Iterable<string> = []) {
  const [raw, setRaw] = React.useState<ReadonlySet<string>>(() => new Set(initial));
  const selected = React.useMemo<ReadonlySet<string>>(() => {
    const present = new Set(rows.map(rowKey));
    return new Set([...raw].filter((k) => present.has(k)));
    // rowKey is usually an inline arrow, so it is left out of the dependencies: the rows change.
  }, [raw, rows]);
  const selectedRows = React.useMemo(() => rows.filter((r) => selected.has(rowKey(r))), [rows, selected]);
  // Forget the dropped keys too, not only hide them: a row that comes back (a filter cleared, a
  // removal undone) returns unchosen, so a later bulk action never picks it up unasked.
  React.useEffect(() => {
    if (selected.size !== raw.size) setRaw(selected);
  }, [selected, raw]);
  const onChange = React.useCallback((next: Set<string>) => setRaw(next), []);
  const clear = React.useCallback(() => setRaw(new Set()), []);
  return { selected, selectedRows, count: selected.size, onChange, clear };
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
