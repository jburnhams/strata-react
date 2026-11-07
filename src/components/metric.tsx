import * as React from "react";
import { cn } from "../lib/utils";

// Headline figures as one container split by hairlines, label over value: what real product screens
// do, instead of four cards each with an icon in a tinted circle. There is deliberately no `icon`,
// `sparkline` or `trend` prop. A change is written in words with its window ("4 more than last
// Thursday"), because a green "+12.5%" pill says neither what changed nor since when, and the trend
// gets its own chart.

/** Headline figures as one description list split by hairlines. Holds `Metric`s. */
export function MetricStrip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid grid-cols-1 border-y border-border sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-border",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export type MetricProps = {
  label: string;
  /** Already formatted. Ink colour, 28px, tabular figures: never the brand colour, never 48px. */
  value: string;
  unit?: string;
  /** One sentence: the change in words with its window, or what the figure means right now. */
  note?: React.ReactNode;
};

/** One figure: label over value, an optional muted unit and a note that states any change in words with its window. */
export function Metric({ label, value, unit, note }: MetricProps) {
  return (
    <div className="grid content-start gap-0.5 border-border py-3 not-first:border-t sm:px-5 sm:not-first:border-t-0 sm:first:pl-0">
      <dt className="type-label text-muted-foreground">{label}</dt>
      <dd className="type-figure text-foreground">
        {value}
        {unit && <span className="type-body text-muted-foreground">{" " + unit}</span>}
      </dd>
      {note && <dd className="type-body-sm text-muted-foreground">{note}</dd>}
    </div>
  );
}
