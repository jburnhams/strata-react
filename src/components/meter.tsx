import * as React from "react";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { Status } from "./status";

// A usage bar: how full one thing is (a disk, a quota, a kiln's shelves), for status dashboards
// that otherwise hand-roll a div with a width (strata-react issue #25, from jburnhams/homepage).
// The rules it encodes, from ux-research ui-library/components.md §3.8 and patterns.md §5:
// - It is a `meter`, not a `progressbar`: a progress bar is a task moving to done, a meter is a
//   level that can go up or down. Its accessible name is what is measured ("Disk /") and its
//   value text says the reading in words ("72% used"), so a screen reader hears "Disk /, meter,
//   72% used" rather than a bare 72.
// - The figure is always printed beside the bar. A bar alone is read to ±10% at best.
// - Thresholds are what the person compares against, so they are drawn on the track as notches,
//   like LineChart's `band`. Each threshold must name its state ("Filling up", "Nearly full"):
//   when the reading crosses one, the fill takes the status ink and the word is shown as a
//   `Status`, so colour is never the only cue. Thresholds are shares of `max` (0.8 is 80%),
//   because a dashboard of disks of different sizes shares one set of them.
// - `worseWhen="lower"` turns the thresholds round for levels where empty is the problem (a
//   battery, credit left): a threshold then applies at or below its share.
// - Below every threshold the fill is one chart hue (`--chart-1` unless `colour` says otherwise),
//   the same default as LineChart, never the brand accent and never a status colour, since
//   "fine" needs no colour of its own.
// - `hideLabel` is for a meter in a table row, where the row already says what it measures; the
//   label stays as the meter's accessible name.
// - No animation on the fill: a dashboard re-renders readings, and a bar that slides on each one
//   draws the eye to nothing.

/** A level on a `Meter` at which the reading changes state, with the word for that state. */
export type MeterThreshold = {
  /** A share of `max`, from 0 to 1: 0.8 is 80%. */
  at: number;
  tone: "warning" | "danger";
  /** What the state is called, in the product's words: "Filling up", "Nearly full". */
  label: string;
};

export type MeterProps = {
  /** What is measured, such as "Disk /". The meter's accessible name. */
  label: string;
  value: number;
  /** The full scale, in the same units as `value`. Defaults to 1, so a share can be passed as is. */
  max?: number;
  /** The reading in words, shown beside the bar and used as `aria-valuetext`. Defaults to "72% used". */
  valueText?: string;
  /** A second line of fact, such as "36 of 50 GB". */
  detail?: React.ReactNode;
  thresholds?: MeterThreshold[];
  /** "lower" when an emptier reading is the worse one (a battery, credit left). */
  worseWhen?: "higher" | "lower";
  /** Keeps the label as the accessible name only, for a meter in a table row that names it. */
  hideLabel?: boolean;
  /** CSS colour for the fill below every threshold. Defaults to the first chart token. */
  colour?: string;
  className?: string;
};

/** The threshold a share has crossed, if any: the most severe one reached in the worse direction. */
export function crossedThreshold(
  share: number,
  thresholds: readonly MeterThreshold[] = [],
  worseWhen: "higher" | "lower" = "higher",
): MeterThreshold | undefined {
  const reached = thresholds.filter((t) => (worseWhen === "higher" ? share >= t.at : share <= t.at));
  // The one furthest in the worse direction wins, so danger beats warning when both are reached.
  return reached.sort((a, b) => (worseWhen === "higher" ? b.at - a.at : a.at - b.at))[0];
}

const fills = { warning: "var(--warning)", danger: "var(--danger)" } as const;

/** How full one thing is: a labelled `meter` with its reading in words, threshold notches, and a status word once a threshold is crossed. */
export function Meter({
  label,
  value,
  max = 1,
  valueText,
  detail,
  thresholds,
  worseWhen = "higher",
  hideLabel = false,
  colour = "var(--chart-1)",
  className,
}: MeterProps) {
  const labelId = React.useId();
  const statusId = React.useId();
  const detailId = React.useId();
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const crossed = crossedThreshold(share, thresholds, worseWhen);
  const text = valueText ?? `${format.percent(share)} used`;
  const hasNote = Boolean(crossed || detail);
  // Two ids rather than one wrapper, so the description reads "Nearly full, 431 GB of 466 GB"
  // with a break between the parts instead of running them together.
  const describedBy = [crossed && statusId, detail && detailId].filter(Boolean).join(" ") || undefined;

  const bar = (
    <div
      role="meter"
      aria-labelledby={hideLabel ? undefined : labelId}
      aria-label={hideLabel ? label : undefined}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      aria-valuetext={text}
      aria-describedby={describedBy}
      className="relative h-2 min-w-16 flex-1 overflow-hidden rounded-pill bg-muted"
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${share * 100}%`, background: crossed ? fills[crossed.tone] : colour }}
      />
      {/* Notches in the ground colour: the levels the reading is judged against. */}
      {thresholds?.map((t) => (
        <div
          key={t.at}
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background"
          style={{ left: `${Math.min(1, Math.max(0, t.at)) * 100}%` }}
        />
      ))}
    </div>
  );

  // The visible figure is the meter's value text, so it is hidden from the accessibility tree
  // rather than read twice.
  const figure = (
    <span aria-hidden className="shrink-0 type-body-sm tabular-nums text-foreground">
      {text}
    </span>
  );

  const note = hasNote && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {crossed && (
        <span id={statusId} className="contents">
          <Status tone={crossed.tone}>{crossed.label}</Status>
        </span>
      )}
      {detail && (
        <span id={detailId} className="type-body-sm text-muted-foreground tabular-nums">
          {detail}
        </span>
      )}
    </div>
  );

  if (hideLabel) {
    return (
      <div className={cn("grid min-w-0 gap-1.5", className)}>
        <div className="flex items-center gap-3">
          {bar}
          {figure}
        </div>
        {note}
      </div>
    );
  }

  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate type-label text-foreground">
          {label}
        </span>
        {figure}
      </div>
      <div className="flex">{bar}</div>
      {note}
    </div>
  );
}
