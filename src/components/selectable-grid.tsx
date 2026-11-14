import * as React from "react";
import { cn } from "../lib/utils";
import { Checkbox as AriaCheckbox, GridLayout, GridList, GridListItem, Virtualizer, type Selection } from "react-aria-components";
import { Check } from "lucide-react";
import { Checkbox, useShiftNote } from "./checkbox";
import type { RowSelection } from "./data-table";
import { useSelectRows } from "./selection";
import { aspectClass, minWidth, tileLayoutOptions, type TileAspect, type TileSize } from "./tile-grid";

// Choosing from pictures: a review screen of face crops, a set of glaze test tiles, photos to
// archive. It is `DataTable`'s selection drawn as a grid (strata-react issue #32, from the Bright
// Horizons port, where the Groups screen had to be built by hand from `Checkbox` and
// `useSelection`), and it shares the state and the rules: `useSelection` holds the keys, a
// `BulkBar` holds the actions, select-all covers the selectable tiles shown (all of them, rendered
// or not) and is mixed when some are chosen, and Shift-click or Shift+Space chooses or clears the
// run from the last tile clicked (`useSelectRows`, the same code the table uses).
//
// It is React Aria's GridList with `layout="grid"` (arrow keys move across and down the tiles) and
// its own selection: each tile is one row, a press anywhere on it toggles it (Google Photos and Apple
// Photos select from the picture, not only from the box), Shift extends a range, Space toggles. The
// box is React Aria's selection checkbox, named from the row (`rowLabel` is required, as the
// table's is), so a screen reader hears "Select Ada Lovelace, crop 3", not twelve "checkbox, not
// checked". The box sits on a chip of the page's ground in the picture's corner, so it stays
// visible on any photo. A chosen tile takes the sunken fill and a primary border, not a ring: the
// focus outline is the only ring, so a selection never reads as focus. Shift-click on the box also
// extends a range, as before (a checkbox always toggles one tile in React Aria), through
// `useSelectRows`. "Select all shown" is ours, outside the grid, since the tiles shown may be a
// part of the keys held.
//
// The picture is the caller's (`renderImage`), in a frame of fixed aspect (`aspect`, square by
// default) so tiles line up and nothing shifts as images load; an <img> or Strata's `Thumbnail`
// fills it. Tiles are sized by a minimum width (`tileSize`) and fill the row. From
// `virtualizeFrom` tiles (100, as the table and list) React Aria's Virtualizer with `GridLayout`
// draws only the visible rows of tiles in the grid's own scroll box, working out how many fit a row
// and measuring each row of tiles. (Its tiles keep a margin of one gap at the edges of the box, which
// the plain grid does not have.)

export type { TileAspect, TileSize };

export type SelectableGridProps<T> = {
  /** Names the grid of tiles. */
  label: string;
  rows: T[];
  rowKey: (row: T) => string;
  /** The picture, drawn to fill a frame of `aspect`. An `<img className="size-full object-cover">` or a `Thumbnail`. */
  renderImage: (row: T) => React.ReactNode;
  /** A short line under the picture (a name, a date, a score). Truncated to one line. */
  detail?: (row: T) => React.ReactNode;
  /** The chosen keys and how to change them, as `DataTable` takes them; `rowLabel` names each tile's box. */
  selection: RowSelection<T>;
  /** Default `square`. `portrait` is 3:4, `landscape` 4:3. */
  aspect?: TileAspect;
  /** Default `md`. */
  tileSize?: TileSize;
  /** Tile count from which only the visible rows of tiles render. Default 100. */
  virtualizeFrom?: number;
  /** Height of the scroll region once virtualised, in px. Default 480. */
  maxHeight?: number;
  className?: string;
};

/** A grid of pictures to choose from: each tile one labelled target, "Select all shown", Shift-click ranges, virtualised from `virtualizeFrom` tiles. Pair with `useSelection` and a `BulkBar`. */
export function SelectableGrid<T>({
  label,
  rows,
  rowKey,
  renderImage,
  detail,
  selection,
  aspect = "square",
  tileSize = "md",
  virtualizeFrom = 100,
  maxHeight = 480,
  className,
}: SelectableGridProps<T>) {
  const select = useSelectRows(rows, rowKey, selection);
  const virtual = rows.length >= virtualizeFrom;
  const shownKeys = React.useMemo(() => new Set(rows.map(rowKey)), [rows, rowKey]);
  const disabledKeys = rows.filter((r) => !(selection.isSelectable?.(r) ?? true)).map(rowKey);

  // React Aria owns the selection of tiles: a press anywhere on a tile toggles it, Shift extends a
  // range from the last one, Space toggles from the keyboard. Our `RowSelection` holds keys only, and
  // keeps the keys of rows that are not shown (a filter), so the two are translated here.
  // A checkbox always toggles one tile in React Aria, and Shift-click on one still extends a range
  // (issue #32): Shift is noted on the press, and a change of exactly one tile is a click on it.
  // A press on the picture with Shift is React Aria's own range and changes several at once.
  const shift = useShiftNote();
  // The row last pressed (React Aria marks each row with `data-key`), to anchor a range it extended itself.
  const pressed = React.useRef<string | null>(null);
  const notePress = (e: React.SyntheticEvent) => void (pressed.current = (e.target as HTMLElement).closest("[data-key]")?.getAttribute("data-key") ?? null);
  const changeSelection = (next: Selection) => {
    if (next !== "all") {
      const nextShown = new Set([...next].map(String).filter((k) => shownKeys.has(k)));
      const added = [...nextShown].filter((k) => !selection.selected.has(k));
      const removed = [...selection.selected].filter((k) => shownKeys.has(k) && !nextShown.has(k));
      if (added.length + removed.length === 1) {
        select.toggle(added[0] ?? removed[0], added.length === 1, shift.take());
        return;
      }
      select.setAnchor(pressed.current);
    }
    const outside = [...selection.selected].filter((k) => !shownKeys.has(k));
    const picked = next === "all" ? rows.filter((r) => selection.isSelectable?.(r) ?? true).map(rowKey) : [...next].map(String).filter((k) => shownKeys.has(k));
    selection.onChange(new Set([...outside, ...picked]));
  };

  const layoutOptions = React.useMemo(() => tileLayoutOptions(tileSize, aspect), [tileSize, aspect]);

  const grid = (
    <GridList
      aria-label={label}
      layout="grid"
      selectionMode="multiple"
      selectionBehavior="toggle"
      selectedKeys={new Set([...selection.selected].filter((k) => shownKeys.has(k)))}
      onSelectionChange={changeSelection}
      disabledKeys={disabledKeys}
      data-strata-scroll=""
      className={cn("min-w-0 outline-none", virtual ? "overflow-y-auto" : "grid gap-3")}
      style={
        virtual
          ? { height: maxHeight }
          : { gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth[tileSize]}px, 100%), 1fr))` }
      }
    >
      {rows.map((row, index) => {
        const key = rowKey(row);
        const name = selection.rowLabel(row);
        return (
          <GridListItem
            key={key}
            id={key}
            textValue={name}
            data-index={index}
            className={cn(
              // select-none: a Shift-click range would otherwise also select the text between the tiles.
              "group relative grid min-w-0 gap-1.5 rounded-surface border border-transparent p-1.5 select-none outline-offset-2 transition-state",
              "selected:border-primary selected:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50",
              "cursor-pointer hover:bg-surface-sunken disabled:hover:bg-transparent",
            )}
          >
            <span className={cn("block overflow-hidden rounded-control bg-muted *:size-full *:object-cover", aspectClass[aspect])}>
              {renderImage(row)}
            </span>
            <TileBox label={`Select ${name}`} />
            {detail?.(row) != null && <span className="truncate type-body-sm text-muted-foreground">{detail(row)}</span>}
          </GridListItem>
        );
      })}
    </GridList>
  );

  return (
    <div
      className={cn("grid min-w-0 gap-3", className)}
      onMouseDownCapture={(e) => {
        shift.handlers.onMouseDown(e);
        notePress(e);
      }}
      onKeyDownCapture={(e) => {
        shift.handlers.onKeyDown(e);
        notePress(e);
      }}
    >
      <Checkbox
        className="justify-self-start"
        label="Select all shown"
        checked={select.all.checked}
        disabled={select.all.disabled}
        onCheckedChange={select.all.toggle}
      />
      {virtual ? (
        <Virtualizer layout={GridLayout} layoutOptions={layoutOptions}>
          {grid}
        </Virtualizer>
      ) : (
        grid
      )}
    </div>
  );
}

// The box in the tile's corner: React Aria's selection checkbox for this row (`slot="selection"`),
// named from the row, on a chip of the page's ground so it stays visible on any photo.
function TileBox({ label }: { label: string }) {
  // The grid would name the box from its own label and the row's; ours is named by `rowLabel`
  // alone, so it labels itself.
  const id = React.useId();
  return (
    <AriaCheckbox slot="selection" id={id} aria-labelledby={id} aria-label={label} className="absolute top-3 left-3 grid size-7 place-items-center rounded-control bg-background">
      {({ isSelected }) => (
        <span
          aria-hidden
          className={cn(
            "grid size-4.5 place-items-center rounded-control border border-input bg-background",
            isSelected && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {isSelected && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      )}
    </AriaCheckbox>
  );
}
