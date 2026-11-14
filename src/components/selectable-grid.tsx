import * as React from "react";
import { cn } from "../lib/utils";
import { Checkbox as AriaCheckbox, GridLayout, GridList, GridListItem, Virtualizer, type Selection } from "react-aria-components";
import { Check, ChevronDown } from "lucide-react";
import { Checkbox, useShiftNote } from "./checkbox";
import type { RowSelection } from "./data-table";
import { useSelectRows } from "./selection";
import { aspectClass, tileLayoutOptions, tileWidth, type TileAspect, type TileSize } from "./tile-grid";
import { Button } from "./button";
import { isTypingTarget } from "./hotkeys";

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

// A photo grid (issue #246, strata-stills' Browser). What was added to the grid above, and why it
// stays React Aria's GridList:
// - A continuous size. `tileSize` takes pixels as well as `sm`/`md`/`lg`, and `onTileSizeChange` is
//   called by Ctrl/Cmd+wheel (which is also a trackpad pinch in a browser), `+` and `-` while the
//   grid has focus. The size is the caller's (a `useViewOptions` slider holds it), and the scroll
//   position is kept as a share of the content's height across the change, so the picture in view
//   stays in view.
// - `selectionMode` none, single or multiple and `selectionBehavior` toggle or replace are
//   GridList's own props, passed through; with `replace` a click chooses one tile, Ctrl/Cmd toggles
//   and Shift extends (the Finder and Photos rules), Ctrl/Cmd+A chooses all and Escape clears. The
//   box is drawn only for multiple. `onAction` (Enter, or a double click with `replace`) opens a
//   tile; it is GridList's `onAction`, and with `toggle` a plain press still toggles.
// - Groups. `groupBy` puts tiles under sticky headings in the order the rows first show them. A
//   heading has a box for the group (mixed when some of it is chosen) and a fold button that
//   removes the group's tiles from the page while it is folded. Each group is its own list, so an
//   arrow key stops at a group's edge, and a grouped grid is not virtualised (folding is how a
//   long one is kept short); Shift ranges and select-all run across groups as they use the flat
//   order of `rows`.
// - `badge` is a corner slot, as `TileGrid`'s. `unselectableReason` says in words why a tile cannot
//   be chosen. Choices that a filter hides stay chosen and are counted ("3 chosen are hidden by
//   the filter"), with Clear hidden beside the count.
//
// Not here yet, and left in the issue: a justified layout for pictures of their own shapes
// (`aspect="natural"`), a marquee, touch pinch (Ctrl+wheel covers a trackpad) and virtualising
// across groups, which React Aria's `GridLayout` has no section for. Checked: its layouts take
// items in one flat collection.

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
  /** Default `md`. Pixels for a continuous size: the minimum tile width, growing to fill the row. */
  tileSize?: TileSize | number;
  /** Asked to change the size by Ctrl/Cmd+wheel, `+` and `-`. Give a `useViewOptions` size back to `tileSize`; omit to leave the size fixed. */
  onTileSizeChange?: (px: number) => void;
  /** Tiles' smallest and largest width for those zooms, in px. Default 64 and 320. */
  zoomRange?: readonly [min: number, max: number];
  /** How many tiles can be chosen: `none` makes a grid to look at and open, `single` one tile. Default `multiple`. */
  selectionMode?: "none" | "single" | "multiple";
  /** `toggle` (default): a press toggles. `replace`: a press chooses that tile only, Ctrl/Cmd toggles, Shift extends. */
  selectionBehavior?: "toggle" | "replace";
  /** Opens a tile: Enter, or a double click with `selectionBehavior="replace"`. */
  onAction?: (row: T) => void;
  /** A corner badge on the picture (top right): a `Status`. */
  badge?: (row: T) => React.ReactNode;
  /** Puts tiles under sticky headings, in the order the rows first show them. The grid is not virtualised while grouped. */
  groupBy?: (row: T) => string;
  /** The words for a group's heading; default the group text. */
  groupHeading?: (group: string, rows: T[]) => string;
  /** Why a tile `selection.isSelectable` refuses cannot be chosen, in words ("Already in a project"). */
  unselectableReason?: (row: T) => string | undefined;
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
  onTileSizeChange,
  zoomRange = [64, 320],
  selectionMode = "multiple",
  selectionBehavior = "toggle",
  onAction,
  badge,
  groupBy,
  groupHeading,
  unselectableReason,
  virtualizeFrom = 100,
  maxHeight = 480,
  className,
}: SelectableGridProps<T>) {
  const select = useSelectRows(rows, rowKey, selection);
  const shownKeys = React.useMemo(() => new Set(rows.map(rowKey)), [rows, rowKey]);
  const groups = React.useMemo(() => {
    if (!groupBy) return null;
    const out = new Map<string, T[]>();
    for (const row of rows) {
      const g = groupBy(row);
      const list = out.get(g);
      if (list) list.push(row);
      else out.set(g, [row]);
    }
    return [...out].map(([key, list]) => ({ key, rows: list }));
  }, [rows, groupBy]);
  const [folded, setFolded] = React.useState<ReadonlySet<string>>(new Set());
  const virtual = !groups && rows.length >= virtualizeFrom;
  const px = tileWidth(tileSize);
  const outer = React.useRef<HTMLDivElement>(null);
  const hidden = [...selection.selected].filter((k) => !shownKeys.has(k)).length;

  // Zoom. The scroll position is kept as a share of the content across the change (applied in a
  // layout effect, after the new tiles have their sizes), so the picture in view stays in view.
  const keep = React.useRef<number | null>(null);
  const scrollBox = () => outer.current?.querySelector<HTMLElement>("[data-strata-scroll]") ?? null;
  const zoom = (next: number) => {
    if (!onTileSizeChange) return;
    const clamped = Math.round(Math.min(zoomRange[1], Math.max(zoomRange[0], next)));
    if (clamped === px) return;
    const box = scrollBox();
    keep.current = box && box.scrollHeight > 0 ? box.scrollTop / box.scrollHeight : null;
    onTileSizeChange(clamped);
  };
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  React.useLayoutEffect(() => {
    const box = scrollBox();
    if (box && keep.current !== null) box.scrollTop = keep.current * box.scrollHeight;
    keep.current = null;
  }, [px]);
  // A wheel listener has to be non-passive to refuse the browser's own page zoom.
  React.useEffect(() => {
    const el = outer.current;
    if (!el || !onTileSizeChange) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomRef.current(px * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [px, Boolean(onTileSizeChange)]);
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

  const layoutOptions = React.useMemo(() => tileLayoutOptions(px, aspect), [px, aspect]);
  const byKey = React.useMemo(() => new Map(rows.map((r) => [rowKey(r), r])), [rows, rowKey]);
  const indexOf = React.useMemo(() => new Map(rows.map((r, i) => [rowKey(r), i])), [rows, rowKey]);

  const changeOne = (next: Selection) => {
    // Single: the one key pressed replaces what was chosen among the shown tiles.
    const outside = [...selection.selected].filter((k) => !shownKeys.has(k));
    const picked = next === "all" ? [] : [...next].map(String).filter((k) => shownKeys.has(k));
    selection.onChange(new Set([...outside, ...picked.slice(-1)]));
  };

  const list = (listRows: T[], scroll: boolean) => (
    <GridList
      aria-label={groups ? `${label}, ${groupHeading ? groupHeading(groupBy!(listRows[0] as T), listRows) : groupBy!(listRows[0] as T)}` : label}
      layout="grid"
      selectionMode={selectionMode}
      selectionBehavior={selectionBehavior}
      selectedKeys={new Set([...selection.selected].filter((k) => shownKeys.has(k)))}
      onSelectionChange={selectionMode === "single" ? changeOne : changeSelection}
      onAction={onAction ? (key) => void (byKey.has(String(key)) && onAction(byKey.get(String(key)) as T)) : undefined}
      disabledKeys={disabledKeys}
      data-strata-scroll={scroll ? "" : undefined}
      className={cn("min-w-0 outline-none", virtual && scroll ? "overflow-y-auto" : "grid gap-3")}
      style={virtual && scroll ? { height: maxHeight } : { gridTemplateColumns: `repeat(auto-fill, minmax(min(${px}px, 100%), 1fr))` }}
    >
      {listRows.map((row) => {
        const key = rowKey(row);
        const index = indexOf.get(key) ?? 0;
        const name = selection.rowLabel(row);
        const why = unselectableReason && !(selection.isSelectable?.(row) ?? true) ? unselectableReason(row) : undefined;
        const corner = badge?.(row);
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
            {selectionMode === "multiple" && <TileBox label={`Select ${name}`} />}
            {corner != null && <span className="absolute top-3 right-3">{corner}</span>}
            {detail?.(row) != null && <span className="truncate type-body-sm text-muted-foreground">{detail(row)}</span>}
            {why && <span className="truncate type-caption text-muted-foreground">{why}</span>}
          </GridListItem>
        );
      })}
    </GridList>
  );
  const grid = list(rows, true);

  return (
    <div
      ref={outer}
      className={cn("grid min-w-0 gap-3", className)}
      onMouseDownCapture={(e) => {
        shift.handlers.onMouseDown(e);
        notePress(e);
      }}
      onKeyDownCapture={(e) => {
        shift.handlers.onKeyDown(e);
        notePress(e);
      }}
      onKeyDown={(e) => {
        if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === "+" || e.key === "=") zoom(px * 1.25);
        else if (e.key === "-" || e.key === "_") zoom(px / 1.25);
        else if (e.key === "Escape" && selectionMode !== "none" && [...selection.selected].some((k) => shownKeys.has(k))) {
          selection.onChange(new Set([...selection.selected].filter((k) => !shownKeys.has(k))));
        } else return;
        e.preventDefault();
      }}
    >
      {selectionMode === "multiple" && (
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox label="Select all shown" checked={select.all.checked} disabled={select.all.disabled} onCheckedChange={select.all.toggle} />
          {hidden > 0 && (
            <>
              <span role="status" className="type-body-sm text-muted-foreground">{hidden === 1 ? "1 chosen is hidden by the filter" : `${hidden} chosen are hidden by the filter`}</span>
              <Button size="sm" variant="ghost" onPress={() => selection.onChange(new Set([...selection.selected].filter((k) => shownKeys.has(k))))}>Clear hidden</Button>
            </>
          )}
        </div>
      )}
      {groups ? (
        <div data-strata-scroll="" className="min-w-0 overflow-y-auto" style={{ maxHeight }}>
          {groups.map((g) => (
            <GroupSection
              key={g.key}
              heading={groupHeading ? groupHeading(g.key, g.rows) : g.key}
              rows={g.rows}
              rowKey={rowKey}
              selection={selection}
              folded={folded.has(g.key)}
              onFold={() => setFolded((f) => { const n = new Set(f); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
              multiple={selectionMode === "multiple"}
            >
              {list(g.rows, false)}
            </GroupSection>
          ))}
        </div>
      ) : virtual ? (
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

// One group: a sticky heading with a box for the group (mixed when some of it is chosen), a fold
// button that takes the tiles off the page, and the group's tiles. The box is `useSelectRows` for the
// group's rows, so it follows the same rules as "Select all shown": selectable tiles only, tiles
// outside the group left alone.
function GroupSection<T>({ heading, rows, rowKey, selection, folded, onFold, multiple, children }: { heading: string; rows: T[]; rowKey: (row: T) => string; selection: RowSelection<T>; folded: boolean; onFold: () => void; multiple: boolean; children: React.ReactNode }) {
  const group = useSelectRows(rows, rowKey, selection);
  return (
    <section aria-label={heading} className="grid gap-2 pb-3">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-background py-1">
        <Button size="sm" variant="ghost" aria-expanded={!folded} aria-label={`${folded ? "Unfold" : "Fold"} ${heading}`} onPress={onFold}>
          <ChevronDown aria-hidden className={cn("transition-state", folded && "-rotate-90")} />
        </Button>
        {multiple && <Checkbox label={`Select ${heading}`} hideLabel checked={group.all.checked} disabled={group.all.disabled} onCheckedChange={group.all.toggle} />}
        <h3 className="type-label">{heading}</h3>
        <span className="type-caption text-muted-foreground tabular-nums">{rows.length}</span>
      </header>
      {!folded && children}
    </section>
  );
}
