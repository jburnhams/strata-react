import * as React from "react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { Load } from "../components/data-view";
import { describeHttpError, type DescribeError } from "./index";

// Cursor-paged reads, the Strata way. `useLoad` covers a read that arrives whole; a feed, a log or
// a triage queue arrives a page at a time. This is the same bridge for those: TanStack's
// useInfiniteQuery underneath, a `Load<T[]>` on top (so `DataView` takes it unchanged for the
// first page's loading, error and empty states), and a `more` object for everything after it.
//
// Three opinions:
// 1. The cursor is "after the last item held", never an offset. `nextCursor` is handed the items
//    the person can see. In a queue people work through (answered reviews, archived firings),
//    items leave the server's list between pages, and an offset would skip the ones that moved
//    up to fill the gap.
// 2. Items have keys. Pages are merged by key, so an item that shifts across a page boundary is
//    shown once, and `dismiss(key)` hides one at once (an optimistic remove, paired with
//    useUndoable) without the app rewriting TanStack's page cache by hand.
// 3. A later page failing is not the list failing. The held items stay; `more.error` says what
//    happened and `more.loadMore` is the Try again. Only a failed first page is a `Load` error.

/** The state of the pages after the first: whether there are more, whether one is on its way, and why the last one failed. */
export type More = {
  /** The server has said there is another page. */
  hasMore: boolean;
  /** A page after the first is being fetched. */
  loadingMore: boolean;
  /** Why the last page after the first failed, for a person. Cleared when a retry succeeds. */
  error?: string;
  /** Fetch the next page; also the Try again after `error`. Does nothing while one is loading or when there are no more. */
  loadMore: () => void;
};

/** A cursor-paged read: a `Load<T[]>` of the items held (so `DataView` takes it), plus the next page's state and keyed removal. */
export type InfiniteLoad<T> = Load<T[]> & {
  more: More;
  itemKey: (item: T) => string;
  /** Hide an item at once (an optimistic removal). The cursor moves to the last item still held. */
  dismiss: (key: string) => void;
  /** Show a dismissed item again: the Undo of `dismiss`. */
  restore: (key: string) => void;
};

/** Options for `useInfiniteLoad`. */
export type InfiniteLoadOptions<T, Page, Cursor, K extends QueryKey> = {
  queryKey: K;
  /** Fetch one page. `cursor` is undefined for the first page, else what `nextCursor` returned. */
  queryFn: (context: { cursor: Cursor | undefined; signal: AbortSignal }) => Promise<Page>;
  /** The items in a page. For an API that returns a bare array, `(page) => page`. */
  items: (page: Page) => T[];
  /** A stable key per item: merges pages, and is what `dismiss` takes. */
  itemKey: (item: T) => string;
  /**
   * The cursor for the next page, or undefined when there are no more. `held` is every item the
   * person can see, in order, so "after the last item held" is `held.at(-1)?.id`.
   */
  nextCursor: (lastPage: Page, held: T[]) => Cursor | undefined;
  describeError?: DescribeError;
  enabled?: boolean;
  staleTime?: number;
};

/** `useInfiniteQuery` for cursor-paged data, returned as an `InfiniteLoad<T>` for `InfiniteList` (or `DataView`). */
export function useInfiniteLoad<T, Page, Cursor = string, K extends QueryKey = QueryKey>({
  queryKey,
  queryFn,
  items,
  itemKey,
  nextCursor,
  describeError = describeHttpError,
  enabled,
  staleTime,
}: InfiniteLoadOptions<T, Page, Cursor, K>): InfiniteLoad<T> {
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set());
  // TanStack calls getNextPageParam outside render; it reads the latest dismissals and accessors.
  const latest = React.useRef({ dismissed, items, itemKey, nextCursor });
  latest.current = { dismissed, items, itemKey, nextCursor };

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => queryFn({ cursor: (pageParam as Cursor | null) ?? undefined, signal }),
    initialPageParam: null as Cursor | null,
    getNextPageParam: (lastPage, pages) => {
      const { dismissed: hidden, items: of, itemKey: key, nextCursor: next } = latest.current;
      return next(lastPage, held(pages, of, key, hidden)) ?? null;
    },
    enabled,
    staleTime,
  });

  const pages = query.data?.pages;
  // Keyed on the pages and dismissals only, so inline `items`/`itemKey` arrows do not hand the
  // list a new array every render.
  const list = React.useMemo(
    () => (pages ? held(pages, latest.current.items, latest.current.itemKey, dismissed) : undefined),
    [pages, dismissed],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;
  const loadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const dismiss = React.useCallback((key: string) => setDismissed((s) => new Set(s).add(key)), []);
  const restore = React.useCallback(
    (key: string) =>
      setDismissed((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      }),
    [],
  );

  const more: More = {
    hasMore: Boolean(hasNextPage),
    loadingMore: isFetchingNextPage,
    error: query.isFetchNextPageError ? describeError(query.error) : undefined,
    loadMore,
  };
  const extra = { more, itemKey, dismiss, restore };
  if (list) return { status: "ready", data: list, ...extra };
  if (query.status === "error") return { status: "error", message: describeError(query.error), retry: () => void refetch(), ...extra };
  return { status: "loading", ...extra };
}

/** Every page's items, in order, once each by key, without the dismissed ones. */
function held<T, Page>(pages: Page[], items: (page: Page) => T[], itemKey: (item: T) => string, dismissed: ReadonlySet<string>) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages)
    for (const item of items(page)) {
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!dismissed.has(key)) out.push(item);
    }
  return out;
}
