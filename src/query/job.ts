import * as React from "react";
import { hashKey, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import type { Load } from "../components/data-view";
import type { DescribeError } from "../lib/errors";
import { toLoad } from "./index";

// The read behind `JobStatus` (strata-react issue #45): a job's status, polled while it runs and
// not otherwise, and the data it changed read again once, when it ends. Tubes wrote this as
// `useLoad({ refetchInterval })` plus an effect watching `running` go from true to false; every
// app with a job would write the same two pieces and get the second one subtly wrong (invalidating
// on the first read of a job that had already finished, or on every poll). Here:
//
// - `isRunning(data)` says whether the job is going; the query polls `every` ms (default 2000)
//   only then, so an idle screen makes one request, not one every two seconds.
// - `invalidates` names the queries the job changes; they are invalidated once, on the poll that
//   first sees the job stopped after one that saw it running, for the same query: a first read
//   of a finished job invalidates nothing, and neither does switching to another job's key (the
//   new query has no status yet, which is not the old job ending). The keys invalidated are the
//   ones given while that job was seen running.
// - `poll()` reads the status now: the commit of the button that starts the job calls it, so
//   polling begins without waiting for a stale time.
// - The result is a `Load<T>` (so a failed poll keeps the last status on screen with `stale`, as
//   any read does), plus `running`.

/** Options for `useJob`: a query's, plus how to tell the job is running, how often to poll, and what it changes. */
export type JobOptions<T, K extends QueryKey = QueryKey> = UseQueryOptions<T, Error, T, K> & {
  /** Whether the status says the job is still going. */
  isRunning: (data: T) => boolean;
  /** Milliseconds between polls while it runs. Default 2000. */
  every?: number;
  /** Query keys the job changes, invalidated once when it ends. */
  invalidates?: QueryKey[];
  describeError?: DescribeError;
};

/** What `useJob` returns: the status as a `Load<T>`, whether the job is running, and `poll` to read it now. */
export type Job<T> = Load<T> & {
  /** The latest status says the job is going. */
  running: boolean;
  /** Read the status now, as after starting the job. */
  poll: () => void;
};

/** A long-running job's status: polled every `every` ms while `isRunning`, with the `invalidates` queries read again once when it ends. */
export function useJob<T, K extends QueryKey = QueryKey>({
  isRunning,
  every = 2000,
  invalidates = [],
  describeError,
  ...options
}: JobOptions<T, K>): Job<T> {
  const client = useQueryClient();
  const query = useQuery({
    ...options,
    refetchInterval: (q) => (q.state.data !== undefined && isRunning(q.state.data) ? every : false),
  });
  const running = query.data !== undefined && isRunning(query.data);

  // What was last seen, for one query: whether its job ran, and what it said it would change.
  // Only a status that has arrived counts; no data yet (a new key loading) is not "stopped".
  const queryHash = hashKey(options.queryKey);
  const seen = query.data === undefined ? undefined : running;
  const was = React.useRef<{ query: string; running: boolean; invalidates: QueryKey[] } | undefined>(undefined);
  React.useEffect(() => {
    if (seen === undefined) return;
    const before = was.current;
    if (before && before.query === queryHash && before.running && !seen) {
      for (const queryKey of before.invalidates) void client.invalidateQueries({ queryKey });
    }
    was.current = { query: queryHash, running: seen, invalidates };
  });

  const { refetch } = query;
  const poll = React.useCallback(() => void refetch(), [refetch]);
  return { ...toLoad(query, describeError), running, poll };
}
