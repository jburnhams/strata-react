import * as React from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "./button";

// One object through its states: "Book firing" becomes "Booking…" becomes "Booked", in the same
// button, rather than the button being swapped for a spinner. The labels are stacked in one grid
// cell so the button is always as wide as its longest label and nothing around it shifts. The
// button stays enabled until the request starts (so a person can always try), and the outcome is
// announced politely for screen readers.

export type Phase = "idle" | "pending" | "done" | "error";

export type AsyncLabels = {
  idle: string;
  /** Ends in an ellipsis: "Saving…", "Booking…". */
  pending: string;
  /** The same verb, finished: "Saved", "Booked". */
  done: string;
  error?: string;
};

export function AsyncButton({
  phase,
  labels,
  disabled,
  ...props
}: Omit<ButtonProps, "children"> & { phase: Phase; labels: AsyncLabels }) {
  const errorLabel = labels.error ?? "Try again";
  const current = { idle: labels.idle, pending: labels.pending, done: labels.done, error: errorLabel }[phase];
  const Icon = { idle: null, pending: LoaderCircle, done: Check, error: CircleAlert }[phase];

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
        {phase === "done" ? labels.done : phase === "error" ? errorLabel : ""}
      </span>
    </>
  );
}

/** Runs an async action and reports its phase. `done` returns to `idle` after `settleMs`. */
export function useAsyncAction<A extends unknown[]>(action: (...args: A) => Promise<void>, settleMs = 2000) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = React.useCallback(
    async (...args: A) => {
      window.clearTimeout(timer.current);
      setPhase("pending");
      try {
        await action(...args);
        setPhase("done");
        timer.current = window.setTimeout(() => setPhase("idle"), settleMs);
      } catch {
        setPhase("error");
      }
    },
    [action, settleMs],
  );
  return [phase, run] as const;
}
