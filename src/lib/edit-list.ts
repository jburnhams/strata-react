// The arithmetic of an edit list (issue #397, from strata-reels' reel preview): clips that are stretches of source files, played
// one after another with no gap, so that output time is the sum of the clip lengths before. No DOM, so the rules are tested alone.
// Times are seconds; a clip is half-open, `[start, end)` in its file, the way the app's render cuts it.

/** One clip of an edit: a stretch `[start, end)` of a file, in seconds. `id` is the clip's own (an occurrence), not its file's. */
export type EditClip = {
  id: string;
  /** The file's URL. Clips of one file share it, so the player can carry on through them without loading again. */
  src: string;
  start: number;
  end: number;
  /** What the clip is, for the seek bar's marks and the "Clip 3 of 12" line: "Cutting the cake". */
  label?: string;
};

/** Where each clip starts in the edit, and the edit's length. */
export type EditTimes = { at: readonly number[]; duration: number };

/** Below this, two times are the same (a frame at 120 fps is 8 ms; float sums of rationals drift by far less). */
export const EDIT_EPS = 1e-6;

const length = (c: EditClip) => Math.max(0, c.end - c.start);

/** The start of each clip in edit time, and the total. */
export function editTimes(clips: readonly EditClip[]): EditTimes {
  const at: number[] = [];
  let t = 0;
  for (const c of clips) {
    at.push(t);
    t += length(c);
  }
  return { at, duration: t };
}

/** The clip playing at edit `time` and the time in its file. At a cut the later clip is playing (clips are half-open); at or past the end, the last clip at its end. Null for an empty edit. */
export function locateInEdit(
  clips: readonly EditClip[],
  times: EditTimes,
  time: number,
): { index: number; source: number } | null {
  if (clips.length === 0) return null;
  if (time >= times.duration - EDIT_EPS) {
    const last = clips.length - 1;
    return { index: last, source: clips[last].end };
  }
  const t = Math.max(0, time);
  // Binary search for the last clip that starts at or before `t`, skipping empty clips (they start where the next one does).
  let lo = 0;
  let hi = clips.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times.at[mid] <= t + EDIT_EPS) lo = mid;
    else hi = mid - 1;
  }
  while (lo > 0 && length(clips[lo]) === 0) lo--;
  return { index: lo, source: clips[lo].start + Math.max(0, t - times.at[lo]) };
}

/** Edit time of `source` seconds into clip `index`'s file, held inside the clip. */
export function editTimeOf(clips: readonly EditClip[], times: EditTimes, index: number, source: number): number {
  const c = clips[index];
  return times.at[index] + Math.min(Math.max(source - c.start, 0), length(c));
}

/** Whether `b` carries straight on from `a` in the same file, so playing through the cut needs no seek. */
export function continues(a: EditClip, b: EditClip): boolean {
  return a.src === b.src && Math.abs(b.start - a.end) < EDIT_EPS;
}

/** The first clip after `index` that does not carry straight on from the one before it: the next one a second element must have ready. Null when the rest of the edit is one stretch of the same file. */
export function nextBreak(clips: readonly EditClip[], index: number): number | null {
  for (let k = index + 1; k < clips.length; k++) if (!continues(clips[k - 1], clips[k])) return k;
  return null;
}
