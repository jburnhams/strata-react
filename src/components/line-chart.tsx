import * as React from "react";
import { cn } from "../lib/utils";

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
// Reading a value (`readout`, `onPick`) is a slider laid over the plot, and it is our own, by the
// "React Aria first" rule's last step. Part considered: React Aria's `Slider`. What it cannot do,
// checked in `useSliderThumb` and `useSliderState`: it steps a continuous number by a fixed step,
// and speaks its value only through `Intl.NumberFormat` options, so it cannot say "300 m: 60 m up"
// and cannot step between the readings of an uneven series. A formatter can be given to
// `useSliderState`, but `react-stately` is not a direct dependency, which is Jonathan's decision to
// make (issue #103 asks him). Until then the keys (arrows, Home, End), `role="slider"` and its
// `aria-valuetext` follow the same contract as React Aria's.

export type Point = { x: number; y: number };

export type LineChartProps = {
  /** What the chart shows, as a sentence. Used as the accessible name and the table caption. */
  label: string;
  series: Point[];
  seriesLabel: string;
  planned?: Point[];
  plannedLabel?: string;
  band?: { below: number; label: string };
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  /** Where to put x labels, in x units. The chart drops every other one (and so on) when they would overlap at its width. */
  xTicks: number[];
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
  formatY,
  xTicks,
  yMin,
  yMax,
  colour = "var(--chart-1)",
  colourScale,
  colourScaleLabel,
  current,
  formatCurrent,
  readout,
  onPick,
  area,
  height = 280,
  className,
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gradientId = `heat-${React.useId().replace(/[^\w-]/g, "")}`;
  const all = [...series, ...(planned ?? [])];
  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const y = yScale(
    all.map((p) => p.y),
    { min: yMin, max: yMax },
  );

  const pad = { top: 16, right: 16, bottom: 28, left: 56 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const sx = (x: number) => pad.left + ((x - xMin) / (xMax - xMin || 1)) * w;
  const sy = (v: number) => pad.top + h - ((v - y.min) / (y.max - y.min)) * h;
  const xLabelWidth = (t: number) => labelWidth(formatX(t));
  // Keep the first and last labels inside the chart instead of centring them past its edge.
  const xLabelAt = (t: number) => {
    const half = xLabelWidth(t) / 2;
    return Math.min(Math.max(sx(t), half), Math.max(half, width - half));
  };
  // Fit against where the labels are drawn, so pulling an end label in cannot make it collide.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownXTicks = React.useMemo(() => fitTicks(xTicks, xLabelAt, xLabelWidth), [xTicks, width, xMin, xMax, formatX]);
  const path = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");

  const last = series[series.length - 1];
  const peak = series.reduce((a, b) => (b.y > a.y ? b : a), series[0]);
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
                    <stop key={s.at} offset={Math.min(1, Math.max(0, (s.at - y.min) / (y.max - y.min)))} stopColor={s.colour} />
                  ))}
                </linearGradient>
              </defs>
            )}
            {band && band.below > y.min && (
              <g>
                <rect x={pad.left} y={sy(Math.min(band.below, y.max))} width={w} height={sy(y.min) - sy(Math.min(band.below, y.max))} fill="var(--success-subtle)" />
                <text x={pad.left + 8} y={sy(Math.min(band.below, y.max)) + 16} className="fill-success type-caption">
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
            {area && series.length > 1 && (
              // One flat pale tint, never a gradient: the area is the meaning, so it is a plain fill.
              <path d={`${path(series)}L${sx(series[series.length - 1].x).toFixed(1)},${sy(y.min).toFixed(1)}L${sx(series[0].x).toFixed(1)},${sy(y.min).toFixed(1)}Z`} fill={colour} fillOpacity={0.12} stroke="none" />
            )}
            <path d={path(series)} fill="none" stroke={stroke} strokeWidth={stops.length ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
            {/* Direct labels instead of a legend and a tooltip. */}
            <circle cx={sx(peak.x)} cy={sy(peak.y)} r={3} fill={colourAt(peak.y)} />
            <text x={sx(peak.x) + 8} y={sy(peak.y) - 8} className="fill-foreground type-caption tabular-nums">
              {formatY(peak.y)} peak
            </text>
            <line x1={sx(last.x)} x2={sx(last.x)} y1={pad.top} y2={pad.top + h} stroke="var(--foreground)" strokeWidth={1} />
            <circle cx={sx(last.x)} cy={sy(last.y)} r={3.5} fill={colourAt(last.y)} />
            <text
              x={sx(last.x) - 8}
              y={sy(last.y) - 10}
              textAnchor="end"
              className="fill-foreground type-label tabular-nums"
            >
              {formatY(last.y)} now
            </text>
      </>
    ),
    [width, height, series, planned, band, xTicks, yMin, yMax, colour, colourScale, formatX, formatY, area],
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
              <th scope="col">Time</th>
              <th scope="col">{seriesLabel}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.x}>
                <td>{formatX(p.x)}</td>
                <td>{formatY(p.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
    ),
    [label, seriesLabel, series, formatX, formatY],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // --- tied to the rest of the screen: the current rule, a readout, picking a reading --------
  const sorted = React.useMemo(() => [...series].sort((p, q) => p.x - q.x), [series]);
  const interactive = Boolean(readout || onPick);
  const [hover, setHover] = React.useState<number | null>(null);
  const [kbd, setKbd] = React.useState<number | null>(null);
  const [focused, setFocused] = React.useState(false);
  const readoutText = (pt: Point) => (typeof readout === "function" ? readout(pt) : `${formatX(pt.x)}: ${formatY(pt.y)}`);
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
  const selected = sorted[selectedIdx];
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
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${label}: read values`}
            aria-orientation="horizontal"
            aria-valuemin={sorted[0].x}
            aria-valuemax={sorted[sorted.length - 1].x}
            aria-valuenow={selected.x}
            aria-valuetext={readoutText(selected)}
            onKeyDown={onKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPointerMove={(e) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left + pad.left))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => onPick?.(sorted[nearest(e.clientX - e.currentTarget.getBoundingClientRect().left + pad.left)].x)}
            className="absolute cursor-crosshair outline-offset-2"
            style={{ left: pad.left, top: pad.top, width: w, height: h }}
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
