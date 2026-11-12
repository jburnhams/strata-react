import * as React from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { ListStateContext } from "react-aria-components";
import { Button } from "./button";
import { DataView, type LoadFailure } from "./data-view";
import { VirtualList } from "./virtual-list";
import type { InfiniteLoad } from "../query/infinite";
import { useInView } from "../lib/in-view";
import { cn } from "../lib/utils";

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
//
// Not every paged view is a list in a box (strata-react issue #49, from the Tubes viewer, whose
// videos are a responsive card grid that scrolls with the page). So the next-page row is its own
// export, `LoadMore`, which an app puts after any list or grid it draws itself, and InfiniteList
// is built on it. `scroll="page"` is the same in InfiniteList: no scroll region of its own and no
// virtual rows, the items in a plain `ul` laid out by `listClassName` (a grid), and the sentinel
// watching the viewport. Virtual rows need a box of known height, which a page-scrolled grid is
// not; a feed long enough to need them belongs in the region. `error` and `moreError` replace the
// look of a failed first page and a failed later page, as DataView's `error` does.

// The row a virtualised list draws for `LoadMore` is recycled when its height changes (button to
// skeleton to button), which remounts `LoadMore` and drops what it remembers. The index to focus after
// a click on Show more therefore lives in the list around it (InfiniteList), reached through this
// context; a `LoadMore` used on its own keeps it in itself.
const PendingFocus = React.createContext<React.MutableRefObject<number | null> | null>(null);

/** The next-page row's props: `InfiniteList`'s, for a list or grid the app draws itself. */
export type LoadMoreProps<T> = {
  state: InfiniteLoad<T>;
  /** The button behind the sentinel, in the product's words: "Show older firings". */
  moreLabel: string;
  /** The items of a page on its way, mirroring the ones already drawn. */
  moreSkeleton: React.ReactNode;
  /** After the last page: say that this is everything. */
  end?: React.ReactNode;
  /** How far before the end the next page is asked for (IntersectionObserver `rootMargin`). Default 400px. */
  rootMargin?: string;
  /** Load more whenever fewer than this many items are held. */
  keepAtLeast?: number;
  /** Draws a failed later page, given the reason and the Try again. Rendered inside a `role="alert"` box. */
  error?: (failure: LoadFailure) => React.ReactNode;
  className?: string;
};

function MoreFailed({ message, retry }: LoadFailure) {
  return (
    <div className="flex flex-wrap items-start gap-3 border-t border-border bg-danger-subtle px-3 py-2 text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 type-body-sm">{message}</p>
      <Button size="sm" onClick={retry}>
        <RotateCcw aria-hidden />
        Try again
      </Button>
    </div>
  );
}

const defaultMoreError = (failure: LoadFailure) => <MoreFailed {...failure} />;

/**
 * The row after a cursor-paged list or grid: loads the next page as it nears the screen, shows
 * `moreSkeleton` while it comes, says why it failed with Try again, offers Show more for the
 * keyboard, and `end` after the last page. After Show more it focuses the first new item: mark
 * each item with `data-index` and put this row beside the list, in the same parent.
 */
export function LoadMore<T>({
  state,
  moreLabel,
  moreSkeleton,
  end,
  rootMargin = "400px",
  keepAtLeast = 0,
  error: drawError = defaultMoreError,
  className,
}: LoadMoreProps<T>) {
  const { more } = state;
  const ready = state.status === "ready";
  const held = ready ? state.data.length : 0;
  const box = React.useRef<HTMLDivElement>(null);
  const near = useInView({ active: ready && more.hasMore, rootMargin });
  // Inside a VirtualList the rows are React Aria's grid rows, which keep their own idea of which row
  // has focus; moving focus to a new row has to tell that state, or it takes focus back.
  const grid = React.useContext(ListStateContext);

  // Load on approach, and keep a worked-through queue topped up. Not after a failure: that waits
  // for Try again. Re-runs when a page lands, so a sentinel still in view asks for the next one.
  const { hasMore, loadingMore, error, loadMore } = more;
  React.useEffect(() => {
    if (!ready || !hasMore || loadingMore || error) return;
    if (near.inView || held < keepAtLeast) loadMore();
  }, [ready, hasMore, loadingMore, error, near.inView, held, keepAtLeast, loadMore]);

  // After a click on Show more or Try again, focus the first new item: the button is gone.
  const own = React.useRef<number | null>(null);
  const shared = React.useContext(PendingFocus);
  const focusFrom = shared ?? own;
  const loadByHand = () => {
    focusFrom.current = held;
    loadMore();
  };
  React.useEffect(() => {
    const from = focusFrom.current;
    if (from === null || loadingMore) return;
    if (held <= from) {
      if (error || !hasMore) focusFrom.current = null;
      return;
    }
    // The new row may not be in the DOM yet: a virtualised list draws it a frame after its data
    // arrives. Look for it for a few frames, then give up rather than wait for ever.
    let frames = 0;
    let frame = 0;
    const find = () => {
      const scope = box.current?.closest<HTMLElement>("[data-strata-scroll]") ?? box.current?.parentElement;
      const item = scope?.querySelector<HTMLElement>(`[data-index="${from}"]`);
      if (!item) {
        if (frames++ < 30) frame = requestAnimationFrame(find);
        else focusFrom.current = null;
        return;
      }
      const key = item.getAttribute("data-key");
      if (grid && key !== null) {
        grid.selectionManager.setFocused(true);
        grid.selectionManager.setFocusedKey(key);
      }
      item.tabIndex = -1;
      item.focus();
      focusFrom.current = null;
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, [held, loadingMore, error, hasMore, grid]);

  if (!ready) return null;
  return (
    <div ref={box} className={className}>
      {hasMore && !error && <div ref={near.ref} aria-hidden className="h-px" />}
      {loadingMore ? (
        <div aria-hidden className="border-t border-border">{moreSkeleton}</div>
      ) : error ? (
        <div role="alert">{drawError({ message: error, retry: loadByHand })}</div>
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
}

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
  /** `region` (default): rows in a scroll region of `height`, virtual from `virtualizeFrom`. `page`: a plain list that scrolls with the page, laid out by `listClassName`. */
  scroll?: "region" | "page";
  /** With `scroll="page"`: the classes of the `ul`, such as a responsive grid (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`). */
  listClassName?: string;
  /** Draws a failed first page. Defaults to DataView's `LoadError`. */
  error?: (failure: LoadFailure) => React.ReactNode;
  /** Draws a failed later page. Defaults to a danger row with Try again. */
  moreError?: (failure: LoadFailure) => React.ReactNode;
  estimateSize?: number;
  height?: number;
  virtualizeFrom?: number;
  className?: string;
};

/** A cursor-paged list for `useInfiniteLoad`: DataView's first-page states, virtual rows (or a page-scrolled grid), and a `LoadMore` row that loads on approach, shows a skeleton, or says why it failed with Try again. */
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
  scroll = "region",
  listClassName,
  error,
  moreError,
  estimateSize,
  height = 480,
  virtualizeFrom,
  className,
}: InfiniteListProps<T>) {
  const { more, itemKey } = state;
  const pendingFocus = React.useRef<number | null>(null);
  // The queue refill lives here, not in LoadMore: in a virtualised region the footer row is only
  // mounted while it is near the viewport, and a queue below `keepAtLeast` must refill regardless.
  const ready = state.status === "ready";
  const held = ready ? state.data.length : 0;
  const { hasMore, loadingMore, error: moreFailure, loadMore } = more;
  React.useEffect(() => {
    if (ready && hasMore && !loadingMore && !moreFailure && held < keepAtLeast) loadMore();
  }, [ready, hasMore, loadingMore, moreFailure, held, keepAtLeast, loadMore]);
  const footer = (
    <PendingFocus.Provider value={pendingFocus}>
    <LoadMore
      // A grid's cards have their own edges, so the row keeps a gap from them.
      className={scroll === "page" ? "mt-4" : undefined}
      state={state}
      moreLabel={moreLabel}
      moreSkeleton={moreSkeleton}
      end={end}
      rootMargin={rootMargin}
      error={moreError}
    />
    </PendingFocus.Provider>
  );

  return (
    <DataView
      state={state}
      isEmpty={(items) => items.length === 0 && !more.hasMore}
      skeleton={skeleton}
      empty={empty}
      error={error}
      className={className}
    >
      {(items) =>
        scroll === "page" ? (
          <div aria-busy={more.loadingMore || undefined}>
            <ul aria-label={label} className={cn("min-w-0", listClassName ?? "grid")}>
              {items.map((item, i) => (
                <li key={itemKey(item)} data-index={i} className="min-w-0">
                  {children(item, i)}
                </li>
              ))}
            </ul>
            {footer}
          </div>
        ) : (
          <div aria-busy={more.loadingMore || undefined}>
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
        )
      }
    </DataView>
  );
}
