import * as React from "react";
import { Collection, GridList, GridListItem, ListLayout, Virtualizer } from "react-aria-components";
import { cn } from "../lib/utils";

// A long list that keeps only its visible rows in the DOM, for feeds, logs and pickers with hundreds
// of items. It is React Aria's `GridList` inside its `Virtualizer` (`ListLayout`), not a list we
// virtualise ourselves: one keyboard model (arrows between rows, Home and End, type-ahead is off
// because rows are arbitrary content), one set of ARIA (`row`s in a labelled `grid`, with
// `aria-rowindex` and the row count so a screen reader still hears "12 of 480"), and focus that
// survives a row scrolling out of the DOM. Rows are measured after render, so variable heights
// work; `estimateSize` only sets the first paint, and `rowHeight` says every row is exactly that
// tall, which skips measuring (and is what a test DOM, which does no layout, needs). Under
// `virtualizeFrom` items it renders the same grid without the Virtualizer, so the roles do not
// change as a list grows past it.
//
// The scroll region is the grid itself (`data-strata-scroll`, which `useInView` looks for), so there
// is no wrapper region: the grid is labelled and focusable, and scrolls from the keyboard.
// `bounded` keeps a short list in the same scroll box (capped at `height`) that the virtual one
// uses, so a list that grows past `virtualizeFrom` while someone scrolls it (InfiniteList) does not
// jump from the page's flow into a box. `footer` is one more row after the last item, inside the
// scroll box: where InfiniteList puts its next-page row (a virtualised collection can only hold
// rows, so the footer is one). Rows carry `data-index` in both modes.
//
// This replaced a list built on TanStack Virtual with `ul` and `li` (Jonathan, 2026-11-12). The roles
// changed from list and listitem to grid and row; UPGRADING.md has it.

const FOOTER = "\u0000footer";

/** A list that renders only its visible rows (React Aria's GridList and Virtualizer) from `virtualizeFrom` items, with arrow-key navigation between rows. */
export function VirtualList<T>({
  label,
  items,
  itemKey,
  children,
  estimateSize = 48,
  rowHeight,
  height = 480,
  virtualizeFrom = 100,
  bounded = false,
  footer,
  className,
}: {
  label: string;
  items: T[];
  itemKey: (item: T) => string;
  children: (item: T, index: number) => React.ReactNode;
  /** First-paint height of a row, in px; rows are measured after they render. */
  estimateSize?: number;
  /** Every row is exactly this tall (px): nothing is measured. */
  rowHeight?: number;
  height?: number;
  virtualizeFrom?: number;
  /** Scroll inside a box capped at `height` even below `virtualizeFrom`, so growing past it changes nothing on screen. */
  bounded?: boolean;
  /** After the last row, inside the scroll box (a next-page row, an end note). */
  footer?: React.ReactNode;
  className?: string;
}) {
  const virtual = items.length >= virtualizeFrom;
  const rows = React.useMemo(() => items.map((item, index) => ({ id: itemKey(item), item, index })), [items, itemKey]);
  const layoutOptions = React.useMemo(() => (rowHeight ? { rowHeight } : { estimatedRowHeight: estimateSize }), [rowHeight, estimateSize]);
  // A bounded list (InfiniteList) is virtualised from its first row, so its scroll box and its
  // rows are never remounted as it grows past `virtualizeFrom`: a remount would reset the scroll
  // position in the middle of a scroll. The Virtualizer only draws what is visible, so a short
  // list costs nothing extra.
  const virtualise = virtual || bounded;
  const scrolls = virtualise;

  const list = (
    <GridList
      aria-label={label}
      selectionMode="none"
      data-strata-scroll=""
      className={cn("min-w-0 outline-none", scrolls && "overflow-y-auto", className)}
      style={scrolls ? (virtual ? { height } : { maxHeight: height }) : undefined}
    >
      <Collection items={rows}>
        {(row) => (
          <GridListItem id={row.id} textValue={row.id} data-index={row.index} className={cn("min-w-0 outline-offset-[-2px]", row.index > 0 && "border-t border-border")}>
            {children(row.item, row.index)}
          </GridListItem>
        )}
      </Collection>
      {footer && (
        <GridListItem id={FOOTER} textValue="More" className="min-w-0">
          {footer}
        </GridListItem>
      )}
    </GridList>
  );

  return virtualise ? (
    <Virtualizer layout={ListLayout} layoutOptions={layoutOptions}>
      {list}
    </Virtualizer>
  ) : (
    list
  );
}
