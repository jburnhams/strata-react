import * as React from "react";
import { Button } from "./button";
import { describeActionError } from "../lib/errors";

// Destructive actions take effect visibly at once and commit after a window, with Undo in reach.
// For reversible removals this beats a confirm dialog: the dialog interrupts every time to protect
// against the rare mistake, and people learn to click through it. Keep a confirm dialog for
// actions that cannot be undone (deleting an account, firing a kiln).

// A bulk removal is one removal with `ids`: the selected rows go, come back on Undo, and fail
// together, under one message and one commit, because the person did one thing.
//
// One removal is pending at a time. Scheduling a second commits the first at once: in rapid-fire
// triage (withdraw, withdraw, withdraw) Undo reaches back one step, and the bar never stacks up a
// queue of messages nobody reads. Undo is for the slip just made, not for an audit trail.
//
// The hook owns which items are out of view (`isRemoved`), so a screen filters its rows by it and
// never keeps a second "hidden" set that can drift from the pending one. An item stays removed
// from when it is scheduled; Undo brings it back; a commit that fails brings it back and puts the
// failure in the same bar, with "Try again", because the screen told the person it was done and a
// silent failure would leave the screen lying. A committed item stays removed until the screen's
// data drops it (the commit should invalidate the query it came from), so it never flickers back.
//
// `flush()` exists for the action that depends on the removal having happened (retrain on the
// answers, export the list): commit now and await it, rather than racing the window.
//
// Failures are described like any other failed action (`describeActionError`, as AsyncButton uses,
// unless the product passes its own): the same HTTP sentences as reads, without promising that
// nothing changed, since a write that failed may still have reached the server.

/** A removal waiting out its undo window: what to say, what to do when the window closes, and what to say if that fails. */
export type PendingRemoval = {
  /** Identifies the removed item: `isRemoved(id)` is true from `schedule` until Undo or a failed commit. */
  id: string;
  /** A bulk removal's items, all removed, undone, committed and restored together (one `commit` for the batch). `isRemoved` is true for each. Default `[id]`. */
  ids?: readonly string[];
  /** What happened, in the product's words: "Withdrew Tom Ellery's 3 pieces from kiln 2." */
  message: string;
  /** What the person reads if the commit fails, saying the item is back: "Tom Ellery's 3 pieces are back in kiln 2: the withdrawal did not go through." */
  failure: string;
  /** Makes the removal real (usually a request, then invalidating the query the item came from). Runs once per attempt: when the window closes, on `flush()`, when a second removal is scheduled, or when the owner unmounts. */
  commit: () => void | Promise<unknown>;
  /** Called after a failed commit, for anything beyond restoring the item and showing the failure (which the hook does). The only failure path once the owner has unmounted. */
  onError?: (error: unknown) => void;
};

/** A removal whose commit failed: the removal, and the error described for a person. */
export type FailedRemoval = { removal: PendingRemoval; message?: string };

/** Options for `useUndoable`. */
export type UndoableOptions = {
  /** How long Undo stays in reach, in milliseconds. Default 8000. */
  windowMs?: number;
  /** Describes a failed commit for a person, or returns undefined to show the removal's `failure` alone. Default `describeActionError`, as for `useAsyncAction`. */
  describeError?: (error: unknown) => string | undefined;
};

/** What `useUndoable` returns. Pass it whole to `UndoBar`. */
export type Undoable = {
  /** The removal inside its window, or null. */
  pending: PendingRemoval | null;
  /** The last removal whose commit failed, until it is retried, dismissed or another removal is scheduled. */
  failed: FailedRemoval | null;
  /** Whether an item is out of view: scheduled, committing or committed, and not undone or failed. Filter rows with it. */
  isRemoved: (id: string) => boolean;
  /** Removes an item and starts its window. Commits any removal already pending first: only one is pending at a time. */
  schedule: (next: PendingRemoval) => void;
  /** Cancels the pending removal and brings the item back; its `commit` never runs. */
  undo: () => void;
  /** Commits the pending removal now and resolves when it and every earlier commit still in flight have settled; rejects if any failed, so a dependent action does not run. Resolves at once when nothing is pending or running. */
  flush: () => Promise<void>;
  /** Removes the failed item again and commits it now (the person already waited out the window); settles like `flush`. */
  retry: () => Promise<void>;
  /** Clears the failure from the bar; the item stays back. */
  dismiss: () => void;
};

/**
 * Schedules a reversible removal to commit after a window unless undone, and owns which items
 * are out of view meanwhile.
 *
 * Only one removal is pending at a time: scheduling a second commits the first immediately.
 * Unmounting inside the window commits the pending removal (leaving is not Undo), so a navigation
 * or a test that unmounts still sends the commit's request: await `flush()` before a dependent
 * action, and in tests let MSW answer the request or flush before unmounting.
 */
export function useUndoable(options: number | UndoableOptions = {}): Undoable {
  const { windowMs = 8000, describeError = describeActionError } =
    typeof options === "number" ? { windowMs: options } : options;
  const [pending, setPending] = React.useState<PendingRemoval | null>(null);
  const [failed, setFailed] = React.useState<FailedRemoval | null>(null);
  const [removed, setRemoved] = React.useState<ReadonlySet<string>>(() => new Set());
  const current = React.useRef<PendingRemoval | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const mounted = React.useRef(true);
  // Every commit still running, whoever started it: flush() waits for all of them, not only the
  // pending one, because an earlier removal's request may still be in flight (its window closed,
  // or a second removal committed it) and a dependent action must not overtake it.
  const inFlight = React.useRef(new Set<Promise<void>>());
  const describe = React.useRef(describeError);
  describe.current = describeError;

  const hide = React.useCallback((p: PendingRemoval, out: boolean) => {
    const ids = p.ids ?? [p.id];
    setRemoved((s) => {
      if (ids.every((id) => s.has(id) === out)) return s;
      const n = new Set(s);
      for (const id of ids) {
        if (out) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }, []);

  // Runs one attempt at a removal's commit. A synchronous throw is treated like a rejection, so
  // there is one failure path: bring the item back, show the failure, tell onError, reject.
  const attempt = React.useCallback(
    (p: PendingRemoval): Promise<void> => {
      let result: void | Promise<unknown>;
      try {
        result = p.commit();
      } catch (error) {
        result = Promise.reject(error);
      }
      const done = Promise.resolve(result).then(
        () => undefined,
        (error: unknown) => {
          if (mounted.current) {
            hide(p, false);
            setFailed({ removal: p, message: describe.current(error) });
          }
          p.onError?.(error);
          throw error;
        },
      );
      inFlight.current.add(done);
      const settle = () => void inFlight.current.delete(done);
      done.then(settle, settle);
      return done;
    },
    [hide],
  );

  // Takes the pending removal out (so it commits only once) and attempts it.
  const take = React.useCallback((): { removal: PendingRemoval; done: Promise<void> } | null => {
    window.clearTimeout(timer.current);
    const p = current.current;
    if (!p) return null;
    current.current = null;
    if (mounted.current) setPending(null);
    return { removal: p, done: attempt(p) };
  }, [attempt]);

  // Commits the hook starts itself (window closed, second removal, unmount) have no caller to
  // await them. A failure is handled once it is in the bar or onError has it; only a failure
  // nobody can see (unmounted, no onError) is left to surface as an unhandled rejection.
  const commitDetached = React.useCallback(() => {
    const t = take();
    t?.done.catch((error: unknown) => {
      if (!mounted.current && !t.removal.onError) throw error;
    });
  }, [take]);

  const schedule = React.useCallback(
    (next: PendingRemoval) => {
      commitDetached(); // a second removal commits the first
      setFailed(null);
      hide(next, true);
      current.current = next;
      setPending(next);
      timer.current = window.setTimeout(commitDetached, windowMs);
    },
    [commitDetached, hide, windowMs],
  );

  const undo = React.useCallback(() => {
    window.clearTimeout(timer.current);
    const p = current.current;
    current.current = null;
    setPending(null);
    if (p) hide(p, false);
  }, [hide]);

  const flush = React.useCallback(async () => {
    take();
    const results = await Promise.allSettled([...inFlight.current]);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) throw failure.reason;
  }, [take]);

  const retry = React.useCallback(() => {
    if (!failed) return Promise.resolve();
    setFailed(null);
    hide(failed.removal, true);
    return attempt(failed.removal);
  }, [attempt, failed, hide]);

  const dismiss = React.useCallback(() => setFailed(null), []);

  const isRemoved = React.useCallback((id: string) => removed.has(id), [removed]);

  // Leaving the screen is not Undo: if the owner unmounts inside the window (the person navigated
  // away), commit what was scheduled rather than silently dropping it.
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      commitDetached();
    };
  }, [commitDetached]);

  return { pending, failed, isRemoved, schedule, undo, flush, retry, dismiss };
}

// The bar lives in a polite live region that is always mounted, so screen readers hear the message
// when it appears, and a failure replaces the message in the same place the person was looking.
// It is fixed to the bottom of the viewport; a page that uses it keeps that much bottom padding so
// the bar never covers the focused row. A failure stays until it is retried or dismissed: an error
// that times out is one a person can miss.
/** The polite live region that shows a pending removal with Undo, or a failed one with Try again. Pass it the whole `useUndoable()` result. */
export function UndoBar({
  undoable,
  inline = false,
}: {
  undoable: Pick<Undoable, "pending" | "failed" | "undo" | "retry" | "dismiss">;
  /** Render in the flow instead of fixed to the viewport; for the state-matrix page. */
  inline?: boolean;
}) {
  const { pending, failed, undo, retry, dismiss } = undoable;
  const ghost = "text-background hover:bg-neutral-11";
  return (
    <div
      aria-live="polite"
      className={
        inline ? "flex" : "layer-bar pointer-events-none fixed inset-x-0 bottom-4 flex justify-center px-4"
      }
    >
      {(pending || failed) && (
        <div className="pointer-events-auto flex max-w-lg items-center gap-4 rounded-overlay bg-foreground py-2 pr-2 pl-4 text-background shadow-overlay">
          {pending ? (
            <>
              <p className="min-w-0 type-body-sm">{pending.message}</p>
              <Button size="sm" variant="ghost" className={ghost} onClick={undo}>
                Undo
              </Button>
            </>
          ) : (
            failed && (
              <>
                <p className="min-w-0 type-body-sm">
                  {failed.message ? `${failed.removal.failure} ${failed.message}` : failed.removal.failure}
                </p>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" className={ghost} onClick={() => void retry().catch(() => undefined)}>
                    Try again
                  </Button>
                  <Button size="sm" variant="ghost" className={ghost} onClick={dismiss}>
                    Dismiss
                  </Button>
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
