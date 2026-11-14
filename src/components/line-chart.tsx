import * as React from "react";
import { VisuallyHidden, mergeProps, useFocusRing, useSlider, useSliderThumb } from "react-aria";
import { useSliderState } from "react-stately";
import { Button as AriaButton } from "react-aria-components";
import { cn } from "../lib/utils";
import { CursorScope, useSharedCursor, type CursorMapping } from "./cursor";
import { Tooltip } from "./tooltip";

// A line chart with the defaults real product screens use: one measured series in one hue, a 2px
// straight line with no fill and no markers, 3 to 5 faint gridlines, no y-axis line, no legend for a
// single series (the series is labelled where it ends). Values never live only in a hover tooltip:
// the latest and peak readings are labelled on the chart and every reading is in a table for screen
// readers. Optional extras exist only where they answer a question: a dashed `planned` series, a
// horizontal `band` (a threshold that matters), and a `now` marker.
//
//
// `colourScale` colours the measured line by its own value, for subjects where that colour is a
// fact rather than decoration: a kiln's glow by temperature, water by depth. The y position still
// carries the value, so the colour is never the only cue. Without a reason in DESIGN.md, use one
// hue.
//
// It draws in real pixels (measured with ResizeObserver) rather than scaling a fixed viewBox, so
// the 12px labels stay 12px on a phone. Because the labels keep their size, the chart thins the
// x ticks itself when they would collide (every second, third… tick, so the rhythm stays even)
// and keeps the first and last label inside the chart, rather than overlapping on a phone.
//
// The y-axis autoscales to four gridline steps of a size people write on a scale, from zero (or
// below it, if a reading is negative). `yMin` and `yMax` pin either end for a quantity whose range
// is a fact of the subject (a percentage is 0 to 100, a battery 0 to 1): autoscaling a machine at
// 1% CPU gives a 0 to 8% axis that makes it look busy (strata-react issue #23). A pin is a floor on
// the extent, never a crop: a reading outside it widens the axis, because a chart that hides a
// reading is worse than one with an untidy scale.
//
// Reading a value (`readout`, `onPick`) is React Aria's slider hooks (`useSlider`, `useSliderThumb`,
// `useSliderState`) laid over the plot as `ReadingSlider`: the pointer press, the thumb's ARIA and the
// hidden range input come from them. Two things are ours on top, checked in the hooks' source. The value
// text: `useSliderState` formats through an object with `format`, `formatRange` and `resolvedOptions`, so
// it is given one that says "300 m: 60 m up" instead of an `Intl.NumberFormat`. The stepping: the
// state steps a continuous number by a fixed step, and a series has uneven readings, so a drag or a
// press is snapped to the nearest reading and the keys (arrows, Home, End, Enter) are a capture handler
// on the input that moves between readings; the hooks' own arrow handling is stopped. Hover is drawn
// by the plot itself, since a hook has no notion of a pointer that is only resting.
//
//
// Spans, marks, a log axis and stacked charts (strata-react issue #183, from strata-360's elevation
// and pace charts, where stops are shaded and every clip is marked on both). The decisions:
// - `spans` are shaded behind the line in a tone's subtle role, named in the key and in the
//   screen-reader text: a shade is never the only way to know a stop is a stop.
// - `marks` are real controls on the line, one tab stop with arrows between them (roving), because
//   twelve clips must not be twelve tab stops; each is named by its label and x, pressing one is
//   `onMarkSelect`, `renderMarkCard` is the words a tooltip shows, and each is listed for screen readers.
// - `yScale="log"` chooses its own 1, 2, 5 ticks per decade; a reading at or below zero cannot be
//   drawn, so the line breaks there and the chart says how many were left out. `yInvert` puts the
//   smaller value at the top (pace: faster is up).
// - `xTicks` may be a function of the visible range, so labels switch between clock time and distance
//   as the range changes, and `xDomain` fixes the range for charts that share an axis.
// - `LineChartGroup` stacks charts on one x axis: one shared range, one `CursorScope` (see cursor.tsx),
//   so hovering or arrowing in any chart puts a rule and its own reading in every chart, and one
//   `current` and `onPick` for all.
//
// `range` (issue #244, from strata-360's elevation and speed tracks): a downsampled series loses its
// extremes, so each reading may carry the lowest and highest value it stands for, as `low` and `high`
// arrays that line up with `series` by index. They are drawn as one translucent area in the series
// colour behind the line, widen the y-axis (a chart that hides an extreme is worse than an untidy
// scale), and are said wherever the reading is: the hover and keyboard readout ("2 km: 340 m (310 m
// to 372 m)"), a column of the screen-reader table, and a key entry. The same fill rule as `area`:
// flat and pale, never a gradient. It is named `range` because `band` is already the threshold.
export type Point = { x: number; y: number };

/** Shading tones for `spans`: the role's subtle fill. */
export type SpanTone = "neutral" | "info" | "success" | "warning" | "danger";
const TONE_FILL: Record<SpanTone, string> = { neutral: "var(--muted)", info: "var(--info-subtle)", success: "var(--success-subtle)", warning: "var(--warning-subtle)", danger: "var(--danger-subtle)" };

/** A stretch of x shaded behind the line (stops, usable footage, a chosen stretch). */
export type ChartSpan = { from: number; to: number; label: string; tone?: SpanTone };

/** A labelled point on the line, as a control. */
export type ChartMark = {
  x: number;
  /** Its name: "Clip 4". Said with its x, listed for screen readers and shown on hover and focus. */
  label: string;
  /** Any CSS colour, normally a role. Default the foreground. */
  colour?: string;
  selected?: boolean;
};

export type LineChartProps = {
  /** What the chart shows, as a sentence. Used as the accessible name and the table caption. */
  label: string;
  series: Point[];
  seriesLabel: string;
  planned?: Point[];
  plannedLabel?: string;
  band?: { below: number; label: string };
  /** The lowest and highest value each reading stands for, by index into `series` (a downsampled track keeps its extremes). Drawn as a pale area behind the line, included in the y-axis, said in the readout and the table. `label` names it in the key: "Lowest to highest in each stretch". */
  range?: { low: readonly number[]; high: readonly number[]; label: string };
  formatX: (x: number) => string;
  /** What x is, as the screen-reader table's first column heading: "Distance", "Day". Default "Time". */
  xLabel?: string;
  formatY: (y: number) => string;
  /** Where to put x labels, in x units, or a function of the visible range (so labels can switch between clock time and distance). The chart drops every other one (and so on) when they would overlap at its width. */
  xTicks: number[] | ((range: { min: number; max: number }) => number[]);
  /** A fixed x range, for charts that share one axis (`LineChartGroup` sets it). Default: the series' own. */
  xDomain?: readonly [number, number];
  /** `"none"` draws no x labels: the upper charts of a stack. Default `"labels"`. */
  xAxis?: "labels" | "none";
  /** `"log"` for a quantity that spans decades (pace, a magnitude). Ticks are 1, 2, 5 steps chosen here; a reading at or below zero is not drawn and is counted under the chart. Default `"linear"`. */
  yScale?: "linear" | "log";
  /** The smaller value at the top (pace: faster is up). */
  yInvert?: boolean;
  /** Stretches shaded behind the line, named in the key and the text for screen readers. */
  spans?: readonly ChartSpan[];
  /** Labelled points on the line. One tab stop; arrows move between them. */
  marks?: readonly ChartMark[];
  /** A mark was pressed (a click, Enter or Space). */
  onMarkSelect?: (mark: ChartMark) => void;
  /** What shows beside a mark on hover and focus: words, as in `Tooltip`. Default the mark's label and x. */
  renderMarkCard?: (mark: ChartMark) => React.ReactNode;
  /** Join the nearest `CursorScope`: hovering or arrowing here puts a rule and this chart's reading in every member, and theirs shows here. `true` when x is the scope's unit; a mapping when it is not (time here, distance there). */
  cursor?: boolean | CursorMapping;
  /** Pin the bottom of the y-axis (default: 0, or lower if a reading is negative). A reading below it still shows. */
  yMin?: number;
  /** Pin the top of the y-axis, for a bounded quantity such as a percentage (`yMax={100}`), so a low reading looks low. Choose a range that divides into four steps. A reading above it still shows. */
  yMax?: number;
  /** CSS colour for the measured series. Defaults to the first chart token. */
  colour?: string;
  /** Colour the measured series by value: each stop applies from `at` upwards, blending to the
   *  next. Only where the colour means something in the subject; record the reason in DESIGN.md. */
  colourScale?: { at: number; colour: string }[];
  /** Says what the colours mean, shown beside the legend swatch when `colourScale` is set. */
  colourScaleLabel?: string;
  /** What the end of the line is. `"now"` marks the last reading with a rule, a dot and "<value> now": right for a live reading, where the last point is the present. `"none"` leaves it unmarked: right for a series whose x is not time running up to now (an elevation profile, where the last point is the finish). Default `"now"`, or `"none"` when `current` is set, since `current` already says where now is. The peak label stays either way. */
  end?: "now" | "none";
  /** The current x, supplied by the app and drawn as a rule with its value ("now" in a replay, a playhead). Cheap to update often. */
  current?: number;
  /** The value at the rule, as a sentence part. Default: `formatX` and the value read off the line. */
  formatCurrent?: (at: { x: number; y: number }) => string;
  /** Read values at the pointer, and by keyboard on the plot (arrows, Home, End). `readout` words the reading; default `formatX: formatY`. */
  readout?: boolean | ((p: Point) => string);
  /** The viewer chose a reading (a click, or Enter on the plot): its x, so the app can seek or select. */
  onPick?: (x: number) => void;
  /** One flat, pale tint under the line. Only where the area carries the meaning (a profile, a running total). */
  area?: boolean;
  height?: number;
  className?: string;
};

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The smallest step of a size people write on a scale (1, 2, 2.5, 4 or 5 × 10ⁿ) at least `raw`. */
function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 4, 5, 10].map((m) => m * mag).find((s) => s >= raw * (1 - 1e-9)) ?? 10 * mag;
}

/**
 * The y-axis: four equal gridline steps covering every value. With no pins the steps are a size
 * people write on a scale (1, 2, 2.5, 4 or 5 × 10ⁿ), from zero or a round number below the lowest
 * reading. A pinned end is used as given unless a value lies beyond it.
 */
export function yScale(values: number[], pin: { min?: number; max?: number } = {}) {
  const finite = values.filter(Number.isFinite);
  const dMin = finite.length ? Math.min(...finite) : 0;
  const dMax = finite.length ? Math.max(...finite) : 0;
  const pinMin = pin.min !== undefined && dMin >= pin.min ? pin.min : undefined;
  const pinMax = pin.max !== undefined && dMax <= pin.max ? pin.max : undefined;
  let lo = pinMin ?? Math.min(0, dMin);
  // Readings all at a pinned top (say all -10 under yMax={-10}) leave no span: open one below.
  if (pinMax !== undefined && pinMin === undefined && !(pinMax > lo)) lo = pinMax - (Math.abs(pinMax) || 4);
  let min: number;
  let max: number;
  if (pinMax !== undefined) {
    max = pinMax;
    // Only the bottom is free: round it down to a step of the span, so 0 stays 0.
    min = pinMin ?? (lo < 0 ? Math.floor(lo / niceStep((max - lo) / 4)) * niceStep((max - lo) / 4) : 0);
  } else {
    const hi = Math.max(dMax, pin.max ?? -Infinity);
    // All-zero (or empty) data still needs a positive extent, or every coordinate divides by zero.
    let step = hi > lo ? niceStep((hi - lo) / 4) : 1;
    let base = pinMin ?? Math.floor(lo / step) * step;
    while (base + 4 * step < hi) {
      step = niceStep(step * 1.01);
      base = pinMin ?? Math.floor(lo / step) * step;
    }
    min = base;
    max = base + 4 * step;
  }
  if (!(max > min)) max = min + 4;
  return { min, max, ticks: [0, 1, 2, 3, 4].map((i) => min + ((max - min) * i) / 4) };
}

/** What a y scale gives the chart: its ends, ticks and where a value falls between them (0 at `min`, 1 at `max`). */
export type YScale = { min: number; max: number; ticks: number[]; at: (v: number) => number; log: boolean };

const linearScale = (values: number[], pin: { min?: number; max?: number }): YScale => {
  const y = yScale(values, pin);
  return { ...y, at: (v) => (v - y.min) / (y.max - y.min), log: false };
};

/** The 1, 2, 5 × 10ⁿ values in `[lo, hi]`. */
function decadeTicks(lo: number, hi: number, mantissas = [1, 2, 5]) {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)) + 1; e++) for (const m of mantissas) out.push(Number((m * 10 ** e).toPrecision(12)));
  return out;
}

/**
 * A logarithmic y axis over the positive values: the ends are the nearest 1, 2, 5 steps outside the
 * data, the ticks are those steps, thinned to whole decades and then every k-th decade when there are
 * more than seven. Values at or below zero are ignored (the chart reports them). A pinned end is used as
 * given when it is positive and does not cut a reading off.
 */
export function logScale(values: number[], pin: { min?: number; max?: number } = {}): YScale {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  const dMin = positive.length ? Math.min(...positive) : 1;
  const dMax = positive.length ? Math.max(...positive) : 10;
  const grid = decadeTicks(dMin, dMax);
  const pinMin = pin.min !== undefined && pin.min > 0 && pin.min <= dMin ? pin.min : undefined;
  const pinMax = pin.max !== undefined && pin.max > 0 && pin.max >= dMax ? pin.max : undefined;
  let min = pinMin ?? Math.max(...grid.filter((t) => t <= dMin * (1 + 1e-9)));
  let max = pinMax ?? Math.min(...grid.filter((t) => t >= dMax * (1 - 1e-9)));
  if (!(max > min)) max = min * 10;
  let ticks = decadeTicks(min, max).filter((t) => t >= min * (1 - 1e-9) && t <= max * (1 + 1e-9));
  if (ticks.length > 7) ticks = decadeTicks(min, max, [1]).filter((t) => t >= min * (1 - 1e-9) && t <= max * (1 + 1e-9));
  if (ticks.length > 7) {
    const k = Math.ceil(ticks.length / 6);
    ticks = ticks.filter((_, i) => i % k === 0);
  }
  const span = Math.log10(max) - Math.log10(min);
  return { min, max, ticks, at: (v) => (Math.log10(v) - Math.log10(min)) / span, log: true };
}

type Limit = { x: number; low: number; high: number };

/** The range of each reading, sorted by x; a reading without two finite numbers has none, and arrays of different lengths use the shorter. */
function rangeLimits(series: readonly Point[], range: LineChartProps["range"]): Limit[] {
  if (!range) return [];
  const out: Limit[] = [];
  for (let i = 0; i < Math.min(series.length, range.low.length, range.high.length); i++) {
    const a = range.low[i];
    const b = range.high[i];
    if (Number.isFinite(a) && Number.isFinite(b)) out.push({ x: series[i].x, low: Math.min(a, b), high: Math.max(a, b) });
  }
  return out.sort((p, q) => p.x - q.x);
}

function rangePath(limits: readonly Limit[], sx: (x: number) => number, sy: (v: number) => number): string {
  const top = limits.map((l, i) => `${i ? "L" : "M"}${sx(l.x).toFixed(1)},${sy(l.high).toFixed(1)}`);
  const bottom = [...limits].reverse().map((l) => `L${sx(l.x).toFixed(1)},${sy(l.low).toFixed(1)}`);
  return `${top.join("")}${bottom.join("")}Z`;
}

function rangeText(limits: readonly Limit[], x: number, formatY: (y: number) => string, joiner = "–"): string {
  const l = limits.find((r) => r.x === x);
  return l ? `${formatY(l.low)}${joiner}${formatY(l.high)}` : "";
}

/** The value of a series at x, read between the two readings either side (flat beyond the ends). Series need not be sorted. */
export function valueAt(series: readonly Point[], x: number): number {
  const sorted = [...series].sort((p, q) => p.x - q.x);
  if (!sorted.length) return 0;
  if (x <= sorted[0].x) return sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (x <= sorted[i].x) {
      const [p0, p1] = [sorted[i - 1], sorted[i]];
      return p0.y + ((p1.y - p0.y) * (x - p0.x)) / (p1.x - p0.x || 1);
    }
  }
  return sorted[sorted.length - 1].y;
}

/** Roughly how wide a 12px caption label is, in px. jsdom cannot measure text, so the chart estimates. */
const labelWidth = (text: string) => text.length * 7;

/**
 * The x ticks that fit at this width: every k-th tick, the smallest k for which neighbouring labels
 * leave a gap, so the spacing stays even. `scale` maps an x value to a pixel.
 */
export function fitTicks(ticks: number[], scale: (x: number) => number, widthOf: (t: number) => number, gap = 12) {
  if (ticks.length < 3) return ticks;
  const sorted = [...ticks].sort((a, b) => a - b);
  for (let k = 1; k < sorted.length; k++) {
    const kept = sorted.filter((_, i) => i % k === 0);
    const fits = kept.every((t, i) => i === 0 || scale(t) - scale(kept[i - 1]) >= (widthOf(t) + widthOf(kept[i - 1])) / 2 + gap);
    if (fits) return kept;
  }
  return sorted.slice(0, 1);
}

/** One measured series, drawn in real pixels, with the peak and current readings labelled on the chart and every reading in a screen-reader table. Optional plan, threshold band and `colourScale`. */
export function LineChart({
  label,
  series,
  seriesLabel,
  planned,
  plannedLabel,
  band,
  formatX,
  xLabel = "Time",
  formatY,
  xTicks,
  xDomain,
  xAxis = "labels",
  yScale: yMode = "linear",
  yInvert = false,
  spans,
  marks,
  onMarkSelect,
  renderMarkCard,
  cursor: cursorProp,
  yMin,
  yMax,
  colour = "var(--chart-1)",
  colourScale,
  colourScaleLabel,
  current,
  end,
  formatCurrent,
  readout,
  onPick,
  area,
  range,
  height = 280,
  className,
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const shared = useSharedCursor();
  const joined = Boolean(cursorProp) && shared !== null;
  const mapping = typeof cursorProp === "object" ? cursorProp : undefined;
  const gradientId = `heat-${React.useId().replace(/[^\w-]/g, "")}`;
  const limits = React.useMemo(() => rangeLimits(series, range), [series, range]);
  const all = [...series, ...(planned ?? []), ...limits.flatMap((l) => [{ x: l.x, y: l.low }, { x: l.x, y: l.high }])];
  const xMin = xDomain ? xDomain[0] : Math.min(...all.map((p) => p.x));
  const xMax = xDomain ? xDomain[1] : Math.max(...all.map((p) => p.x));
  const log = yMode === "log";
  const y = log
    ? logScale(
        all.map((p) => p.y),
        { min: yMin, max: yMax },
      )
    : linearScale(
        all.map((p) => p.y),
        { min: yMin, max: yMax },
      );
  const undrawn = log ? series.filter((p) => !(p.y > 0)).length : 0;

  const pad = { top: 16, right: 16, bottom: xAxis === "none" ? 8 : 28, left: 56 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const sx = (x: number) => pad.left + ((x - xMin) / (xMax - xMin || 1)) * w;
  // 0 at the bottom, 1 at the top (swapped when inverted); a value off a log scale has no place and is not drawn.
  const sy = (v: number) => {
    const f = y.at(v);
    return pad.top + (yInvert ? f : 1 - f) * h;
  };
  const xLabelWidth = (t: number) => labelWidth(formatX(t));
  // Keep the first and last labels inside the chart instead of centring them past its edge.
  const xLabelAt = (t: number) => {
    const half = xLabelWidth(t) / 2;
    return Math.min(Math.max(sx(t), half), Math.max(half, width - half));
  };
  // Fit against where the labels are drawn, so pulling an end label in cannot make it collide.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tickList = React.useMemo(() => (typeof xTicks === "function" ? xTicks({ min: xMin, max: xMax }) : xTicks), [xTicks, xMin, xMax]);
  const shownXTicks = React.useMemo(() => (xAxis === "none" ? [] : fitTicks(tickList, xLabelAt, xLabelWidth)), [tickList, width, xMin, xMax, formatX, xAxis]);
  // A reading a log axis cannot place breaks the line instead of drawing a false point.
  const path = (pts: Point[]) => {
    let pen = false;
    return pts
      .map((p) => {
        if (log && !(p.y > 0)) {
          pen = false;
          return "";
        }
        const cmd = `${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
        pen = true;
        return cmd;
      })
      .join("");
  };

  const last = series[series.length - 1];
  const showEnd = (end ?? (current === undefined ? "now" : "none")) === "now";
  const peak = series.reduce((a, b) => (b.y > a.y ? b : a), series[0]);
  const peakShown = !log || peak.y > 0;
  const stops = colourScale ? [...colourScale].sort((a, b) => a.at - b.at) : [];
  /** The colour a value lands on: the highest stop at or below it. Used for the labelled points. */
  const colourAt = (y: number) => (stops.length ? [...stops].reverse().find((s) => s.at <= y)?.colour ?? stops[0].colour : colour);
  const stroke = stops.length ? `url(#${gradientId})` : colour;

  // The plot itself, memoised: moving `current` or a pointer readout redraws only the overlay below.
  /* eslint-disable react-hooks/exhaustive-deps */
  const plot = React.useMemo(
    () => (
      <>
        {stops.length > 0 && (
              // A vertical gradient in chart space, so a colour sits at a temperature, not at a
              // point along the line: the line is the same red wherever it crosses 600 °C.
              <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={sy(y.min)} y2={sy(y.max)}>
                  {stops.map((s) => (
                    <stop key={s.at} offset={Math.min(1, Math.max(0, s.at > 0 || !log ? y.at(s.at) : 0))} stopColor={s.colour} />
                  ))}
                </linearGradient>
              </defs>
            )}
            {spans?.map((sp) => {
              const [a, b] = [Math.max(sx(Math.min(sp.from, sp.to)), pad.left), Math.min(sx(Math.max(sp.from, sp.to)), pad.left + w)];
              return b > a ? <rect key={`${sp.from}-${sp.to}-${sp.label}`} x={a} y={pad.top} width={b - a} height={h} fill={TONE_FILL[sp.tone ?? "neutral"]} /> : null;
            })}
            {band && band.below > y.min && (
              <g>
                <rect x={pad.left} y={Math.min(sy(y.min), sy(Math.min(band.below, y.max)))} width={w} height={Math.abs(sy(y.min) - sy(Math.min(band.below, y.max)))} fill="var(--success-subtle)" />
                <text x={pad.left + 8} y={Math.min(sy(y.min), sy(Math.min(band.below, y.max))) + 16} className="fill-success type-caption">
                  {band.label}
                </text>
              </g>
            )}
            {y.ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={pad.left + w} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={pad.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground type-caption tabular-nums">
                  {formatY(t)}
                </text>
              </g>
            ))}
            {shownXTicks.map((t) => (
              <text key={t} x={xLabelAt(t)} y={height - 8} textAnchor="middle" className="fill-muted-foreground type-caption tabular-nums">
                {formatX(t)}
              </text>
            ))}
            {planned && (
              <path d={path(planned)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" />
            )}
            {limits.length > 1 && (
              // The extremes as one flat translucent area in the line's own colour, behind the line.
              <path d={rangePath(limits, sx, sy)} fill={colour} fillOpacity={0.18} stroke="none" data-chart-range="" />
            )}
            {area && series.length > 1 && (
              // One flat pale tint, never a gradient: the area is the meaning, so it is a plain fill.
              <path d={`${path(series)}L${sx(series[series.length - 1].x).toFixed(1)},${sy(y.min).toFixed(1)}L${sx(series[0].x).toFixed(1)},${sy(y.min).toFixed(1)}Z`} fill={colour} fillOpacity={0.12} stroke="none" />
            )}
            <path d={path(series)} fill="none" stroke={stroke} strokeWidth={stops.length ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
            {/* Direct labels instead of a legend and a tooltip. */}
            {peakShown && (
              <>
                <circle cx={sx(peak.x)} cy={sy(peak.y)} r={3} fill={colourAt(peak.y)} />
                <text x={sx(peak.x) + 8} y={sy(peak.y) - 8} className="fill-foreground type-caption tabular-nums">
                  {formatY(peak.y)} peak
                </text>
              </>
            )}
            {showEnd && (!log || last.y > 0) && (
              <>
                <line x1={sx(last.x)} x2={sx(last.x)} y1={pad.top} y2={pad.top + h} stroke="var(--foreground)" strokeWidth={1} />
                <circle cx={sx(last.x)} cy={sy(last.y)} r={3.5} fill={colourAt(last.y)} />
                <text x={sx(last.x) - 8} y={sy(last.y) - 10} textAnchor="end" className="fill-foreground type-label tabular-nums">
                  {formatY(last.y)} now
                </text>
              </>
            )}
      </>
    ),
    [width, height, series, limits, planned, band, tickList, xMin, xMax, yMode, yInvert, xAxis, spans, yMin, yMax, colour, colourScale, formatX, formatY, area, showEnd],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // The screen-reader table is memoised with the plot: a moving rule must not rebuild every row.
  /* eslint-disable react-hooks/exhaustive-deps */
  const tableEl = React.useMemo(
    () => (
      // sr-only on a wrapper: a table ignores width: 1px and would widen the page.
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">{xLabel}</th>
              <th scope="col">{seriesLabel}</th>
              {range && <th scope="col">{range.label}</th>}
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.x}>
                <td>{formatX(p.x)}</td>
                <td>{formatY(p.y)}</td>
                {range && <td>{rangeText(limits, p.x, formatY)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {spans && spans.length > 0 && (
          <ul aria-label="Shaded stretches">
            {spans.map((sp) => (
              <li key={`${sp.from}-${sp.to}-${sp.label}`}>{`${sp.label}: ${formatX(sp.from)} to ${formatX(sp.to)}`}</li>
            ))}
          </ul>
        )}
        {marks && marks.length > 0 && (
          <ul aria-label="Marks">
            {marks.map((m) => (
              <li key={`${m.x}-${m.label}`}>{`${m.label}: ${formatX(m.x)}${m.selected ? ", selected" : ""}`}</li>
            ))}
          </ul>
        )}
      </div>
    ),
    [label, seriesLabel, series, formatX, formatY, xLabel, spans, marks, range, limits],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // --- tied to the rest of the screen: the current rule, a readout, picking a reading --------
  const sorted = React.useMemo(() => [...series].sort((p, q) => p.x - q.x), [series]);
  const interactive = Boolean(readout || onPick || joined);
  const [hover, setHover] = React.useState<number | null>(null);
  const [kbd, setKbd] = React.useState<number | null>(null);
  const [focused, setFocused] = React.useState(false);
  const readoutText = (pt: Point) => (typeof readout === "function" ? readout(pt) : `${formatX(pt.x)}: ${formatY(pt.y)}${range ? ` (${rangeText(limits, pt.x, formatY, " to ")})` : ""}`);
  const nearest = (px: number) => {
    const target = xMin + ((px - pad.left) / (w || 1)) * (xMax - xMin || 1);
    let best = 0;
    for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i].x - target) < Math.abs(sorted[best].x - target)) best = i;
    return best;
  };
  /** The value of the line at x, read between the two readings either side (flat beyond the ends). */
  const yAt = (x: number) => {
    if (!sorted.length) return 0;
    if (x <= sorted[0].x) return sorted[0].y;
    for (let i = 1; i < sorted.length; i++) {
      if (x <= sorted[i].x) {
        const [p0, p1] = [sorted[i - 1], sorted[i]];
        return p0.y + ((p1.y - p0.y) * (x - p0.x)) / (p1.x - p0.x || 1);
      }
    }
    return sorted[sorted.length - 1].y;
  };
  const currentAt = current === undefined ? null : { x: Math.min(Math.max(current, xMin), xMax), y: yAt(current) };
  // One reading is "the" selection for the announced value, the drawn marker and Enter: the pointer's
  // while it is over the plot, else the keyboard's (clamped, since `series` can be replaced by a shorter
  // one), else where the current rule is, else the last reading.
  const fallbackIdx = sorted.length ? (currentAt ? nearest(sx(currentAt.x)) : sorted.length - 1) : 0;
  const heldIdx = kbd === null ? fallbackIdx : Math.min(kbd, Math.max(sorted.length - 1, 0));
  const selectedIdx = hover === null ? heldIdx : Math.min(hover, Math.max(sorted.length - 1, 0));
  const active = (hover !== null || focused) && sorted.length ? sorted[selectedIdx] : null;
  // The shared cursor: this chart's pointer or key position goes out in the scope's unit; another
  // member's comes in as a rule with this chart's own reading there. A position this chart wrote is never drawn back.
  const setPointer = shared?.setPointer;
  const writeAt = active ? (mapping?.toCursor ?? ((x: number) => x))(active.x) : null;
  React.useEffect(() => {
    if (!joined || !setPointer) return;
    setPointer(writeAt);
  }, [joined, setPointer, writeAt]);
  React.useEffect(() => () => setPointer?.(null), [setPointer]);
  const otherX = joined && shared!.other !== null ? (mapping?.fromCursor ?? ((c: number) => c))(shared!.other) : null;
  const otherAt = otherX !== null && otherX >= xMin && otherX <= xMax ? { x: otherX, y: yAt(otherX) } : null;
  const onKey = (e: React.KeyboardEvent) => {
    const at = selectedIdx;
    let next = at;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(at + 1, sorted.length - 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(at - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = sorted.length - 1;
    else if ((e.key === "Enter" || e.key === " ") && onPick) {
      e.preventDefault();
      onPick(sorted[at].x);
      return;
    } else return;
    e.preventDefault();
    setHover(null); // the key takes over from a pointer left resting on the plot
    setKbd(next);
  };
  const flip = (px: number, text: string) => (px + labelWidth(text) + 16 > width ? { x: px - 8, anchor: "end" as const } : { x: px + 8, anchor: "start" as const });

  return (
    <figure className={cn("grid min-w-0 gap-2", className)}>
      <div ref={ref} className="relative min-w-0">
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
            {plot}
            {currentAt && (
              <g aria-hidden>
                <line x1={sx(currentAt.x)} x2={sx(currentAt.x)} y1={pad.top} y2={pad.top + h} stroke="var(--primary)" strokeWidth={1.5} />
                <circle cx={sx(currentAt.x)} cy={sy(currentAt.y)} r={4} fill="var(--background)" stroke="var(--primary)" strokeWidth={2} />
                {(() => {
                  const text = formatCurrent ? formatCurrent(currentAt) : `${formatX(currentAt.x)}: ${formatY(currentAt.y)}`;
                  const at = flip(sx(currentAt.x), text);
                  return (
                    <text x={at.x} y={pad.top + 12} textAnchor={at.anchor} className="fill-foreground type-caption tabular-nums">
                      {text}
                    </text>
                  );
                })()}
              </g>
            )}
            {otherAt && (!log || otherAt.y > 0) && (
              <g aria-hidden>
                <line x1={sx(otherAt.x)} x2={sx(otherAt.x)} y1={pad.top} y2={pad.top + h} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="2 3" />
                <circle cx={sx(otherAt.x)} cy={sy(otherAt.y)} r={4} fill="var(--background)" stroke="var(--foreground)" strokeWidth={2} />
                {(() => {
                  const text = `${formatX(otherAt.x)}: ${formatY(otherAt.y)}`;
                  const at = flip(sx(otherAt.x), text);
                  return (
                    <text x={at.x} y={sy(otherAt.y) - 10} textAnchor={at.anchor} className="fill-foreground type-caption tabular-nums" paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>
                      {text}
                    </text>
                  );
                })()}
              </g>
            )}
            {active && (
              <g aria-hidden>
                <line x1={sx(active.x)} x2={sx(active.x)} y1={pad.top} y2={pad.top + h} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="2 3" />
                <circle cx={sx(active.x)} cy={sy(active.y)} r={4} fill="var(--foreground)" />
                {(() => {
                  const text = readoutText(active);
                  const at = flip(sx(active.x), text);
                  return (
                    <text x={at.x} y={sy(active.y) - 10} textAnchor={at.anchor} className="fill-foreground type-label tabular-nums" paintOrder="stroke" stroke="var(--background)" strokeWidth={3}>
                      {text}
                    </text>
                  );
                })()}
              </g>
            )}
          </svg>
        )}
        {width > 0 && interactive && sorted.length > 0 && (
          <ReadingSlider
            label={`${label}: read values`}
            sorted={sorted}
            selected={selectedIdx}
            text={readoutText}
            onSelect={(i) => {
              setHover(null);
              setKbd(i);
            }}
            onPick={onPick}
            onKeyDownCapture={onKey}
            onHover={(px) => setHover(px === null ? null : nearest(px))}
            onFocusChange={setFocused}
            domain={[xMin, xMax]}
            box={{ left: pad.left, top: pad.top, width: w, height: h }}
          />
        )}
        {width > 0 && marks && marks.length > 0 && (
          <MarkButtons
            marks={marks.filter((m) => m.x >= xMin && m.x <= xMax && (!log || yAt(m.x) > 0))}
            place={(m) => ({ left: sx(m.x), top: sy(yAt(m.x)) })}
            formatX={formatX}
            onSelect={onMarkSelect}
            card={renderMarkCard}
          />
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 type-caption text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          {stops.length ? (
            <svg width={stops.length * 8} height="3" aria-hidden>
              {stops.map((s, i) => (
                <line key={s.at} x1={i * 8} x2={i * 8 + 8} y1="1.5" y2="1.5" stroke={s.colour} strokeWidth={3} />
              ))}
            </svg>
          ) : (
            <svg width="16" height="2" aria-hidden>
              <line x1="0" x2="16" y1="1" y2="1" stroke={colour} strokeWidth={2} />
            </svg>
          )}
          {seriesLabel}
          {stops.length > 0 && colourScaleLabel && <span>({colourScaleLabel})</span>}
        </span>
        {range && limits.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <svg width="14" height="10" aria-hidden>
              <rect width="14" height="10" rx="2" fill={colour} fillOpacity={0.18} />
            </svg>
            {range.label}
          </span>
        )}
        {spans?.map((sp) => (
          <span key={`${sp.from}-${sp.to}-${sp.label}`} className="inline-flex items-center gap-2">
            <svg width="14" height="10" aria-hidden>
              <rect width="14" height="10" rx="2" fill={TONE_FILL[sp.tone ?? "neutral"]} stroke="var(--border)" />
            </svg>
            {sp.label}
          </span>
        ))}
        {undrawn > 0 && <span>{undrawn === 1 ? "1 reading at or below zero is not drawn" : `${undrawn} readings at or below zero are not drawn`}</span>}
        {planned && plannedLabel && (
          <span className="inline-flex items-center gap-2">
            <svg width="16" height="2" aria-hidden>
              <line x1="0" x2="16" y1="1" y2="1" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" />
            </svg>
            {plannedLabel}
          </span>
        )}
      </figcaption>
      {tableEl}
    </figure>
  );
}


type MarkButtonsProps = {
  marks: readonly ChartMark[];
  place: (m: ChartMark) => { left: number; top: number };
  formatX: (x: number) => string;
  onSelect?: (m: ChartMark) => void;
  card?: (m: ChartMark) => React.ReactNode;
};

/** The marks as controls: one tab stop for the group, arrows, Home and End between them, each named by its label and x. */
function MarkButtons({ marks, place, formatX, onSelect, card }: MarkButtonsProps) {
  const [active, setActive] = React.useState(0);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.min(active, marks.length - 1);
  const move = (i: number) => {
    const next = Math.max(0, Math.min(marks.length - 1, i));
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="group"
      aria-label="Marks"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") move(at + 1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(at - 1);
        else if (e.key === "Home") move(0);
        else if (e.key === "End") move(marks.length - 1);
        else return;
        e.preventDefault();
      }}
    >
      {marks.map((m, i) => {
        const pos = place(m);
        const name = `${m.label}, ${formatX(m.x)}`;
        return (
          <Tooltip key={`${m.x}-${m.label}`} label={card ? card(m) : name} side="top">
            <AriaButton
              ref={(el) => {
                refs.current[i] = el;
              }}
              aria-label={name}
              aria-pressed={m.selected ?? false}
              excludeFromTabOrder={i !== at}
              onFocus={() => setActive(i)}
              onPress={() => onSelect?.(m)}
              className={cn(
                "absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-pill border-2 border-background outline-offset-2 transition-state focus-visible:outline-2 focus-visible:outline-ring",
                m.selected ? "size-4 ring-2 ring-foreground" : "size-3",
              )}
              style={{ left: pos.left, top: pos.top, background: m.colour ?? "var(--foreground)" }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

type ReadingSliderProps = {
  label: string;
  sorted: readonly Point[];
  selected: number;
  text: (p: Point) => string;
  onSelect: (index: number) => void;
  onPick?: (x: number) => void;
  onKeyDownCapture: (e: React.KeyboardEvent) => void;
  /** The pointer's x in the plot's own pixels, or null when it leaves. */
  onHover: (px: number | null) => void;
  onFocusChange: (focused: boolean) => void;
  /** The x range the plot shows: the slider's track maps onto it, as the hover does. */
  domain: readonly [number, number];
  box: { left: number; top: number; width: number; height: number };
};

/** The slider over the plot: React Aria's hooks, snapped to the readings, with the reading as its spoken value. */
function ReadingSlider({ label, sorted, selected, text, onSelect, onPick, onKeyDownCapture, onHover, onFocusChange, domain, box }: ReadingSliderProps) {
  const track = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const lo = domain[0];
  const hi = Math.max(domain[1], lo + 1e-9);
  const indexAt = (x: number) => {
    let best = 0;
    for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i].x - x) < Math.abs(sorted[best].x - x)) best = i;
    return best;
  };
  const spoken = React.useMemo(() => {
    const say = (x: number) => text(sorted[indexAt(x)]);
    return { format: say, formatRange: (a: number, b: number) => `${say(a)} to ${say(b)}`, resolvedOptions: () => ({ locale: "en-US" }) } as unknown as Intl.NumberFormat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, text]);
  const state = useSliderState({
    minValue: lo,
    maxValue: hi,
    step: (hi - lo) / 10000,
    value: [sorted[selected].x],
    onChange: ([x]) => onSelect(indexAt(x)),
    onChangeEnd: ([x]) => onPick?.(sorted[indexAt(x)].x),
    numberFormatter: spoken,
  });
  const { groupProps, trackProps } = useSlider({ "aria-label": label }, state, track);
  const { thumbProps, inputProps } = useSliderThumb({ index: 0, trackRef: track, inputRef: input, "aria-label": label }, state);
  const { focusProps, isFocusVisible } = useFocusRing();
  return (
    <div {...groupProps} className="absolute" style={box}>
      <div
        {...trackProps}
        ref={track}
        onPointerMove={(e) => onHover(e.clientX - e.currentTarget.getBoundingClientRect().left + box.left)}
        onPointerLeave={() => onHover(null)}
        className={cn("relative size-full cursor-crosshair touch-none", isFocusVisible && "outline-2 outline-offset-2 outline-ring")}
      >
        <div {...thumbProps} className="absolute inset-y-0 w-0" style={{ left: `${state.getThumbPercent(0) * 100}%` }}>
          <VisuallyHidden>
            <input
              ref={input}
              {...mergeProps(inputProps, focusProps, { onFocus: () => onFocusChange(true), onBlur: () => onFocusChange(false) })}
              aria-labelledby={undefined}
              onKeyDownCapture={(e) => {
                onKeyDownCapture(e);
                if (e.defaultPrevented) e.stopPropagation();
              }}
            />
          </VisuallyHidden>
        </div>
      </div>
    </div>
  );
}


/** One chart of a `LineChartGroup`: the props that differ per chart. The group owns the x axis, the cursor, `current` and `onPick`. */
export type GroupedChart = Omit<LineChartProps, "formatX" | "xLabel" | "xTicks" | "xDomain" | "xAxis" | "current" | "onPick" | "cursor" | "readout" | "label"> & {
  /** Names this chart in the group's reading and its own accessible name. Default `seriesLabel`. */
  label?: string;
};

export type LineChartGroupProps = {
  /** What the stack shows, as a sentence. */
  label: string;
  charts: readonly GroupedChart[];
  formatX: (x: number) => string;
  xLabel?: string;
  xTicks: LineChartProps["xTicks"];
  /** Drawn on every chart (a chart's own `spans` and `marks` replace them). */
  spans?: readonly ChartSpan[];
  marks?: readonly ChartMark[];
  onMarkSelect?: (mark: ChartMark) => void;
  renderMarkCard?: (mark: ChartMark) => React.ReactNode;
  /** The current x, drawn on every chart. */
  current?: number;
  onPick?: (x: number) => void;
  className?: string;
};

/**
 * Charts stacked on one x axis: one shared range, labels on the last chart only, and one cursor, so
 * hovering or arrowing in any chart puts a rule and that chart's own reading in all of them (read
 * together, and announced as one sentence, politely, at most once a second). Inside a `CursorScope`
 * already, it joins that scope (a map beside the charts moves with them); otherwise it makes its own.
 */
export function LineChartGroup({ label, charts, formatX, xLabel, xTicks, spans, marks, onMarkSelect, renderMarkCard, current, onPick, className }: LineChartGroupProps) {
  const inScope = useSharedCursor() !== null;
  const xs = charts.flatMap((c) => [...c.series, ...(c.planned ?? [])].map((p) => p.x));
  const domain: [number, number] = [Math.min(...xs), Math.max(...xs)];
  const say = (x: number) => `${formatX(x)}: ${charts.map((c) => `${c.label ?? c.seriesLabel} ${c.formatY(valueAt(c.series, x))}`).join(", ")}`;
  const stack = (
    <div role="group" aria-label={label} className={cn("grid min-w-0 gap-1", className)}>
      {charts.map((c, i) => (
        <LineChart
          key={c.label ?? c.seriesLabel}
          spans={spans}
          marks={marks}
          onMarkSelect={onMarkSelect}
          renderMarkCard={renderMarkCard}
          {...c}
          label={c.label ?? c.seriesLabel}
          formatX={formatX}
          xLabel={xLabel}
          xTicks={xTicks}
          xDomain={domain}
          xAxis={i === charts.length - 1 ? "labels" : "none"}
          current={current}
          onPick={onPick}
          cursor
          readout
        />
      ))}
    </div>
  );
  return inScope ? stack : <CursorScope format={say}>{stack}</CursorScope>;
}
