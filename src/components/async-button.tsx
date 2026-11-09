import * as React from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { describeActionError, fieldErrorsOf } from "../lib/errors";

// One object through its states: "Book firing" becomes "Booking…" becomes "Booked", in the same
// button, rather than the button being swapped for a spinner. The labels are stacked in one grid
// cell so the button is always as wide as its longest label and nothing around it shifts. The
// button stays enabled until the request starts (so a person can always try), and the outcome is
// announced politely for screen readers. When the action fails, the announcement carries what
// went wrong in the product's words before the retry label ("Kiln 2 is already booked. Try
// again"), because "Try again" alone does not say whether trying again can help.
//
// The button carries `data-phase` (and Button's `data-variant`), so a test reads which phase it is
// in without matching four stacked labels in its text (strata-react issue #48); `asyncButtonPhase`
// in strata-react/testing reads it.
//
// `useAsyncAction` also owns a form's field messages (strata-react issues #42 and #46). `validate`
// runs before the action, and messages it returns stop the run and land on `fieldErrors`, keyed by
// field; a server's per-field messages (an HttpError's `fieldErrors`, from a 422) land there too.
// A screen passes `fieldErrors.link` to `Field error=` and keeps no `problem` state of its own.
// Failing validation leaves the button idle, not "Try again": nothing was tried. `onInvalid` runs
// once the messages are on screen, to move focus to the first field named.

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
      <Button {...props} data-phase={phase} disabled={disabled || phase === "pending"} aria-disabled={phase === "pending" || undefined}>
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

/** Messages for a form's fields, keyed by field name. */
export type FieldErrors = Readonly<Record<string, string>>;

/** Options for `useAsyncAction`. */
export type AsyncActionOptions<A extends unknown[] = unknown[]> = {
  /** How long `done` shows before returning to `idle`. Default 2000ms. */
  settleMs?: number;
  /** Called with whatever the action threw, once the `error` render has committed: for logging, or to move focus to the retry button or an error message. */
  onError?: (error: unknown) => void;
  /** Turns what was thrown into `error`'s sentence, in the product's words. Default `describeActionError`: HTTP status sentences for `fetchJson`'s `HttpError`, else the Error's message. */
  describeError?: (error: unknown) => string | undefined;
  /** Checks the arguments before the action runs. A message for any field stops the run and is put on `fieldErrors`; the button stays idle. */
  validate?: (...args: A) => Record<string, string | undefined> | undefined;
  /** Called once validation's messages are on screen: to move focus to the first field named. */
  onInvalid?: (fieldErrors: FieldErrors) => void;
};

/** What `useAsyncAction` returns: the phase for `AsyncButton`, a stable `run`, and what went wrong while `phase` is `error`. */
export type AsyncAction<A extends unknown[]> = {
  phase: Phase;
  run: (...args: A) => Promise<void>;
  /** What went wrong, from `describeError`, while `phase` is `error`; otherwise undefined. Pass it to `AsyncButton`'s `error`. */
  error: string | undefined;
  /** What the action threw, while `phase` is `error`: to read more than the sentence (an HttpError's `status` or `body`). */
  thrown: unknown;
  /** Messages per field, from `validate` or from the server (an HttpError's `fieldErrors`). Pass each to its `Field`'s `error`. Cleared by the next run. */
  fieldErrors: FieldErrors;
  /** Clears one field's message (as the person edits it), or all of them. */
  clearFieldError: (field?: string) => void;
};

// The action and its options are read through a ref so `run` keeps one identity for the
// component's life: a caller can pass an inline arrow without re-rendering every child that takes
// `run`, and without the try/catch and error state each caller used to write to reach the phase.

/** Runs an async action and reports its phase, its error and any field messages. `done` returns to `idle` after `settleMs`; `run` never changes identity. */
export function useAsyncAction<A extends unknown[]>(
  action: (...args: A) => Promise<unknown>,
  { settleMs = 2000, onError, describeError = describeActionError, validate, onInvalid }: AsyncActionOptions<A> = {},
): AsyncAction<A> {
  const [state, setState] = React.useState<ActionState>(idle);
  const timer = React.useRef<number | undefined>(undefined);
  const unreported = React.useRef<{ thrown: unknown } | { invalid: FieldErrors } | undefined>(undefined);
  const latest = React.useRef({ action, onError, settleMs, describeError, validate, onInvalid });
  React.useLayoutEffect(() => {
    latest.current = { action, onError, settleMs, describeError, validate, onInvalid };
  });
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = React.useCallback(async (...args: A) => {
    window.clearTimeout(timer.current);
    const invalid = messages(latest.current.validate?.(...args));
    if (invalid) {
      unreported.current = { invalid };
      setState({ ...idle, fieldErrors: invalid });
      return;
    }
    setState({ ...idle, phase: "pending" });
    try {
      await latest.current.action(...args);
      setState({ ...idle, phase: "done" });
      timer.current = window.setTimeout(() => setState(idle), latest.current.settleMs);
    } catch (thrown) {
      unreported.current = { thrown };
      setState({ phase: "error", error: latest.current.describeError(thrown), thrown, fieldErrors: fieldErrorsOf(thrown) });
    }
  }, []);
  // onError and onInvalid run after their render commits, not inside run: there the button is
  // still disabled from `pending` and a message rendered on `error` does not exist yet, so a
  // callback that moves focus to either would find nothing to focus.
  React.useEffect(() => {
    const note = unreported.current;
    if (!note) return;
    if ("thrown" in note && state.phase === "error") latest.current.onError?.(note.thrown);
    else if ("invalid" in note) latest.current.onInvalid?.(note.invalid);
    else return;
    unreported.current = undefined;
  }, [state]);
  const clearFieldError = React.useCallback(
    (field?: string) =>
      setState((s) => {
        if (field === undefined) return Object.keys(s.fieldErrors).length ? { ...s, fieldErrors: {} } : s;
        if (!(field in s.fieldErrors)) return s;
        const { [field]: _gone, ...rest } = s.fieldErrors;
        return { ...s, fieldErrors: rest };
      }),
    [],
  );
  return { phase: state.phase, run, error: state.error, thrown: state.thrown, fieldErrors: state.fieldErrors, clearFieldError };
}

type ActionState = { phase: Phase; error: string | undefined; thrown: unknown; fieldErrors: FieldErrors };
const idle: ActionState = { phase: "idle", error: undefined, thrown: undefined, fieldErrors: {} };

/** The messages `validate` returned, without the empty ones; undefined when there are none. */
function messages(found: Record<string, string | undefined> | undefined): FieldErrors | undefined {
  if (!found) return undefined;
  const kept = Object.fromEntries(Object.entries(found).filter((e): e is [string, string] => Boolean(e[1])));
  return Object.keys(kept).length ? kept : undefined;
}
