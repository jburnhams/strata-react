import * as React from "react";
import { GridLayout, GridList, GridListItem, RouterProvider, Virtualizer } from "react-aria-components";
import { Size } from "react-stately";
import { useHref, useNavigate } from "react-router";
import { cn } from "../lib/utils";
import { ThumbnailSkeleton } from "./thumbnail";

// A grid of pictures that each go somewhere: a book's pages, a photo set, stills (strata-react
// issue #240, from strata-scan's Book screen; the same hand-built grid sat in Bright Horizons,
// strata-360 and diary-study). `SelectableGrid` is selection drawn as a grid, so a press toggles
// and a box and `rowLabel` assume a bulk action; here a press opens the tile and there is nothing
// to choose. The two share their layout (this file owns the tile sizes, aspects and the
// `GridLayout` options), so a screen that has both draws the same grid.
//
// It is React Aria's GridList with `layout="grid"`, which is what `SelectableGrid` uses: a labelled
// list whose arrow keys move across and down the tiles, Home and End, type-ahead by name, and Enter
// or a press to open. Each tile is a `GridListItem` with an `href` (a route in the app, or any URL)
// or an `onAction`, one of them required by the type, so a tile cannot be written that does nothing.
// `href` goes through React Aria's `RouterProvider` bridged to React Router (`useNavigate`,
// `useHref`), so a route path navigates in the app, honours the router's basename, and a modified
// click still opens the browser's own way; an absolute URL leaves the app. Checked in
// `useSelectableItem`: a link item is "opened" through the provider's `navigate` on press or Enter,
// and selection is off, so there is no checkbox and no selection state to hide.
//
// A tile is a picture in a frame of fixed aspect (so nothing moves as images load; an <img> or
// `Thumbnail` fills it), an optional `badge` in the picture's corner (a `Status` for "Look"; it sits
// on the picture, so give it the role's surface, which `Status` does), a `caption` (one line, the
// name) and a `detail` line. The tile is named for assistive technology by `itemLabel`, one
// sentence ("Page 14, 4, 368 words, needs a look"), not by whatever its pieces happen to read.
//
// Loading and empty are `DataView`'s: `TileGridSkeleton` is the same grid of `ThumbnailSkeleton`s
// at the same sizes, for `DataView skeleton=`, and `empty=` is the app's `EmptyState`. From
// `virtualizeFrom` tiles (100, as the list and table) the grid is virtualised with React Aria's
// `GridLayout` in its own scroll box, as `SelectableGrid` is.

/** The frame each picture is drawn in. */
export type TileAspect = "square" | "portrait" | "landscape";

/** Smallest tile width: `sm` 96px (dense crops), `md` 144px, `lg` 192px. Tiles grow to fill the row. */
export type TileSize = "sm" | "md" | "lg";

export const minWidth: Record<TileSize, number> = { sm: 96, md: 144, lg: 192 };
export const aspectClass: Record<TileAspect, string> = { square: "aspect-square", portrait: "aspect-3/4", landscape: "aspect-4/3" };
const aspectRatio: Record<TileAspect, number> = { square: 1, portrait: 4 / 3, landscape: 3 / 4 };
const thumbnailAspect: Record<TileAspect, number> = { square: 1, portrait: 3 / 4, landscape: 4 / 3 };
// gap-3, in px.
const GAP = 12;
// The caption, detail line and the tile's padding, for the first estimate of a tile's height.
const TILE_CHROME = 40;

/** A tile size as pixels: a named size's minimum width, or the number itself (a continuous size, issue #246). */
export const tileWidth = (size: TileSize | number): number => (typeof size === "number" ? size : minWidth[size]);

/** `GridLayout` options for tiles of this size and aspect: they grow from the minimum width to fill the row, and each row is as tall as its tallest tile as measured. */
export function tileLayoutOptions(tileSize: TileSize | number, aspect: TileAspect | number) {
  const w = tileWidth(tileSize);
  if (typeof aspect === "number") return { minItemSize: new Size(w, Math.round(w / aspect) + TILE_CHROME), minSpace: new Size(GAP, GAP) };
  return {
    minItemSize: new Size(w, Math.round(w * aspectRatio[aspect]) + TILE_CHROME),
    minSpace: new Size(GAP, GAP),
  };
}

type TileGridBase<T> = {
  /** Names the grid of tiles: "Pages of the Punch book". */
  label: string;
  items: T[];
  itemKey: (item: T) => string;
  /** The tile's name for assistive technology, one sentence: "Page 14, 4, 368 words, needs a look". */
  itemLabel: (item: T) => string;
  /** The picture, drawn to fill a frame of `aspect`. An `<img className="size-full object-cover">` or a `Thumbnail`. */
  renderImage: (item: T) => React.ReactNode;
  /** One line under the picture: the name ("Page 14, 4"). Truncated. */
  caption?: (item: T) => React.ReactNode;
  /** A quieter line under the caption: "368 words", "blank". Truncated. */
  detail?: (item: T) => React.ReactNode;
  /** In the picture's top right corner: a `Status` ("Look"). Return `null` for a tile with nothing to say. */
  badge?: (item: T) => React.ReactNode;
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

/** A tile always does something: it is a link (`href`: a route in the app or a URL) or an action, never neither. */
export type TileGridProps<T> = TileGridBase<T> &
  (
    | {
        /** Where a tile goes: a route path in this app (client navigation, the router's basename applied) or a full URL. */
        href: (item: T) => string;
        onAction?: (item: T) => void;
      }
    | { href?: undefined; onAction: (item: T) => void }
  );

/** A grid of picture tiles that open something: a labelled list of links (or actions), two-dimensional arrow keys, a caption, a detail line and a corner badge on each, virtualised from `virtualizeFrom` tiles. No selection: use `SelectableGrid` for that. */
export function TileGrid<T>({
  label,
  items,
  itemKey,
  itemLabel,
  renderImage,
  caption,
  detail,
  badge,
  href,
  onAction,
  aspect = "square",
  tileSize = "md",
  virtualizeFrom = 100,
  maxHeight = 480,
  className,
}: TileGridProps<T>) {
  const navigate = useNavigate();
  const virtual = items.length >= virtualizeFrom;
  const layoutOptions = React.useMemo(() => tileLayoutOptions(tileSize, aspect), [tileSize, aspect]);
  const byKey = React.useMemo(() => new Map(items.map((item) => [itemKey(item), item])), [items, itemKey]);

  const grid = (
    <GridList
      aria-label={label}
      layout="grid"
      data-strata-scroll=""
      onAction={onAction ? (key) => void (byKey.has(String(key)) && onAction(byKey.get(String(key)) as T)) : undefined}
      className={cn("min-w-0 outline-none", virtual ? "overflow-y-auto" : "grid gap-3")}
      style={virtual ? { height: maxHeight } : { gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth[tileSize]}px, 100%), 1fr))` }}
    >
      {items.map((item, index) => {
        const key = itemKey(item);
        const corner = badge?.(item);
        return (
          <GridListItem
            key={key}
            id={key}
            textValue={itemLabel(item)}
            aria-label={itemLabel(item)}
            href={href?.(item)}
            data-index={index}
            className="group relative grid min-w-0 cursor-pointer gap-1.5 rounded-surface border border-transparent p-1.5 select-none outline-offset-2 transition-state hover:bg-surface-sunken"
          >
            <span className={cn("block overflow-hidden rounded-control bg-muted *:size-full *:object-cover", aspectClass[aspect])}>
              {renderImage(item)}
            </span>
            {corner != null && <span className="absolute top-3 right-3">{corner}</span>}
            {caption?.(item) != null && <span className="truncate type-label">{caption(item)}</span>}
            {detail?.(item) != null && <span className="truncate type-body-sm text-muted-foreground">{detail(item)}</span>}
          </GridListItem>
        );
      })}
    </GridList>
  );

  return (
    <RouterProvider navigate={(to) => void navigate(to)} useHref={useHref}>
      <div className={cn("min-w-0", className)}>
        {virtual ? (
          <Virtualizer layout={GridLayout} layoutOptions={layoutOptions}>
            {grid}
          </Virtualizer>
        ) : (
          grid
        )}
      </div>
    </RouterProvider>
  );
}

/** The loading shape of a `TileGrid`: `count` picture boxes in the same grid at the same sizes, for a `DataView` skeleton, so nothing moves when the tiles arrive. */
export function TileGridSkeleton({ count = 12, aspect = "square", tileSize = "md", className }: { count?: number; aspect?: TileAspect; tileSize?: TileSize; className?: string }) {
  return (
    <div aria-hidden className={cn("grid min-w-0 gap-3", className)} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth[tileSize]}px, 100%), 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-1.5 p-1.5">
          <ThumbnailSkeleton aspect={thumbnailAspect[aspect]} />
          <span className="h-4 w-2/3 rounded-control bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** The loading shape of a `SelectableGrid`: `count` picture boxes at the grid's tile size and shape, for a `DataView` skeleton. With `shapes` (widths over heights, cycled) the boxes are in rows at their own shapes, as `aspect="natural"` draws them. */
export function SelectableGridSkeleton({ count = 24, aspect = "square", tileSize = "md", shapes, className }: { count?: number; aspect?: TileAspect | number; tileSize?: TileSize | number; shapes?: readonly number[]; className?: string }) {
  const px = tileWidth(tileSize);
  if (shapes?.length) {
    return (
      <div aria-hidden className={cn("flex min-w-0 flex-wrap gap-3", className)}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="p-1.5" style={{ width: Math.round(shapes[i % shapes.length]! * px) + 14 }}>
            <ThumbnailSkeleton aspect={shapes[i % shapes.length]!} />
          </div>
        ))}
      </div>
    );
  }
  const ratio = typeof aspect === "number" ? aspect : thumbnailAspect[aspect];
  return (
    <div aria-hidden className={cn("grid min-w-0 gap-3", className)} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${px}px, 100%), 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="p-1.5">
          <ThumbnailSkeleton aspect={ratio} />
        </div>
      ))}
    </div>
  );
}
