// How much of a recording has been seen (strata-react issue #272, from Tubes, whose "Continue watching" and
// watch history count each second once). Two plain pieces, so the counting can be tested without an element:
// the ranges that have been played through, and the report an app is handed.
//
// The rules, from the app that needed them:
// - A second counts when the playhead passes it by playing. A seek or a skip counts nothing for the span
//   it jumps over; going back over a part adds nothing, because ranges are merged (each second once).
// - A span the player skipped on purpose (`MediaPlayer spans`) counts as seen: the person chose not to
//   watch it, and a resume or a "finished" test should not treat it as missed.
// - The position is reported with the seconds, so one report is enough to resume from.
//
// Checked: nothing in React Aria or the platform counts this (`HTMLMediaElement.played` exists but a browser
// may cap or merge its ranges, drops them on a new load, and has no way to add a skipped span).

/** What `onProgress` is called with. */
export type MediaProgress = {
  /** Where the playhead is, seconds into the file. */
  position: number;
  /** Seconds played through, each counted once; a span the player skipped counts as watched. */
  watched: number;
  /** The file's length in seconds, or null while it is not known. */
  duration: number | null;
};

/** Ranges of seconds that have been seen, merged, so each second is counted once. */
export type WatchedRanges = {
  add: (start: number, end: number) => void;
  /** Seconds in all, to a tenth. */
  total: () => number;
  clear: () => void;
};

export function createWatchedRanges(): WatchedRanges {
  let ranges: [number, number][] = [];
  return {
    add(start, end) {
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      const merged: [number, number][] = [];
      let from = start;
      let to = end;
      for (const [a, b] of ranges) {
        if (b < from || a > to) merged.push([a, b]);
        else {
          from = Math.min(from, a);
          to = Math.max(to, b);
        }
      }
      merged.push([from, to]);
      ranges = merged.sort((x, y) => x[0] - y[0]);
    },
    total: () => Math.round(ranges.reduce((sum, [a, b]) => sum + (b - a), 0) * 10) / 10,
    clear: () => void (ranges = []),
  };
}
