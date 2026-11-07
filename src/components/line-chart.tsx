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
// the 12px labels stay 12px on a phone.

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
  xTicks: number[];
  /** CSS colour for the measured series. Defaults to the first chart token. */
  colour?: string;
  /** Colour the measured series by value: each stop applies from `at` upwards, blending to the
   *  next. Only where the colour means something in the subject; record the reason in DESIGN.md. */
  colourScale?: { at: number; colour: string }[];
  /** Says what the colours mean, shown beside the legend swatch when `colourScale` is set. */
  colourScaleLabel?: string;
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

/** Four gridline steps of a size people write on a scale (1, 2, 2.5, 4 or 5 × 10ⁿ), ending above the max. */
export function niceMax(max: number) {
  // All-zero (or empty) data still needs a positive extent, or every coordinate divides by zero.
  if (!(max > 0)) return 4;
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 4, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return step * 4;
}

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
  colour = "var(--chart-1)",
  colourScale,
  colourScaleLabel,
  height = 280,
  className,
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const gradientId = `heat-${React.useId().replace(/[^\w-]/g, "")}`;
  const all = [...series, ...(planned ?? [])];
  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const yMax = niceMax(Math.max(...all.map((p) => p.y)));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);

  const pad = { top: 16, right: 16, bottom: 28, left: 56 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const sx = (x: number) => pad.left + ((x - xMin) / (xMax - xMin || 1)) * w;
  const sy = (y: number) => pad.top + h - (y / yMax) * h;
  const path = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");

  const last = series[series.length - 1];
  const peak = series.reduce((a, b) => (b.y > a.y ? b : a), series[0]);
  const stops = colourScale ? [...colourScale].sort((a, b) => a.at - b.at) : [];
  /** The colour a value lands on: the highest stop at or below it. Used for the labelled points. */
  const colourAt = (y: number) => (stops.length ? [...stops].reverse().find((s) => s.at <= y)?.colour ?? stops[0].colour : colour);
  const stroke = stops.length ? `url(#${gradientId})` : colour;

  return (
    <figure className={cn("grid min-w-0 gap-2", className)}>
      <div ref={ref} className="min-w-0">
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
            {stops.length > 0 && (
              // A vertical gradient in chart space, so a colour sits at a temperature, not at a
              // point along the line: the line is the same red wherever it crosses 600 °C.
              <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={sy(0)} y2={sy(yMax)}>
                  {stops.map((s) => (
                    <stop key={s.at} offset={Math.min(1, Math.max(0, s.at / yMax))} stopColor={s.colour} />
                  ))}
                </linearGradient>
              </defs>
            )}
            {band && (
              <g>
                <rect x={pad.left} y={sy(band.below)} width={w} height={sy(0) - sy(band.below)} fill="var(--success-subtle)" />
                <text x={pad.left + 8} y={sy(band.below) + 16} className="fill-success type-caption">
                  {band.label}
                </text>
              </g>
            )}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={pad.left + w} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={pad.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground type-caption tabular-nums">
                  {formatY(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={sx(t)} y={height - 8} textAnchor="middle" className="fill-muted-foreground type-caption tabular-nums">
                {formatX(t)}
              </text>
            ))}
            {planned && (
              <path d={path(planned)} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" />
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
          </svg>
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
      {/* sr-only on a wrapper: a table ignores width: 1px and would widen the page. */}
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
    </figure>
  );
}
