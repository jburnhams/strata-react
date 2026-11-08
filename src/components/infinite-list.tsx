import * as React from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { DataView } from "./data-view";
import { VirtualList } from "./virtual-list";
import type { InfiniteLoad } from "../query/infinite";
import { useInView } from "../lib/in-view";

// A list that loads its next page as the person nears the end: the view for `useInfiniteLoad`.
// It is DataView for the first page (skeleton, error with Try again, empty state, all required)
// and VirtualList for the rows (virtualised from 100, so a long session stays fast), with one row
// after the last item that is always in one of four states:
//
// - more to come: an IntersectionObserver sentinel with a root margin, so the next page is asked
//   for before the person reaches the end, and a real "Show more" button behind it. The button is
//   the keyboard and screen-reader path (an automatic load is invisible to them) and the fallback
//   where the observer never fires.
// - loading: `moreSkeleton`, mirroring the rows that are coming, not a spinner, and a polite
//   status so a screen reader hears it.
// - a later page failed: an alert row with the reason and Try again. The items already loaded
//   stay; a failed page 4 is not a failed list. The sentinel stops asking until Try again, so a
//   dead server is not called in a loop.
// - the end: `end`, if given ("That's every firing since March"), so the person knows it is all.
//
// `keepAtLeast` loads more whenever fewer items than that are held: a queue people work through
// (answered items `dismiss`ed) refills before it runs dry, even when nothing scrolls. Showing
// more by button moves focus to the first new item, because the button the person pressed is
// gone. The list scrolls in its own region (`height`) from the first page, so passing 100 items
// and switching to virtual rows changes nothing on screen.

/** The infinite list's props. */
export type InfiniteListProps<T> = {
  state: InfiniteLoad<T>;
  /** The list's accessible name, e.g. "Firing log, newest first". */
  label: string;
  children: (item: T, index: number) => React.ReactNode;
  /** The first load. Mirrors the final layout, so nothing jumps when data arrives. */
  skeleton: React.ReactNode;
  /** What goes here and how to add it, when the first page is empty and there are no more. */
  empty: React.ReactNode;
  /** The button behind the sentinel, in the product's words: "Show older firings". */
  moreLabel: string;
  /** The rows of a page on its way. Defaults to `skeleton`. */
  moreSkeleton?: React.ReactNode;
  /** After the last page: say that this is everything. */
  end?: React.ReactNode;
  /** How far before the end the next page is asked for (IntersectionObserver `rootMargin`). */
  rootMargin?: string;
  /** Load more whenever fewer than this many items are held. */
  keepAtLeast?: number;
  estimateSize?: number;
  height?: number;
  virtualizeFrom?: number;
  className?: string;
};

/** A cursor-paged list for `useInfiniteLoad`: DataView's first-page states, virtual rows, and a next-page row that loads on approach, shows a skeleton, or says why it failed with Try again. */
export function InfiniteList<T>({
  state,
  label,
  children,
  skeleton,
  empty,
  moreLabel,
  moreSkeleton = skeleton,
  end,
  rootMargin = "400px",
  keepAtLeast = 0,
  estimateSize,
  height = 480,
  virtualizeFrom,
  className,
}: InfiniteListProps<T>) {
  const { more, itemKey } = state;
  const held = state.status === "ready" ? state.data.length : 0;
  const box = React.useRef<HTMLDivElement>(null);
  const near = useInView({ active: state.status === "ready" && more.hasMore, rootMargin });

  // Load on approach, and keep a worked-through queue topped up. Not after a failure: that waits
  // for Try again. Re-runs when a page lands, so a sentinel still in view asks for the next one.
  const { hasMore, loadingMore, error, loadMore } = more;
  React.useEffect(() => {
    if (state.status !== "ready" || !hasMore || loadingMore || error) return;
    if (near.inView || held < keepAtLeast) loadMore();
  }, [state.status, hasMore, loadingMore, error, near.inView, held, keepAtLeast, loadMore]);

  // After a click on Show more or Try again, focus the first new item: the button is gone.
  const focusFrom = React.useRef<number | null>(null);
  const loadByHand = () => {
    focusFrom.current = held;
    loadMore();
  };
  React.useEffect(() => {
    const from = focusFrom.current;
    if (from === null || loadingMore) return;
    if (held > from) {
      const row = box.current?.querySelector<HTMLElement>(`li[data-index="${from}"]`);
      if (row) {
        row.tabIndex = -1;
        row.focus();
      }
      focusFrom.current = null;
    } else if (error || !hasMore) focusFrom.current = null;
  }, [held, loadingMore, error, hasMore]);

  const footer = (
    <div>
      {hasMore && !error && <div ref={near.ref} aria-hidden className="h-px" />}
      {loadingMore ? (
        <div aria-hidden className="border-t border-border">{moreSkeleton}</div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-start gap-3 border-t border-border bg-danger-subtle px-3 py-2 text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="min-w-0 flex-1 type-body-sm">{error}</p>
          <Button size="sm" onClick={loadByHand}>
            <RotateCcw aria-hidden />
            Try again
          </Button>
        </div>
      ) : hasMore ? (
        <div className="border-t border-border py-3">
          <Button size="sm" onClick={loadByHand}>
            {moreLabel}
          </Button>
        </div>
      ) : (
        end && <div className="border-t border-border py-3 type-body-sm text-muted-foreground">{end}</div>
      )}
      <p role="status" className="sr-only">
        {loadingMore ? "Loading more" : ""}
      </p>
    </div>
  );

  return (
    <DataView
      state={state}
      isEmpty={(items) => items.length === 0 && !hasMore}
      skeleton={skeleton}
      empty={empty}
      className={className}
    >
      {(items) => (
        <div ref={box} aria-busy={loadingMore || undefined}>
          <VirtualList
            label={label}
            items={items}
            itemKey={itemKey}
            estimateSize={estimateSize}
            height={height}
            virtualizeFrom={virtualizeFrom}
            bounded
            footer={footer}
          >
            {children}
          </VirtualList>
        </div>
      )}
    </DataView>
  );
}
