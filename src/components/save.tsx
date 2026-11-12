import * as React from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "./button";
import { describeActionError } from "../lib/errors";
import { cn } from "../lib/utils";
import { format } from "../lib/format";

// Whether a document's work is safe (components.md §3.17; strata-react issue #81, from strata-vid,
// whose project saved itself with no sign on screen that it had, or had not).
//
// `useAutoSave` is the state machine and `SaveStatus` the sign. The states are the four a person
// asks about: saved (and when), saving, unsaved changes, and not saved (and why, with a retry).
// - The same verb through every state ("Saving…", "Saved", "Not saved", "Try again"), in place,
//   with the labels stacked in one grid cell so the sign is as wide as its longest and nothing
//   beside it moves (the `AsyncButton` technique). The `failed` reason is cut to that width and
//   shown whole in the announcement and as a tooltip title.
// - A routine save is quiet: no toast, no tick animation, no announcement. A failed save is the bad
//   day, so it is announced politely, once per failure, saying what happened and what is still
//   safe ("Not saved: the connection dropped. Your changes are still here."). The recovery after
//   it is announced too, so a person who heard the failure hears that it is over.
// - The time is a clock time (`format.clock`), which does not go stale on screen the way "2 minutes
//   ago" does; nothing here ticks.
// - Saves are debounced (`delayMs`, default 1500) and never overlap: edits made while a save runs
//   are saved after it, so the last write is always the latest value. `delayMs: null` is a document
//   with an explicit Save command: the state is `dirty` until `saveNow()`.
// - A document that saves itself needs no `beforeunload` prompt except while a save is pending or
//   failed; `useLeaveGuard(state.status !== "saved")` is that, on only while there is something to
//   lose (patterns.md §6). A router blocker is the app's: it needs a data router.
// Motion: none; the spinner turns only under `motion-safe`.
//
// Checked: React Aria has no save indicator or autosave part; its `ProgressBar` and live regions
// are what a sign like this would sit on, and a plain status text is the right element.

/** The state of a document's saving. */
export type SaveState =
  | { status: "saved"; /** When it last saved here; null for a document just opened. */ at: Date | null }
  | { status: "dirty" }
  | { status: "saving" }
  | { status: "failed"; /** What happened, in the product's words. */ reason?: string };

/** Options for `useAutoSave`. */
export type AutoSaveOptions<V> = {
  /** The document's current value. Compared with what was last saved by `equals`. */
  value: V;
  /** Saves a value. Throw (or reject) to fail. */
  save: (value: V) => void | Promise<unknown>;
  /** Wait this long after the last change before saving. `null`: never on its own, only `saveNow()`. Default 1500. */
  delayMs?: number | null;
  /** Whether two values are the same document. Default `Object.is`. */
  equals?: (a: V, b: V) => boolean;
  /** Turns a thrown error into the sentence shown. Default `describeActionError`. */
  describeError?: (error: unknown) => string | undefined;
};

/** What `useAutoSave` returns. */
export type AutoSave = {
  state: SaveState;
  /** Saves now (and is "Try again" after a failure). Resolves when the save has finished, failed or not. */
  saveNow: () => Promise<void>;
};

/** Saves `value` after changes settle, never two at once, and says where it stands. The document's first `value` counts as saved. */
export function useAutoSave<V>({ value, save, delayMs = 1500, equals = Object.is, describeError = describeActionError }: AutoSaveOptions<V>): AutoSave {
  const [state, setState] = React.useState<SaveState>({ status: "saved", at: null });
  const latest = React.useRef({ value, save, equals, describeError, delayMs });
  latest.current = { value, save, equals, describeError, delayMs };
  const saved = React.useRef(value);
  const savedAt = React.useRef<Date | null>(null);
  const running = React.useRef<Promise<void> | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const schedule = React.useCallback(() => {
    window.clearTimeout(timer.current);
    if (latest.current.delayMs === null) return;
    timer.current = window.setTimeout(() => void run(), latest.current.delayMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = React.useCallback((): Promise<void> => {
    window.clearTimeout(timer.current);
    if (running.current) return running.current;
    const current = latest.current.value;
    if (latest.current.equals(current, saved.current)) {
      setState((s) => (s.status === "saved" ? s : { status: "saved", at: new Date() }));
      return Promise.resolve();
    }
    setState({ status: "saving" });
    // `settled` covers a saver that throws before its first await: the catch and finally then run
    // inside this call, before `attempt` exists, and the lock must not be taken after that.
    let settled = false;
    const attempt = (async () => {
      try {
        await latest.current.save(current);
        saved.current = current;
        savedAt.current = new Date();
        if (!mounted.current) return;
        if (latest.current.equals(latest.current.value, current)) setState({ status: "saved", at: savedAt.current });
        else {
          setState({ status: "dirty" });
          schedule();
        }
      } catch (error) {
        if (mounted.current) setState({ status: "failed", reason: latest.current.describeError(error) });
      } finally {
        settled = true;
        running.current = null;
      }
    })();
    if (!settled) running.current = attempt;
    return attempt;
  }, [schedule]);

  // A change: unsaved until it is saved. A failed state stays failed (the person has not been
  // told it is fine), and a save already running picks the change up when it ends.
  React.useEffect(() => {
    if (latest.current.equals(value, saved.current)) {
      // Edited back to what is saved: nothing to lose, so the sign says so (and the leave guard goes off).
      if (!running.current) {
        window.clearTimeout(timer.current);
        setState((s) => (s.status === "dirty" || s.status === "failed" ? { status: "saved", at: savedAt.current } : s));
      }
      return;
    }
    if (!running.current) setState((s) => (s.status === "failed" ? s : { status: "dirty" }));
    if (!running.current) schedule();
  }, [value, schedule]);

  return { state, saveNow: run };
}

/** Asks the browser to confirm before the page is closed or reloaded, while `active`. Off when there is nothing to lose. */
export function useLeaveGuard(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

const labelOf = (s: SaveState) =>
  s.status === "saved" ? (s.at ? `Saved ${format.clock(s.at)}` : "Saved") : s.status === "saving" ? "Saving…" : s.status === "dirty" ? "Unsaved changes" : "Not saved";

/**
 * The sign of whether the work is safe: "Saved 10:42", "Saving…", "Unsaved changes", or "Not saved"
 * with the reason and "Try again". Fixed width, so it never moves what is beside it. Announces a
 * failure, and the recovery from one, politely; a routine save is silent.
 */
export function SaveStatus({ state, onRetry, className }: { state: SaveState; onRetry: () => void; className?: string }) {
  const lastFailure = React.useRef(false);
  const failed = state.status === "failed";
  let announcement = "";
  if (failed) announcement = `Not saved${state.reason ? `: ${state.reason}` : "."} Your changes are still here.`;
  else if (lastFailure.current && state.status === "saved") announcement = "Saved.";
  React.useEffect(() => {
    if (failed) lastFailure.current = true;
    else if (state.status === "saved") lastFailure.current = false;
  }, [failed, state.status]);

  const Icon = { saved: Check, saving: LoaderCircle, dirty: null, failed: CircleAlert }[state.status];
  const current = labelOf(state);
  const all = ["Saved 00:00", "Saving…", "Unsaved changes", "Not saved"];
  const shown = failed && state.reason ? `Not saved: ${state.reason}` : current;

  return (
    <span
      data-status={state.status}
      title={failed ? shown : undefined}
      className={cn(
        "inline-flex w-72 items-center justify-end gap-2 type-body-sm",
        failed ? "text-danger" : "text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className={cn("size-4 shrink-0", state.status === "saving" && "motion-safe:animate-spin")} />}
      {failed ? (
        <span className="min-w-0 truncate">{shown}</span>
      ) : (
        <span className="grid">
          {all.map((l) => {
            const active = l === current || (l === "Saved 00:00" && state.status === "saved");
            return (
              <span key={l} aria-hidden={!active} className={active ? "[grid-area:1/1] text-end tabular-nums" : "invisible [grid-area:1/1] text-end"}>
                {active ? current : l}
              </span>
            );
          })}
        </span>
      )}
      {failed && (
        <Button size="sm" variant="ghost" onClick={onRetry} className="shrink-0">
          Try again
        </Button>
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </span>
  );
}
