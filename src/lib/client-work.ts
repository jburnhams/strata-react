import * as React from "react";

// Work the browser does for a while (an export, an upload, a render) has the same shape as a
// server job: it runs, reports how far it is, and ends finished, failed or cancelled (issue #72).
// `useClientWork` holds that shape so a screen hands it straight to `JobStatus` and a toast,
// instead of each screen keeping its own booleans. Cancelling aborts the `signal` the work was
// given (pass it to `fetch`, or check it between steps) and ends as `cancelled`, never as a
// failure: an abort is the person's decision, and its error is not reported. Starting again while
// running is ignored, so a double click does not run the work twice. A stale run (cancelled, then
// restarted) cannot write over the newer one.

/** What the work is given: a signal that aborts on cancel, and a way to report progress. */
export type WorkContext = {
  signal: AbortSignal;
  /** Report items done, and the total when it is known. */
  progress: (current: number, total?: number) => void;
};

/** Where client work is. */
export type WorkPhase = "idle" | "running" | "finished" | "failed" | "cancelled";

/** The state `useClientWork` returns. */
export type ClientWork<T> = {
  phase: WorkPhase;
  current?: number;
  total?: number;
  result?: T;
  error?: unknown;
  /** Runs the work. Ignored while it is already running. */
  start: () => Promise<void>;
  /** Aborts the work's signal; the phase becomes `cancelled`. */
  cancel: () => void;
  /** Back to `idle`, forgetting the result. */
  dismiss: () => void;
};

type State<T> = { phase: WorkPhase; current?: number; total?: number; result?: T; error?: unknown };

/** Runs browser-side work with progress, cancel and a clear end state, ready for `JobStatus`. */
export function useClientWork<T>(run: (ctx: WorkContext) => Promise<T>): ClientWork<T> {
  const [state, setState] = React.useState<State<T>>({ phase: "idle" });
  const controller = React.useRef<AbortController | null>(null);
  const runRef = React.useRef(run);
  runRef.current = run;

  const start = React.useCallback(async () => {
    if (controller.current) return;
    const mine = new AbortController();
    controller.current = mine;
    const live = () => controller.current === mine;
    setState({ phase: "running" });
    try {
      const result = await runRef.current({
        signal: mine.signal,
        progress: (current, total) => live() && setState((s) => ({ ...s, current, total: total ?? s.total })),
      });
      if (!live()) return;
      setState(mine.signal.aborted ? { phase: "cancelled" } : { phase: "finished", result });
    } catch (error) {
      if (!live()) return;
      setState(mine.signal.aborted ? { phase: "cancelled" } : { phase: "failed", error });
    } finally {
      if (live()) controller.current = null;
    }
  }, []);

  const cancel = React.useCallback(() => {
    const c = controller.current;
    if (!c) return;
    c.abort();
    controller.current = null;
    setState({ phase: "cancelled" });
  }, []);

  const dismiss = React.useCallback(() => {
    if (!controller.current) setState({ phase: "idle" });
  }, []);

  React.useEffect(() => () => controller.current?.abort(), []);

  return { ...state, start, cancel, dismiss };
}
