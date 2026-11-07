import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Load } from "../components/data-view";

// Data loading, the Strata way: TanStack Query fetches and caches, and every view of the result
// goes through DataView, which takes a Load<T>. `toLoad` is the one bridge between them, so a
// screen never re-derives loading/error/ready from a query's flags and never forgets one.
//
// Opinions in createQueryClient: one retry (a second failure is real and the person should see
// it with a "Try again"), 30 s stale time (dashboards are read many times a minute but change
// over minutes), and no refetch on window focus (a table that reorders itself while someone reads
// it is worse than one that is 30 s old). Override per query when the data says otherwise.

export function createQueryClient(overrides?: ConstructorParameters<typeof QueryClient>[0]) {
  return new QueryClient({
    ...overrides,
    defaultOptions: {
      ...overrides?.defaultOptions,
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, ...overrides?.defaultOptions?.queries },
    },
  });
}

export function StrataQueryProvider({ client, children }: { client?: QueryClient; children: React.ReactNode }) {
  const [fallback] = React.useState(() => client ?? createQueryClient());
  return <QueryClientProvider client={client ?? fallback}>{children}</QueryClientProvider>;
}

/** Writes an error for a person: what happened, in a sentence. A product passes its own words. */
export type DescribeError = (error: unknown) => string;

export const describeHttpError: DescribeError = (error) =>
  error instanceof HttpError
    ? error.status >= 500
      ? `The server could not answer (${error.status}). Nothing was changed.`
      : `The request was refused (${error.status}): ${error.statusText || "no reason given"}.`
    : error instanceof Error && error.message
      ? error.message
      : "The data could not be loaded. Nothing was changed.";

export function toLoad<T>(query: UseQueryResult<T>, describe: DescribeError = describeHttpError): Load<T> {
  if (query.status === "success") return { status: "ready", data: query.data };
  if (query.status === "error") return { status: "error", message: describe(query.error), retry: () => void query.refetch() };
  return { status: "loading" };
}

/** useQuery, returned as a Load<T> for DataView. */
export function useLoad<T, K extends QueryKey = QueryKey>(
  options: UseQueryOptions<T, Error, T, K> & { describeError?: DescribeError },
): Load<T> {
  const { describeError, ...rest } = options;
  return toLoad(useQuery(rest), describeError);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
  ) {
    super(`${status} ${statusText} from ${url}`);
    this.name = "HttpError";
  }
}

/** fetch() that throws an HttpError on a non-2xx response and parses JSON: the queryFn default. */
export async function fetchJson<T>(input: string | URL, init?: RequestInit): Promise<T> {
  // Headers, tuple arrays and plain objects are all valid HeadersInit; normalise before adding the
  // default so a caller's Authorization (or their own Accept) is never dropped.
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const res = await fetch(input, { ...init, headers });
  if (!res.ok) throw new HttpError(res.status, res.statusText, String(input));
  return (await res.json()) as T;
}
