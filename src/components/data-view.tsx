import * as React from "react";
import { CircleAlert, History, RotateCcw } from "lucide-react";
import { Button } from "./button";
import { format } from "../lib/format";
import { cn } from "../lib/utils";

// Every view of remote data goes through DataView, and DataView will not type-check without a
// skeleton and an empty state. Generated UI renders the happy path; this makes the other three
// states part of the component's signature rather than a review comment.
//
// A failed refresh is not a failed read (strata-react issue #26). Once data has arrived, a later
// refetch that fails (a poll while the server restarts, a Try again on a flaky link) leaves the
// data on screen with `stale` set: a polite notice above it says what happened, when the data
// shown was read, and offers Try again. Swapping a whole dashboard for an error panel throws away
// readings the person was using, and a silent failure lets them act on old numbers as if live, so
// the data stays and its age is said in words. Only a read that never produced data is an error.
//
// The failed read's look is replaceable (strata-react issue #50): an app with a second look (the
// Tubes viewer, with its own tokens and pill buttons) passes `error`, a render function given the
// message and the retry, and keeps the state machine (loading, error, ready, stale, empty) rather
// than copying DataView to change one panel. Whatever it draws sits inside a `role="alert"` box,
// so the failure is still announced; the default is `LoadError`, exported for reuse.

/** Data still shown after a refresh failed: why the refresh failed, when the data was read, and the Try again. */
export type Stale = {
  /** Why the refresh failed, for a person: the sentence an error panel would have shown. */
  message: string;
  /** When the data on screen was read. */
  readAt: Date;
  /** Fetch again. */
  retry: () => void;
  /** A fetch is on its way (a Try again or the next poll). */
  retrying?: boolean;
};

/** The state of one remote read, for `DataView`: loading, failed with no data, or ready (and `stale` when a later refresh failed). */
export type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; data: T; stale?: Stale };

/** What a failed read hands to an `error` renderer: the sentence for a person, and the Try again. */
export type LoadFailure = { message: string; retry: () => void };

/** The default failed-read panel: the reason on the danger tint, with Try again. Its parent carries `role="alert"`. */
export function LoadError({ message, retry, className }: LoadFailure & { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start gap-3 rounded-surface bg-danger-subtle p-4 text-danger", className)}>
      <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
      <p className="min-w-0 flex-1 type-body">{message}</p>
      <Button size="sm" onClick={retry}>
        <RotateCcw aria-hidden />
        Try again
      </Button>
    </div>
  );
}

const defaultError = (failure: LoadFailure) => <LoadError {...failure} />;

/** Every view of remote data: renders `skeleton` while loading, an alert with Try again on error, `empty` when `isEmpty`, else `children(data)`, under a `StaleNotice` when a refresh failed. The skeleton and empty state are required. */
export function DataView<T>({
  state,
  isEmpty,
  skeleton,
  empty,
  children,
  staleNotice = (stale) => <StaleNotice stale={stale} />,
  error = defaultError,
  className,
}: {
  state: Load<T>;
  /** When the loaded data counts as empty. For arrays, `(rows) => rows.length === 0`. */
  isEmpty: (data: T) => boolean;
  /** Mirrors the final layout, so nothing jumps when data arrives. Not a centred spinner. */
  skeleton: React.ReactNode;
  /** What goes here and how to add it. An `EmptyState`, not an illustration. */
  empty: React.ReactNode;
  children: (data: T) => React.ReactNode;
  /** Shown above the data when a refresh failed. Defaults to a `StaleNotice`; pass one with the product's words for what is old ("Readings from 13:50"). */
  staleNotice?: (stale: Stale) => React.ReactNode;
  /** Draws a read that failed with no data, given the message and the retry. Defaults to `LoadError`. Rendered inside a `role="alert"` box. */
  error?: (failure: LoadFailure) => React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)} aria-busy={state.status === "loading" || undefined}>
      {state.status === "loading" && skeleton}
      {state.status === "error" && <div role="alert">{error({ message: state.message, retry: state.retry })}</div>}
      {state.status === "ready" && (
        <>
          {state.stale && staleNotice(state.stale)}
          {isEmpty(state.data) ? empty : children(state.data)}
        </>
      )}
    </div>
  );
}

/** When `readAt` was, for a person: the clock time today, else the weekday and time. */
function readTime(readAt: Date, now = new Date()) {
  return readAt.toDateString() === now.toDateString() ? format.clock.format(readAt) : format.shortDay.format(readAt);
}

/** The notice over data whose refresh failed: what happened, how old the data shown is, and Try again. A polite status, not an alert: nothing was lost. */
export function StaleNotice({
  stale,
  shown,
  className,
}: {
  stale: Stale;
  /** What is old, in the product's words, given when it was read ("13:50", or "Sat 13:50" before today). Defaults to "Showing data from 13:50." */
  shown?: (when: string) => React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn("mb-4 flex flex-wrap items-start gap-3 rounded-surface bg-warning-subtle p-3 text-warning", className)}>
      <History aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 type-body-sm">
        {stale.message} {shown ? shown(readTime(stale.readAt)) : `Showing data from ${readTime(stale.readAt)}.`}
      </p>
      <Button size="sm" onClick={stale.retry} disabled={stale.retrying}>
        <RotateCcw aria-hidden />
        {stale.retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
}

// An empty state teaches the next action. No illustration slot exists, on purpose.
/** An empty state that teaches the next action: a title, a sentence and an action. No illustration slot, on purpose. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-start gap-2 border-y border-border py-6">
      <p className="type-heading">{title}</p>
      {children && <p className="max-w-prose type-body text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A placeholder block for a loading layout. Size it with layout classes so it mirrors the final content. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-control bg-muted motion-safe:animate-pulse", className)} />;
}
