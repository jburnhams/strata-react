import * as React from "react";
import { format } from "../lib/format";
import { cn } from "../lib/utils";

// What a whole is made of (memory: used, cached, buffers, free; a kiln load: bisque, glaze, empty
// shelves), as one stacked bar over a table. strata-react issue #25 asked for it after
// jburnhams/homepage hand-rolled one. The rules, from ux-research ui-library/components.md §3.8
// and patterns.md §5:
// - Colour is never the only cue. The bar shows proportion at a glance; the table under it says
//   every part's name, amount and share in words, with a swatch that ties the row to its
//   segment. The bar is hidden from screen readers because the table already carries all of it.
// - The parts stay in the order given, in the bar and the table, so the order is the caller's
//   meaning (used before cached before free), not sorted by size.
// - Categorical colours come from `--chart-1…5` in order, which palette.mjs checks are told apart
//   by colour-blind readers. A sixth part has no token to take, so it must bring its own colour;
//   more than five parts usually means the small ones belong in an "Other" part.
// - Segments are split by a 2px gap in the ground colour, so two neighbours of similar lightness
//   still read as two.
// - When the parts do not fill the whole (`total` is larger than their sum), the remainder is the
//   empty track, and it must be named (`restLabel`, such as "Free"), so the table can say what the
//   gap is. Neither the remainder nor a part is ever left unlabelled.
// - Values are formatted by the caller (`formatValue`), as LineChart's `formatY` is, so units stay
//   the product's; shares go through `format.percent` unless `formatShare` says otherwise.

/** One part of a `CompositionBar`'s whole. */
export type CompositionPart = {
  /** Stable key for the part. */
  key: string;
  label: string;
  value: number;
  /** CSS colour for the segment and swatch. Defaults to the chart token for its position. */
  colour?: string;
};

export type CompositionBarProps = {
  /** What the whole is, such as "Memory". Shown above the bar and names the table. */
  label: string;
  parts: CompositionPart[];
  formatValue: (value: number) => string;
  /** Formats a part's share of the whole (0 to 1). Defaults to `format.percent`. */
  formatShare?: (share: number) => string;
  /** Header of the parts column, for screen readers and over the table. Defaults to "Part". */
  partHeader?: string;
  /** Header of the amounts column. Defaults to "Amount". */
  valueHeader?: string;
  /** Header of the shares column. Defaults to "Share". */
  shareHeader?: string;
  className?: string;
} & (
  | {
      /** The size of the whole, when the parts do not fill it. The remainder is the empty track. */
      total: number;
      /** What the remainder is called ("Free", "Empty shelves"). Required with `total`. */
      restLabel: string;
    }
  | { total?: undefined; restLabel?: undefined }
);

const MAX_TOKENS = 5;

/** A part's colour: its own, or the chart token for its position. Throws past the fifth token. */
function colourFor(part: CompositionPart, index: number) {
  if (part.colour) return part.colour;
  if (index >= MAX_TOKENS) {
    throw new Error(
      `CompositionBar: part "${part.label}" is number ${index + 1}, and there are only ${MAX_TOKENS} chart colours. ` +
        `Combine the smallest parts into one "Other" part, or give this part a colour.`,
    );
  }
  return `var(--chart-${index + 1})`;
}

/** What a whole is made of: a stacked bar for proportion and a table that names every part, its amount and its share, so colour is never the only cue. */
export function CompositionBar({
  label,
  parts,
  formatValue,
  formatShare = format.percent,
  partHeader = "Part",
  valueHeader = "Amount",
  shareHeader = "Share",
  className,
  ...whole
}: CompositionBarProps) {
  const captionId = React.useId();
  const sum = parts.reduce((n, p) => n + Math.max(0, p.value), 0);
  const total = Math.max(whole.total ?? sum, sum);
  const rest = whole.total !== undefined ? total - sum : 0;
  const shareOf = (value: number) => (total > 0 ? Math.max(0, value) / total : 0);
  const rows = parts.map((p, i) => ({ ...p, colour: colourFor(p, i), share: shareOf(p.value) }));

  return (
    <figure className={cn("grid min-w-0 gap-3", className)}>
      <figcaption id={captionId} className="type-label text-foreground">
        {label}
      </figcaption>
      <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-pill bg-muted">
        {rows
          .filter((r) => r.value > 0)
          .map((r) => (
            // Grow by value from a zero basis, so the gaps come out of every segment fairly and the
            // parts still fill the track exactly.
            <div key={r.key} className="h-full min-w-0" style={{ flex: `${r.value} 1 0`, background: r.colour }} />
          ))}
        {rest > 0 && <div className="h-full min-w-0" style={{ flex: `${rest} 1 0` }} />}
      </div>
      <table aria-labelledby={captionId} className="w-full border-collapse type-body-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">{partHeader}</th>
            <th scope="col">{valueHeader}</th>
            <th scope="col">{shareHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border first:border-t-0">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="size-3 shrink-0 rounded-control" style={{ background: r.colour }} />
                  {r.label}
                </span>
              </th>
              <td className="py-1.5 pr-4 text-right tabular-nums">{formatValue(r.value)}</td>
              <td className="w-px py-1.5 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                {formatShare(r.share)}
              </td>
            </tr>
          ))}
          {whole.total !== undefined && (
            <tr className="border-t border-border">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                <span className="inline-flex items-center gap-2">
                  {/* The empty track's colour with a hairline, so the swatch reads as "nothing here". */}
                  <span aria-hidden className="size-3 shrink-0 rounded-control border border-border bg-muted" />
                  {whole.restLabel}
                </span>
              </th>
              <td className="py-1.5 pr-4 text-right tabular-nums">{formatValue(rest)}</td>
              <td className="w-px py-1.5 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                {formatShare(shareOf(rest))}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </figure>
  );
}
