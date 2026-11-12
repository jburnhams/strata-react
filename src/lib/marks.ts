// The arithmetic behind `MarkableText` (issue #187): a selection is a run of ids in document order,
// never a DOM range, so it survives a virtualised list unmounting the rows it crosses. No DOM here.

/** The ids from `a` to `b` inclusive, in document order whichever way round they are given. Empty when either is not in `ids`. */
export function rangeBetween(ids: readonly string[], a: string | null, b: string | null): string[] {
  if (a === null || b === null) return [];
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0) return [];
  return ids.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** How many ids carry each mark key. Ids with no mark are not counted. */
export function countMarks(marks: Readonly<Record<string, string | undefined>>, ids?: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids ?? Object.keys(marks)) {
    const m = marks[id];
    if (m) out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

/** The id `by` places from `from` in `ids`, held to the ends; the first (or last) when `from` is not set. */
export function stepId(ids: readonly string[], from: string | null, by: number): string | null {
  if (ids.length === 0) return null;
  const i = from === null ? -1 : ids.indexOf(from);
  if (i < 0) return by >= 0 ? ids[0]! : ids[ids.length - 1]!;
  return ids[Math.min(Math.max(i + by, 0), ids.length - 1)]!;
}
