import * as React from "react";
import { useNavigate } from "react-router";
import type { Job } from "../query/job";
import { useAsyncAction, type AsyncActionOptions, type Phase } from "./async-button";
import { toast, type ToastContentProps } from "./toast";

// A button that starts a server job (issue #250, from strata-listory's per-folder Scan button).
// The shape is always the same: the button is busy while the job runs, a toast says it is queued
// and points at the page that shows jobs, a toast says how it ended, and a failure to start is
// inline on the button. `useAsyncAction`, `toast`, `useJob` and `JobStatus` cover the parts and every
// app wired them by hand, so this is the wiring, and it adds nothing the parts cannot do.
//
// The phase handed to `AsyncButton` is `pending` from the press until the job has ended, not just
// while the start request is in flight: a job is "running" long after its request returned, and a
// button that came back at once would invite a second press. `error` is only a failure to start (the
// job's own failures are `JobStatus`'s, named item by item). The "finished" toast fires once, when a
// job this hook started goes from running to not running; the status must report running at least
// once after the start (it is polled once straight away to make that likely, and `useJob` keeps
// polling while it runs). `done` is told what the status said, to word the result ("Scanned 12 of 14").
// Where the toast's action goes is `jobsHref`, a route in the app (React Router's navigate).

/** Options for `useJobAction`. */
export type JobActionOptions<A extends unknown[], R, S> = Pick<AsyncActionOptions<A>, "onError" | "describeError" | "validate" | "onInvalid"> & {
  /** Starts the job (the POST). What it returns is given to `queued`. */
  start: (...args: A) => Promise<R>;
  /** The job's status, from `useJob`. Its `running` drives the busy phase and the finished toast. */
  job: Job<S>;
  /** The toast when the job is queued: "Scan queued", from what `start` returned. */
  queued: (result: R) => Pick<ToastContentProps, "title" | "description">;
  /** The toast when the job ends, from its last status: "Scan finished", "12 of 14 scanned". Return `null` for none. */
  done: (status: S) => Pick<ToastContentProps, "title" | "description" | "tone"> | null;
  /** The page that shows jobs: the queued toast gets an action that goes there. */
  jobsHref?: string;
  /** The queued toast's action. Default "Show jobs". */
  jobsLabel?: string;
};

/** What `useJobAction` returns: the phase and `run` for `AsyncButton`, and why starting failed. */
export type JobAction<A extends unknown[]> = {
  /** `pending` while starting and while the job runs, `error` if it could not start, else `idle`. */
  phase: Phase;
  run: (...args: A) => Promise<void>;
  /** Why the job could not be started, in the product's words, while `phase` is `error`. */
  error: string | undefined;
  /** The job this button started is still running. */
  running: boolean;
};

/** One call for a button that starts a server job: busy until the job ends, a queued toast linking to the jobs page, a finished toast with the result, and a failure to start shown on the button. */
export function useJobAction<A extends unknown[], R, S>({ start, job, queued, done, jobsHref, jobsLabel = "Show jobs", ...asyncOptions }: JobActionOptions<A, R, S>): JobAction<A> {
  const navigate = useNavigate();
  const [waiting, setWaiting] = React.useState(false);
  const seen = React.useRef(false);
  const latest = React.useRef({ queued, done, jobsHref, jobsLabel, navigate, job });
  React.useLayoutEffect(() => {
    latest.current = { queued, done, jobsHref, jobsLabel, navigate, job };
  });

  const action = useAsyncAction(
    async (...args: A) => {
      const result = await start(...args);
      const l = latest.current;
      toast.show({ ...l.queued(result), tone: "info", ...(l.jobsHref !== undefined ? { action: { label: l.jobsLabel, onPress: () => void l.navigate(l.jobsHref!) } } : {}) });
      seen.current = false;
      setWaiting(true);
      l.job.poll();
    },
    { settleMs: 0, ...asyncOptions },
  );

  const running = job.running;
  React.useEffect(() => {
    if (!waiting) return;
    if (running) {
      seen.current = true;
      return;
    }
    if (!seen.current) return;
    setWaiting(false);
    seen.current = false;
    const status = latest.current.job.status === "ready" ? latest.current.job.data : undefined;
    const content = status === undefined ? null : latest.current.done(status);
    if (content) toast.show({ tone: "success", ...content });
  }, [waiting, running]);

  const busy = action.phase === "pending" || waiting;
  const phase: Phase = action.phase === "error" ? "error" : busy ? "pending" : "idle";
  return { phase, run: action.run, error: action.error, running: waiting && (running || action.phase === "pending") };
}
