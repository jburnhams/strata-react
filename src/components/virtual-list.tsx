import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../lib/utils";

// A long list that keeps only its visible rows in the DOM (TanStack Virtual), for feeds, logs and
// pickers with hundreds of items. Rows are measured after render, so variable heights work; the
// estimate only sets the first paint. The list is a labelled, focusable region so it can be
// scrolled from the keyboard, and keeps list semantics with aria-setsize/aria-posinset so screen
// readers still hear "12 of 480". Under `virtualizeFrom` items it renders a plain list.
//
// `bounded` keeps a short list in the same scroll region (capped at `height`) that the virtual
// one uses, so a list that grows past `virtualizeFrom` while someone scrolls it (InfiniteList)
// does not jump from the page's flow into a box. `footer` renders after the last row, inside the
// scroll region: where InfiniteList puts its next-page row. Rows carry `data-index` in both modes.

/** A list that renders only its visible rows (TanStack Virtual) from `virtualizeFrom` items, keeping list semantics for screen readers. */
export function VirtualList<T>({
  label,
  items,
  itemKey,
  children,
  estimateSize = 48,
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
  estimateSize?: number;
  height?: number;
  virtualizeFrom?: number;
  /** Scroll inside a region capped at `height` even below `virtualizeFrom`, so growing past it changes nothing on screen. */
  bounded?: boolean;
  /** After the last row, inside the scroll region (a next-page row, an end note). */
  footer?: React.ReactNode;
  className?: string;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const virtual = items.length >= virtualizeFrom;
  const virtualizer = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => estimateSize,
    overscan: 6,
    initialRect: { width: 0, height },
  });

  // Built only when it is shown: a virtual list must not render every row it keeps out of the DOM.
  const plain = () => (
    <ul aria-label={label} className={cn("grid min-w-0", !bounded && !footer && className)}>
      {items.map((item, i) => (
        <li key={itemKey(item)} data-index={i} className="border-t border-border first:border-t-0">
          {children(item, i)}
        </li>
      ))}
    </ul>
  );

  if (!virtual && !bounded) {
    return footer ? (
      <div className={cn("min-w-0", className)}>
        {plain()}
        {footer}
      </div>
    ) : (
      plain()
    );
  }

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-strata-scroll=""
      className={cn("min-w-0 overflow-y-auto", className)}
      style={virtual ? { height } : { maxHeight: height }}
    >
      {virtual ? (
        <ul aria-label={label} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const item = items[v.index];
            return (
              <li
                key={itemKey(item)}
                ref={virtualizer.measureElement}
                data-index={v.index}
                aria-setsize={items.length}
                aria-posinset={v.index + 1}
                className={cn("absolute inset-x-0 top-0", v.index > 0 && "border-t border-border")}
                style={{ translate: `0 ${v.start}px` }}
              >
                {children(item, v.index)}
              </li>
            );
          })}
        </ul>
      ) : (
        plain()
      )}
      {footer}
    </div>
  );
}
