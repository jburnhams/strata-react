// Where the player's skip buttons go (strata-react issue #387, from strata-reels' tape player). A long recording made of
// parts is skipped by its parts: a tape's scenes for the small skip and its chapters for the large
// one, as a person skims "the next scene", "the next occasion". A file without parts is skipped by
// time, 10 s and 1 min, the steps every video site has taught. Each level falls back on its own: a
// file with chapters and no scenes skips 10 s small and by chapter large.
//
// "Previous" goes to the start of the part being played, unless that start is under `restart`
// seconds behind (the person just went there), when it goes to the part before: what a CD player's
// back button does, and what someone pressing it twice means.

/** A named point on a player's timeline: a chapter (the default) or a scene within one. */
export type MediaMark = { time: number; label: string; kind?: "chapter" | "scene" };

/** The two skip levels. */
export type SkipLevel = "small" | "large";

/** The time steps for a file without parts at that level, in seconds. */
export type SkipSteps = { small?: number; large?: number };

/** What a skip does: its button's name, and where it goes (null when there is nowhere, at either end). */
export type SkipAction = { label: string; to: number | null; by: "mark" | "time" };

const LEVEL_KIND = { small: "scene", large: "chapter" } as const;

/** The marks a level skips by: scenes for small, chapters (and marks with no kind) for large, in time order. */
export function marksFor(marks: readonly MediaMark[], level: SkipLevel): number[] {
  const kind = LEVEL_KIND[level];
  return marks
    .filter((m) => (m.kind ?? "chapter") === kind)
    .map((m) => m.time)
    .sort((a, b) => a - b);
}

/** "1 min", "10 s", "90 s". */
function stepWords(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}

/**
 * Where a skip at `level` in `direction` from `time` goes: by the level's marks when the file has any
 * (the file's start counts as one), else by its time step. `restart` is how far into a part
 * "previous" still means its start. The target is kept within 0 to `duration` when that is known, and marks past it are not skipped to.
 */
export function skipAction(
  marks: readonly MediaMark[],
  level: SkipLevel,
  direction: -1 | 1,
  time: number,
  { steps = {}, duration = null, restart = 2 }: { steps?: SkipSteps; duration?: number | null; restart?: number } = {},
): SkipAction {
  // A mark past the end of the file that loaded (a chapter list longer than a proxy cut short) cannot be reached: a seek there
  // lands on the end, and the button would stay enabled there. The seek bar leaves the same marks out.
  const points = marksFor(marks, level).filter((p) => p >= 0 && (duration == null || p <= duration));
  const noun = LEVEL_KIND[level];
  if (points.length) {
    const all = points[0] > 0 ? [0, ...points] : points;
    if (direction > 0) {
      const next = all.find((p) => p > time + 0.01);
      return { label: `Next ${noun}`, to: next ?? null, by: "mark" };
    }
    const behind = all.filter((p) => p <= time - restart);
    return { label: `Previous ${noun}`, to: behind.length ? behind[behind.length - 1] : time > 0 ? 0 : null, by: "mark" };
  }
  const step = level === "small" ? (steps.small ?? 10) : (steps.large ?? 60);
  const raw = time + direction * step;
  const to = direction < 0 ? Math.max(0, raw) : duration ? Math.min(duration, raw) : raw;
  const label = `${direction < 0 ? "Back" : "Forward"} ${stepWords(step)}`;
  return { label, to: (direction < 0 && time <= 0) || (direction > 0 && duration != null && time >= duration) ? null : to, by: "time" };
}
