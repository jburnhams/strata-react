// The arithmetic of a time axis, kept apart from drawing so it can be tested without a layout
// (strata issue #77). Times are numbers in one unit the app picks (seconds for media, minutes or
// hours for a schedule); `pxPerUnit` is the zoom.

/** Steps a person would write on a scale, in seconds: 1, 2, 5 and 10 × 10ⁿ below a minute, then 15 s, 30 s, minutes, quarter hours, hours, days. ux-research components.md §3.8: ticks land on values people would write. */
const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];

/** The smallest step whose ticks are at least `minGapPx` apart at this zoom, so labels thin out instead of colliding. */
export function tickStep(pxPerUnit: number, minGapPx = 80): number {
  return STEPS.find((s) => s * pxPerUnit >= minGapPx) ?? STEPS[STEPS.length - 1];
}

/** Tick times from `from` to `to` inclusive, on multiples of `step`. */
export function ticksBetween(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(from / step - 1e-9);
  for (let i = first; i * step <= to + 1e-9; i++) out.push(Math.round(i * step * 1e6) / 1e6 || 0);
  return out;
}

/** A tick's label: m:ss, h:mm:ss, with tenths or hundredths when the step is under a second. */
export function tickLabel(time: number, step: number): string {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const whole = Math.floor(time + 1e-9);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  const base = h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  return decimals ? `${base}.${String(Math.round((time - whole) * 10 ** decimals)).padStart(decimals, "0")}` : base;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The point to snap `time` to: the nearest of `points` within `thresholdPx` at this zoom, or `null`. */
export function snapTo(time: number, points: readonly number[], pxPerUnit: number, thresholdPx = 8): { time: number; point: number } | null {
  let best: number | null = null;
  for (const p of points) if (Math.abs(p - time) * pxPerUnit <= thresholdPx && (best === null || Math.abs(p - time) < Math.abs(best - time))) best = p;
  return best === null ? null : { time: best, point: best };
}

/** Round away float noise from adding steps (0.1 + 0.2). */
export const tidy = (n: number) => Math.round(n * 1e6) / 1e6;
