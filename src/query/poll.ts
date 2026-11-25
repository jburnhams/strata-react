import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";

// Pausing a polled read (strata-react issue #344, from the status page in jburnhams/homepage). A
// screen that re-reads every few seconds needs the same three parts every time: whether it is
// paused, a button that says so, and when the readings were taken. A person reading a table while
// it re-sorts under them needs the pause (ux-research `patterns.md` on live data: the person, not
// the poll, decides when the view moves); a page whose readings may be minutes old needs the time.
// Written by hand it was a `useState`, a button with `aria-pressed`, `refetchInterval: paused ?
// false : ms` and an "updated 12:00" line, in every live screen.
//
// - `usePoll({ every })` holds the state and is passed to `useLoad({ poll })`, which polls at its
//   interval while it is not paused, notes when each read arrived, and reads once at once when the
//   poll is resumed (what was on screen is as old as the pause).
// - `PauseButton` (components/pause-button.tsx) takes the same object, with its words fixed.
// - One `Poll` may serve several reads: the page pauses together. The time is the latest read's. A read
//   with its own pace takes `poll.with({ every })`: same pause and time, other interval (#349).
// - `useJob` keeps its own interval: a job is polled only while it runs, which is not the person's
//   to pause.

/** The state of a polled read: its interval, whether the person paused it and when it last read. Made by `usePoll`. */
export type Poll = {
  /** Milliseconds between reads while not paused. */
  every: number;
  paused: boolean;
  /** Pause or resume. Resuming reads at once. */
  toggle: () => void;
  /** When the last read arrived, or `null` before the first. */
  updatedAt: Date | null;
  /** Used by `useLoad`: records the time of the read that just arrived (TanStack's `dataUpdatedAt`; 0 is none). */
  note: (dataUpdatedAt: number) => void;
  /** The same poll at another pace: a read that must be slower (or faster) than the page's keeps the shared pause, resume and "updated" time (`useLoad({ poll: poll.with({ every: 60_000 }) })`). */
  with: (override: { every: number }) => Poll;
};

/** The pause state and last-read time of a polled screen: pass it to `useLoad({ poll })` and to `PauseButton`. */
export function usePoll({ every, paused: initiallyPaused = false }: { every: number; paused?: boolean }): Poll {
  const [paused, setPaused] = React.useState(initiallyPaused);
  const [at, setAt] = React.useState(0);
  const toggle = React.useCallback(() => setPaused((p) => !p), []);
  const note = React.useCallback((dataUpdatedAt: number) => setAt((previous) => Math.max(previous, dataUpdatedAt)), []);
  return React.useMemo(() => {
    const poll: Poll = { every, paused, toggle, updatedAt: at ? new Date(at) : null, note, with: (override) => ({ ...poll, every: override.every, with: (again) => poll.with(again) }) };
    return poll;
  }, [every, paused, toggle, at, note]);
}

/** Wires a query to its `Poll`: the time of each read, and one read when the poll is resumed. */
export function usePollBinding(poll: Poll | undefined, query: Pick<UseQueryResult, "dataUpdatedAt" | "refetch">) {
  const note = poll?.note;
  React.useEffect(() => {
    if (note && query.dataUpdatedAt) note(query.dataUpdatedAt);
  }, [note, query.dataUpdatedAt]);
  const paused = poll?.paused;
  const wasPaused = React.useRef(paused);
  React.useEffect(() => {
    if (wasPaused.current && paused === false) void query.refetch();
    wasPaused.current = paused;
    // `refetch` is stable per query; only the pause changing should read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
}
