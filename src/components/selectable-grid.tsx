import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../lib/utils";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import { Check } from "lucide-react";
import { Checkbox, useShiftNote, type CheckboxGesture } from "./checkbox";
import type { RowSelection } from "./data-table";
import { useSelectRows } from "./selection";

// Choosing from pictures: a review screen of face crops, a set of glaze test tiles, photos to
// archive. It is `DataTable`'s selection drawn as a grid (strata-react issue #32, from the Bright
// Horizons port, where the Groups screen had to be built by hand from `Checkbox` and
// `useSelection`), and it shares the state and the rules: `useSelection` holds the keys, a
// `BulkBar` holds the actions, select-all covers the selectable tiles shown (all of them, rendered
// or not) and is mixed when some are chosen, and Shift-click or Shift+Space chooses or clears the
// run from the last tile clicked (`useSelectRows`, the same code the table uses).
//
// Each tile is one target: the picture, the box and the detail line sit in one <label>, so a click
// anywhere on the picture toggles it (Google Photos and Apple Photos select from the picture, not
// only from the box). The box is named from the row (`rowLabel` is required, as the table's is),
// so a screen reader hears "Select Ada Lovelace, crop 3", not twelve "checkbox, not checked". The
// box sits on a chip of the page's ground in the picture's corner, so it stays visible on any
// photo. A chosen tile takes the sunken fill and a primary border, not a ring: the focus outline is
// the only ring, so a selection never reads as focus.
//
// The picture is the caller's (`renderImage`), in a frame of fixed aspect (`aspect`, square by
// default) so tiles line up and nothing shifts as images load; an <img> or Strata's `Thumbnail`
// fills it. Tiles are sized by a minimum width (`tileSize`) and fill the row. From
// `virtualizeFrom` tiles (100, as the table and list) the grid renders only the visible rows of
// tiles in a labelled, focusable scroll region, measuring its width to know how many fit a row.

/** The frame each picture is drawn in. */
export type TileAspect = "square" | "portrait" | "landscape";

/** Smallest tile width: `sm` 96px (dense crops), `md` 144px, `lg` 192px. Tiles grow to fill the row. */
export type TileSize = "sm" | "md" | "lg";

export type SelectableGridProps<T> = {
  /** Names the list of tiles (and its scroll region once virtualised). */
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

const minWidth: Record<TileSize, number> = { sm: 96, md: 144, lg: 192 };
const aspectClass: Record<TileAspect, string> = { square: "aspect-square", portrait: "aspect-3/4", landscape: "aspect-4/3" };
const aspectRatio: Record<TileAspect, number> = { square: 1, portrait: 4 / 3, landscape: 3 / 4 };
// gap-3, in px, for the column count of a virtualised grid.
const GAP = 12;
// The detail line and the tile's padding, for the first estimate of a row's height.
const TILE_CHROME = 40;

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

  const tile = (row: T, index: number) => {
    const key = rowKey(row);
    return (
      <Tile
        name={`Select ${selection.rowLabel(row)}`}
        chosen={selection.selected.has(key)}
        disabled={!(selection.isSelectable?.(row) ?? true)}
        onChange={(on, gesture) => select.toggle(key, on, gesture)}
        aspect={aspect}
        image={renderImage(row)}
        detail={detail?.(row)}
        index={index}
      />
    );
  };

  return (
    <div className={cn("grid min-w-0 gap-3", className)}>
      <Checkbox
        className="justify-self-start"
        label="Select all shown"
        checked={select.all.checked}
        disabled={select.all.disabled}
        onCheckedChange={select.all.toggle}
      />
      {virtual ? (
        <VirtualTiles label={label} rows={rows} rowKey={rowKey} tile={tile} aspect={aspect} tileSize={tileSize} maxHeight={maxHeight} />
      ) : (
        <ul
          aria-label={label}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth[tileSize]}px, 100%), 1fr))` }}
        >
          {rows.map((row, i) => (
            <li key={rowKey(row)}>{tile(row, i)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VirtualTiles<T>({
  label,
  rows,
  rowKey,
  tile,
  aspect,
  tileSize,
  maxHeight,
}: {
  label: string;
  rows: T[];
  rowKey: (row: T) => string;
  tile: (row: T, index: number) => React.ReactNode;
  aspect: TileAspect;
  tileSize: TileSize;
  maxHeight: number;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const min = minWidth[tileSize];
  const columns = Math.max(1, Math.floor((width + GAP) / (min + GAP)));
  const tileWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : min;
  const lines = Math.ceil(rows.length / columns);
  const virtualizer = useVirtualizer({
    count: lines,
    getScrollElement: () => scroller.current,
    estimateSize: () => Math.round(tileWidth * aspectRatio[aspect]) + TILE_CHROME + GAP,
    overscan: 3,
    // Keyed by the column count as well as the row: a new count moves every tile to another row,
    // so each row of tiles is a new element, measured afresh, not an old height reused.
    getItemKey: (i) => `${columns}:${i}`,
    // Until the region is measured, assume it is full height, so the first paint shows tiles.
    initialRect: { width: 0, height: maxHeight },
  });
  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-strata-scroll=""
      className="min-w-0 overflow-y-auto"
      style={{ height: maxHeight }}
    >
      {/* role="list" over plain rows of tiles: each row is laid out on its own, and the rows add nothing for a screen reader. */}
      <div role="list" aria-label={label} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((v) => {
          const start = v.index * columns;
          return (
            <div
              key={v.key}
              ref={virtualizer.measureElement}
              data-index={v.index}
              role="none"
              className="absolute inset-x-0 top-0 grid gap-3 pb-3"
              style={{ translate: `0 ${v.start}px`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {rows.slice(start, start + columns).map((row, i) => (
                <div key={rowKey(row)} role="listitem" aria-setsize={rows.length} aria-posinset={start + i + 1}>
                  {tile(row, start + i)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tile({
  name,
  chosen,
  disabled,
  onChange,
  aspect,
  image,
  detail,
  index,
}: {
  name: string;
  chosen: boolean;
  disabled: boolean;
  onChange: (on: boolean, gesture: CheckboxGesture) => void;
  aspect: TileAspect;
  image: React.ReactNode;
  detail?: React.ReactNode;
  index: number;
}) {
  const shift = useShiftNote();
  // The whole tile is one React Aria Checkbox (a label around a hidden input), so a press anywhere
  // on it toggles; the visible box in the corner is drawn from tokens. Shift is noted in the capture
  // phase because React Aria's press handling stops the events it uses.
  return (
    <span className="contents" onMouseDownCapture={shift.handlers.onMouseDown} onKeyDownCapture={shift.handlers.onKeyDown}>
      <AriaCheckbox
        isSelected={chosen}
        isDisabled={disabled}
        aria-label={name}
        onChange={(on) => onChange(on, shift.take())}
        data-index={index}
        className={cn(
          // select-none: a Shift-click range would otherwise also select the text between the tiles.
          "group relative grid min-w-0 gap-1.5 rounded-surface border border-transparent p-1.5 select-none transition-state",
          "data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-ring",
          chosen && "border-primary bg-surface-sunken",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-surface-sunken",
        )}
      >
        <span className={cn("block overflow-hidden rounded-control bg-muted *:size-full *:object-cover", aspectClass[aspect])}>
          {image}
        </span>
        <span className="absolute top-3 left-3 grid size-7 place-items-center rounded-control bg-background">
          <span
            aria-hidden
            className={cn(
              "grid size-4.5 place-items-center rounded-control border border-input bg-background",
              chosen && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {chosen && <Check className="size-3.5" strokeWidth={3} />}
          </span>
        </span>
        {detail != null && <span className="truncate type-body-sm text-muted-foreground">{detail}</span>}
      </AriaCheckbox>
    </span>
  );
}
