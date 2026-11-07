import * as React from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { describeActionError } from "../lib/errors";

// One object through its states: "Book firing" becomes "Booking…" becomes "Booked", in the same
// button, rather than the button being swapped for a spinner. The labels are stacked in one grid
// cell so the button is always as wide as its longest label and nothing around it shifts. The
// button stays enabled until the request starts (so a person can always try), and the outcome is
// announced politely for screen readers. When the action fails, the announcement carries what
// went wrong in the product's words before the retry label ("Kiln 2 is already booked. Try
// again"), because "Try again" alone does not say whether trying again can help.

export type Phase = "idle" | "pending" | "done" | "error";

export type AsyncLabels = {
  idle: string;
  /** Ends in an ellipsis: "Saving…", "Booking…". */
  pending: string;
  /** The same verb, finished: "Saved", "Booked". */
  done: string;
  error?: string;
};

/** One button through idle, pending, done and error, with the label changing in place and its width fixed by the longest label. The outcome is announced politely, with the error's own words when `error` is given. */
export function AsyncButton({
  phase,
  labels,
  error,
  disabled,
  ...props
}: Omit<ButtonProps, "children"> & {
  phase: Phase;
  labels: AsyncLabels;
  /** What went wrong, in the product's words (`useAsyncAction`'s `error`). Announced with the error label when `phase` is `error`. */
  error?: string;
}) {
  const errorLabel = labels.error ?? "Try again";
  const current = { idle: labels.idle, pending: labels.pending, done: labels.done, error: errorLabel }[phase];
  const Icon = { idle: null, pending: LoaderCircle, done: Check, error: CircleAlert }[phase];
  const announcement = phase === "done" ? labels.done : phase === "error" ? (error ? `${error} ${errorLabel}` : errorLabel) : "";

  return (
    <>
      <Button {...props} disabled={disabled || phase === "pending"} aria-disabled={phase === "pending" || undefined}>
        {Icon && <Icon aria-hidden className={phase === "pending" ? "motion-safe:animate-spin" : undefined} />}
        <span className="grid">
          {[labels.idle, labels.pending, labels.done, errorLabel].map((l) => (
            <span key={l} aria-hidden={l !== current} className={l === current ? "[grid-area:1/1]" : "invisible [grid-area:1/1]"}>
              {l}
            </span>
          ))}
        </span>
      </Button>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}

/** Options for `useAsyncAction`. */
export type AsyncActionOptions = {
  /** How long `done` shows before returning to `idle`. Default 2000ms. */
  settleMs?: number;
  /** Called with whatever the action threw, once the `error` render has committed: for logging, or to move focus to the retry button or an error message. */
  onError?: (error: unknown) => void;
  /** Turns what was thrown into `error`'s sentence, in the product's words. Default `describeActionError`: HTTP status sentences for `fetchJson`'s `HttpError`, else the Error's message. */
  describeError?: (error: unknown) => string | undefined;
};

/** What `useAsyncAction` returns: the phase for `AsyncButton`, a stable `run`, and what went wrong while `phase` is `error`. */
export type AsyncAction<A extends unknown[]> = {
  phase: Phase;
  run: (...args: A) => Promise<void>;
  /** What went wrong, from `describeError`, while `phase` is `error`; otherwise undefined. Pass it to `AsyncButton`'s `error`. */
  error: string | undefined;
};

// The action and its options are read through a ref so `run` keeps one identity for the
// component's life: a caller can pass an inline arrow without re-rendering every child that takes
// `run`, and without the try/catch and error state each caller used to write to reach the phase.

/** Runs an async action and reports its phase and error. `done` returns to `idle` after `settleMs`; `run` never changes identity. */
export function useAsyncAction<A extends unknown[]>(
  action: (...args: A) => Promise<unknown>,
  { settleMs = 2000, onError, describeError = describeActionError }: AsyncActionOptions = {},
): AsyncAction<A> {
  const [state, setState] = React.useState<{ phase: Phase; error: string | undefined }>({ phase: "idle", error: undefined });
  const timer = React.useRef<number | undefined>(undefined);
  const unreported = React.useRef<{ thrown: unknown } | undefined>(undefined);
  const latest = React.useRef({ action, onError, settleMs, describeError });
  React.useLayoutEffect(() => {
    latest.current = { action, onError, settleMs, describeError };
  });
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = React.useCallback(async (...args: A) => {
    window.clearTimeout(timer.current);
    setState({ phase: "pending", error: undefined });
    try {
      await latest.current.action(...args);
      setState({ phase: "done", error: undefined });
      timer.current = window.setTimeout(() => setState({ phase: "idle", error: undefined }), latest.current.settleMs);
    } catch (thrown) {
      unreported.current = { thrown };
      setState({ phase: "error", error: latest.current.describeError(thrown) });
    }
  }, []);
  // onError runs after the error render commits, not inside the catch: there the button is still
  // disabled from `pending` and an error message rendered on `error` does not exist yet, so a
  // callback that moves focus to either would find nothing to focus.
  React.useEffect(() => {
    if (state.phase !== "error" || !unreported.current) return;
    const { thrown } = unreported.current;
    unreported.current = undefined;
    latest.current.onError?.(thrown);
  }, [state]);
  return { phase: state.phase, run, error: state.error };
}
