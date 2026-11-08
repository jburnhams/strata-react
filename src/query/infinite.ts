import * as React from "react";
import { hashKey, useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { Load } from "../components/data-view";
import { describeHttpError, staleOf, type DescribeError } from "./index";

// Cursor-paged reads, the Strata way. `useLoad` covers a read that arrives whole; a feed, a log or
// a triage queue arrives a page at a time. This is the same bridge for those: TanStack's
// useInfiniteQuery underneath, a `Load<T[]>` on top (so `DataView` takes it unchanged for the
// first page's loading, error and empty states), and a `more` object for everything after it.
//
// Three opinions:
// 1. The cursor is "after the last item held", never an offset, and the hook works it out: the
//    app says how to make a cursor from an item (`cursorAfter`) and whether a page says there are
//    more (`hasMore`). In a queue people work through (answered reviews, archived firings), items
//    leave the server's list between pages, and an offset would skip the ones that moved up to
//    fill the gap. Two cases fall back to the last item *seen*, dismissed or not: when everything
//    held has been dismissed (there is no held item to go after, and starting again from the top
//    could fetch the same dismissed page forever), and when the last page brought nothing new
//    (only items already held or dismissed came back, so going after the last held item again
//    would ask for the same page in a loop).
// 2. Items have keys. Pages are merged by key, so an item that shifts across a page boundary is
//    shown once, and `dismiss(key)` hides one at once (an optimistic remove, paired with
//    useUndoable) without the app rewriting TanStack's page cache by hand. Dismissals belong to
//    one query: a new `queryKey` (another filter) starts with none. A screen that removes items
//    with `useUndoable` passes its `isRemoved` instead, so the undo hook stays the one owner of
//    what is out of view (Undo, a failed commit and Try again all show through) and the cursor
//    still skips past what it hides.
// 3. A later page failing is not the list failing. The held items stay; `more.error` says what
//    happened and `more.loadMore` is the Try again. A refetch of the held pages failing is not the
//    list failing either: the items stay and `stale` says how old they are, as with `useLoad`.
//    Only a failed first page is a `Load` error.

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
  /** Hide an item at once (an optimistic removal). The next cursor goes after the last item still held. */
  dismiss: (key: string) => void;
  /** Show a dismissed item again: the Undo of `dismiss`. */
  restore: (key: string) => void;
};

/** Options for `useInfiniteLoad`. */
export type InfiniteLoadOptions<T, Page, Cursor, K extends QueryKey> = {
  queryKey: K;
  /** Fetch one page. `cursor` is undefined for the first page, else `cursorAfter` of the last item held. */
  queryFn: (context: { cursor: Cursor | undefined; signal: AbortSignal }) => Promise<Page>;
  /** The items in a page. For an API that returns a bare array, `(page) => page`. */
  items: (page: Page) => T[];
  /** A stable key per item: merges pages, and is what `dismiss` takes. */
  itemKey: (item: T) => string;
  /** Whether the server says there is a page after this one. */
  hasMore: (lastPage: Page) => boolean;
  /** The cursor that asks for the items after this one; usually its id. Defaults to `itemKey`. */
  cursorAfter?: (item: T) => Cursor;
  /** Items hidden by someone else, usually `useUndoable().isRemoved`: treated like dismissed ones. */
  isRemoved?: (key: string) => boolean;
  describeError?: DescribeError;
  enabled?: boolean;
  staleTime?: number;
};

type Dismissed = { query: string; keys: ReadonlySet<string> };
type PageParam<Cursor> = { cursor: Cursor | undefined };

/** `useInfiniteQuery` for cursor-paged data, returned as an `InfiniteLoad<T>` for `InfiniteList` (or `DataView`). */
export function useInfiniteLoad<T, Page, Cursor = string, K extends QueryKey = QueryKey>({
  queryKey,
  queryFn,
  items,
  itemKey,
  hasMore,
  cursorAfter = itemKey as unknown as (item: T) => Cursor,
  isRemoved,
  describeError = describeHttpError,
  enabled,
  staleTime,
}: InfiniteLoadOptions<T, Page, Cursor, K>): InfiniteLoad<T> {
  const queryHash = hashKey(queryKey);
  const [stored, setStored] = React.useState<Dismissed>(() => ({ query: queryHash, keys: new Set() }));
  const dismissed = stored.query === queryHash ? stored.keys : none;
  const hidden = React.useCallback((key: string) => dismissed.has(key) || (isRemoved?.(key) ?? false), [dismissed, isRemoved]);
  // TanStack calls getNextPageParam outside render; it reads the latest hidden set and accessors.
  const latest = React.useRef({ hidden, items, itemKey, hasMore, cursorAfter });
  latest.current = { hidden, items, itemKey, hasMore, cursorAfter };

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => queryFn({ cursor: pageParam.cursor, signal }),
    initialPageParam: { cursor: undefined } as PageParam<Cursor>,
    getNextPageParam: (lastPage, pages): PageParam<Cursor> | null => {
      const l = latest.current;
      if (!l.hasMore(lastPage)) return null;
      const after = nextAfter(pages, l.items, l.itemKey, l.hidden);
      return { cursor: after === undefined ? undefined : l.cursorAfter(after) };
    },
    enabled,
    staleTime,
  });

  const pages = query.data?.pages;
  // Keyed on the pages and dismissals only, so inline `items`/`itemKey` arrows do not hand the
  // list a new array every render.
  const list = React.useMemo(
    () => (pages ? merge(pages, latest.current.items, latest.current.itemKey, hidden).held : undefined),
    [pages, hidden],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;
  const loadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const change = React.useCallback(
    (edit: (keys: Set<string>) => void) =>
      setStored((s) => {
        const keys = new Set(s.query === queryHash ? s.keys : none);
        edit(keys);
        return { query: queryHash, keys };
      }),
    [queryHash],
  );
  const dismiss = React.useCallback((key: string) => change((keys) => keys.add(key)), [change]);
  const restore = React.useCallback((key: string) => change((keys) => keys.delete(key)), [change]);

  const more: More = {
    hasMore: Boolean(hasNextPage),
    loadingMore: isFetchingNextPage,
    error: query.isFetchNextPageError ? describeError(query.error) : undefined,
    loadMore,
  };
  const extra = { more, itemKey, dismiss, restore };
  if (list) {
    // isRefetchError excludes a failed next page, which is `more.error`'s to report.
    const stale = query.isRefetchError ? staleOf(query, describeError) : undefined;
    return { status: "ready", data: list, ...(stale && { stale }), ...extra };
  }
  if (query.status === "error") return { status: "error", message: describeError(query.error), retry: () => void refetch(), ...extra };
  return { status: "loading", ...extra };
}

const none: ReadonlySet<string> = new Set();

/** Every page's items, in order, once each by key: the ones held (not dismissed) and the last one seen. */
function merge<T, Page>(pages: Page[], items: (page: Page) => T[], itemKey: (item: T) => string, hidden: (key: string) => boolean) {
  const seen = new Set<string>();
  const held: T[] = [];
  let last: T | undefined;
  let lastPageAddedAny = false;
  pages.forEach((page, p) => {
    for (const item of items(page)) {
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      last = item;
      if (p === pages.length - 1) lastPageAddedAny = true;
      if (!hidden(key)) held.push(item);
    }
  });
  return { held, last, lastPageAddedAny };
}

/** The item the next page goes after: the last held, or the last seen when nothing is held or the last page brought nothing new. */
function nextAfter<T, Page>(pages: Page[], items: (page: Page) => T[], itemKey: (item: T) => string, hidden: (key: string) => boolean) {
  const { held, last, lastPageAddedAny } = merge(pages, items, itemKey, hidden);
  if (held.length === 0 || (pages.length > 1 && !lastPageAddedAny)) return last;
  return held[held.length - 1];
}
