import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Load, Stale } from "../components/data-view";
import { HttpError, describeHttpError, readErrorBody, type DescribeError, type ErrorBody } from "../lib/errors";

export { HttpError, describeHttpError, readErrorBody, type DescribeError, type ErrorBody };

// Data loading, the Strata way: TanStack Query fetches and caches, and every view of the result
// goes through DataView, which takes a Load<T>. `toLoad` is the one bridge between them, so a
// screen never re-derives loading/error/ready from a query's flags and never forgets one.
//
// Opinions in createQueryClient: one retry (a second failure is real and the person should see
// it with a "Try again"), 30 s stale time (dashboards are read many times a minute but change
// over minutes), and no refetch on window focus (a table that reorders itself while someone reads
// it is worse than one that is 30 s old). Override per query when the data says otherwise.

/** A QueryClient with Strata's defaults: one retry, 30 s stale time, no refetch on window focus. */
export function createQueryClient(overrides?: ConstructorParameters<typeof QueryClient>[0]) {
  return new QueryClient({
    ...overrides,
    defaultOptions: {
      ...overrides?.defaultOptions,
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, ...overrides?.defaultOptions?.queries },
    },
  });
}

/** Provides a query client (Strata's defaults unless one is passed) to the app. */
export function StrataQueryProvider({ client, children }: { client?: QueryClient; children: React.ReactNode }) {
  const [fallback] = React.useState(() => client ?? createQueryClient());
  return <QueryClientProvider client={client ?? fallback}>{children}</QueryClientProvider>;
}

/**
 * Turns a TanStack query result into the `Load<T>` that `DataView` takes; errors are described for a person by `describe`.
 * A refetch that fails after data arrived stays `ready`, with `stale` saying why and when the data was read.
 */
export function toLoad<T>(query: UseQueryResult<T>, describe: DescribeError = describeHttpError): Load<T> {
  if (query.status === "success") return { status: "ready", data: query.data };
  // TanStack keeps the last good data when a refetch fails and sets status "error" (isRefetchError).
  // That is old data, not no data: keep it on screen and say how old it is.
  if (query.status === "error" && query.data !== undefined) return { status: "ready", data: query.data, stale: staleOf(query, describe) };
  if (query.status === "error") return { status: "error", message: describe(query.error), retry: () => void query.refetch() };
  return { status: "loading" };
}

/** The `Stale` of a query whose refetch failed after a good read. Shared by `toLoad` and `useInfiniteLoad`. */
export function staleOf(
  query: { error: unknown; dataUpdatedAt: number; isFetching: boolean; refetch: () => unknown },
  describe: DescribeError = describeHttpError,
): Stale {
  return { message: describe(query.error), readAt: new Date(query.dataUpdatedAt), retry: () => void query.refetch(), retrying: query.isFetching };
}

/** `useQuery`, returned as a `Load<T>` for `DataView`. */
export function useLoad<T, K extends QueryKey = QueryKey>(
  options: UseQueryOptions<T, Error, T, K> & { describeError?: DescribeError },
): Load<T> {
  const { describeError, ...rest } = options;
  return toLoad(useQuery(rest), describeError);
}

/** Options for `fetchJson` beyond `fetch`'s own. */
export type FetchJsonOptions = {
  /** Finds the server's reason and per-field messages in an error body. Default `readErrorBody` (FastAPI's `detail`, `message`, `error`). */
  readError?: (body: unknown) => ErrorBody;
};

/**
 * fetch() that throws an HttpError on a non-2xx response and parses JSON: the queryFn default, and the usual commit for a write.
 * A 204 or empty body resolves to undefined. An error response's body is read onto the HttpError (`body`, `reason`, `fieldErrors`).
 */
export async function fetchJson<T>(input: string | URL, init?: RequestInit, { readError = readErrorBody }: FetchJsonOptions = {}): Promise<T> {
  // Headers, tuple arrays and plain objects are all valid HeadersInit; normalise before adding the
  // default so a caller's Authorization (or their own Accept) is never dropped.
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const res = await fetch(input, { ...init, headers });
  if (!res.ok) {
    // The body is read as text and parsed only when it parses: a proxy's HTML 502 page or an empty
    // body must still throw the HttpError, never a JSON SyntaxError in its place.
    const raw = await res.text().catch(() => "");
    let body: unknown = raw || undefined;
    try {
      if (raw) body = JSON.parse(raw);
    } catch {
      // Not JSON: keep the text.
    }
    throw new HttpError(res.status, res.statusText, String(input), body, readError(body));
  }
  // Writes (DELETE, a PUT that returns nothing) answer 204 or an empty body; that is success, not a
  // JSON parse error.
  const text = res.status === 204 ? "" : await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export { useInfiniteLoad, type InfiniteLoad, type InfiniteLoadOptions, type More } from "./infinite";
export { useJob, type Job, type JobOptions } from "./job";
