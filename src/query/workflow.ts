import type { QueryKey } from "@tanstack/react-query";
import { isTaskRunning, useJob, type Job, type JobOptions } from "./job";

// One subject's way through a strata-python pipeline, as the shared route answers it
// (`GET /api/workflows/<pipeline>/subjects/<subject>`, a `WorkflowRun`): polled while the queue job
// advancing it runs, and not otherwise, with what the run changes read again once when it stops.
// It is `useJob` with the running test the contract implies (the run's `job` is a `Task` whose state
// is not finished), so a screen does not write that test again. The type is the app's generated
// `Schema<"WorkflowRun">`; this asks only for the `job` field it reads.

/** The part of a `WorkflowRun` the hook reads: the queue job advancing it, if any. */
export type WorkflowRunLike = { job?: { state: string } | null };

/** Whether the queue job advancing a workflow run is still going. `finished` is the generated `FINISHED` (or `["done", "failed", "cancelled"]`). */
export function isWorkflowRunning(run: WorkflowRunLike, finished: ReadonlySet<string> | readonly string[]): boolean {
  return run.job != null && isTaskRunning(run.job, finished);
}

/** Options for `useWorkflowRun`: `useJob`'s, with `finished` in place of `isRunning`. */
export type WorkflowRunOptions<T extends WorkflowRunLike, K extends QueryKey = QueryKey> = Omit<JobOptions<T, K>, "isRunning"> & {
  /** The task states that mean finished: the generated `FINISHED`. */
  finished: ReadonlySet<string> | readonly string[];
};

/** A subject's `WorkflowRun`: polled while its job runs, its `invalidates` read again once when it ends. */
export function useWorkflowRun<T extends WorkflowRunLike, K extends QueryKey = QueryKey>({ finished, ...options }: WorkflowRunOptions<T, K>): Job<T> {
  return useJob<T, K>({ ...options, isRunning: (run) => isWorkflowRunning(run, finished) } as JobOptions<T, K>);
}
