import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../lib/utils";

// A long list that keeps only its visible rows in the DOM (TanStack Virtual), for feeds, logs and
// pickers with hundreds of items. Rows are measured after render, so variable heights work; the
// estimate only sets the first paint. The list is a labelled, focusable region so it can be
// scrolled from the keyboard, and keeps list semantics with aria-setsize/aria-posinset so screen
// readers still hear "12 of 480". Under `virtualizeFrom` items it renders a plain list.

export function VirtualList<T>({
  label,
  items,
  itemKey,
  children,
  estimateSize = 48,
  height = 480,
  virtualizeFrom = 100,
  className,
}: {
  label: string;
  items: T[];
  itemKey: (item: T) => string;
  children: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  height?: number;
  virtualizeFrom?: number;
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

  if (!virtual) {
    return (
      <ul aria-label={label} className={cn("grid min-w-0", className)}>
        {items.map((item, i) => (
          <li key={itemKey(item)} className="border-t border-border first:border-t-0">
            {children(item, i)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("min-w-0 overflow-y-auto", className)}
      style={{ height }}
    >
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
    </div>
  );
}
