import { clamp, tidy } from "./timeline";

// The arithmetic of a gapless sequence (issue #191): a beat grid to snap and step along, and the
// room a cut may move in. Times are seconds. No DOM, so the rules are tested alone.

/** A grid: a step in seconds (a beat every 0.5 s from 0) or the exact times of the beats. */
export type Grid = number | readonly number[];

const EPS = 1e-9;

/** The grid point nearest to `time`, or `time` itself when there is no grid. */
export function snapToGrid(time: number, grid: Grid | undefined): number {
  if (grid === undefined) return time;
  if (typeof grid === "number") return grid > 0 ? tidy(Math.round(time / grid) * grid) : time;
  let best = time;
  let gap = Infinity;
  for (const p of grid) if (Math.abs(p - time) < gap) [best, gap] = [p, Math.abs(p - time)];
  return best;
}

/** The next grid point after `time` in a direction (`1` later, `-1` earlier); `fallback` is the step when there is no grid. A point `time` is already on is stepped past. */
export function stepOnGrid(time: number, dir: 1 | -1, grid: Grid | undefined, fallback: number): number {
  if (grid === undefined) return tidy(time + dir * fallback);
  if (typeof grid === "number") {
    if (grid <= 0) return tidy(time + dir * fallback);
    return tidy((dir > 0 ? Math.floor(time / grid + EPS) + 1 : Math.ceil(time / grid - EPS) - 1) * grid);
  }
  const points = [...grid].sort((a, b) => a - b);
  const found = dir > 0 ? points.find((p) => p > time + EPS) : [...points].reverse().find((p) => p < time - EPS);
  return found ?? tidy(time + dir * fallback);
}

/** Grid points inside `[from, to]`, for drawing on a ruler. At most `limit`, so a fine grid on a long axis stays cheap. */
export function gridPoints(grid: Grid | undefined, from: number, to: number, limit = 2000): number[] {
  if (grid === undefined) return [];
  if (typeof grid !== "number") return grid.filter((p) => p >= from - EPS && p <= to + EPS).slice(0, limit);
  if (grid <= 0) return [];
  const out: number[] = [];
  for (let i = Math.ceil(from / grid - EPS); i * grid <= to + EPS && out.length < limit; i++) out.push(tidy(i * grid) || 0);
  return out;
}

/** What limited a cut: which side, and the reason the app gave. */
export type CutLimit = { side: "min" | "max"; at: number; reason?: string };

/** Puts `time` inside the room, and says which end held it (with the app's reason) when one did. */
export function clampToRoom(time: number, room: { min: number; max: number; minReason?: string; maxReason?: string }): { time: number; limit: CutLimit | null } {
  const t = clamp(time, room.min, room.max);
  if (t > time + EPS) return { time: t, limit: { side: "min", at: room.min, reason: room.minReason } };
  if (t < time - EPS) return { time: t, limit: { side: "max", at: room.max, reason: room.maxReason } };
  return { time: t, limit: null };
}

/** Where a dragged cut lands: held by the room (saying which end, if the pointer is beyond it), otherwise snapped to the grid, and never to a grid point outside the room. */
export function settleCut(wanted: number, grid: Grid | undefined, room: { min: number; max: number; minReason?: string; maxReason?: string }): { time: number; limit: CutLimit | null } {
  const held = clampToRoom(wanted, room);
  const snapped = snapToGrid(held.time, grid);
  return { time: snapped >= room.min - EPS && snapped <= room.max + EPS ? snapped : held.time, limit: held.limit };
}
