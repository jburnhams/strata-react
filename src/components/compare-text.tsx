import * as React from "react";
import { cn } from "../lib/utils";
import { diffWords, type TextSegment } from "../lib/text-diff";
import type { Candidate, TextMedia } from "./compare";
import { ToggleGroup } from "./toggle";
import { Switch } from "./switch";

// Two texts side by side to be read and judged: the transcripts of one recording from two models,
// or two answers to one question. A person reading both wants the same line next to the same line,
// so the two panes scroll together, and wants the words that differ shown without having to find
// them, so there is a word diff behind a switch (off by default: a diff is an answer, and a judge
// who is reading for quality should read first).
//
// The diff is our own and simple (`lib/text-diff.ts`: words, longest common subsequence). A changed
// word is marked with a background AND an underline, so it survives a colour-blind reading and a
// print, and is a `<mark>`, which a screen reader announces as highlighted. A pair too long to
// compare is refused in words and both texts are still shown.
//
// `reference` is a third text, a ground truth (the transcript a person wrote). It is shown above
// the two, labelled, and the diff can be taken against it instead of against the other candidate:
// "which is closer to what was said" is the question a transcription judge asks, so with a reference
// the diff starts against it.
//
// Blind: only the label names a text; the id and note are never written, and `reference` is a
// separate, labelled thing the caller chooses to show. Text is data, never markup: it is rendered as
// text with whitespace kept (`whitespace-pre-wrap`), so a model's output cannot inject HTML.
//
// Checked: React Aria has no text-diff or synchronised-scroll part. Scrolling is a plain scroll
// listener on two native scroll boxes; each is a focusable region (`tabIndex=0`, labelled) so a
// keyboard user can scroll it, which a scrollable `div` otherwise denies them.

/** Props for `CompareText`. */
export type CompareTextProps = {
  /** Names the comparison for screen readers. Required. */
  label: string;
  a: Candidate<TextMedia>;
  b: Candidate<TextMedia>;
  /** Whether the person must not learn which text is which. Required, no default. */
  blind: boolean;
  /** A ground-truth text, shown above both; the diff starts against it, and can be switched to the other candidate. */
  reference?: { label: string; text: string };
  /** Start with the word differences marked. Default false. */
  defaultDiff?: boolean;
  /** Said when the pair is too long to compare word by word. Default says so plainly. */
  tooLong?: string;
  /** Scroll the two panes together. Default true. */
  linkedScroll?: boolean;
  className?: string;
};

function Words({ segments, changed }: { segments: TextSegment[]; changed: boolean }) {
  return (
    <>
      {segments.map((s, i) =>
        changed && s.changed ? (
          <mark key={i} className="rounded-control bg-warning-subtle text-foreground underline decoration-2 underline-offset-2">
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

/** Two texts side by side with scrolling together, an optional reference, and a word diff on request. */
export function CompareText({ label, a, b, blind, reference, defaultDiff = false, tooLong = "These texts are too long to compare word by word.", linkedScroll = true, className }: CompareTextProps) {
  const [diff, setDiff] = React.useState(defaultDiff);
  const [against, setAgainst] = React.useState<"other" | "reference">(reference ? "reference" : "other");
  const boxA = React.useRef<HTMLDivElement>(null);
  const boxB = React.useRef<HTMLDivElement>(null);
  const syncing = React.useRef(false);

  const result = React.useMemo(() => {
    if (!diff) return null;
    if (against === "reference" && reference) {
      const ra = diffWords(a.media.text, reference.text);
      const rb = diffWords(b.media.text, reference.text);
      return ra && rb ? { a: ra.a, b: rb.a, changedA: ra.changedA, changedB: rb.changedA } : "long";
    }
    return diffWords(a.media.text, b.media.text) ?? "long";
  }, [diff, against, reference, a.media.text, b.media.text]);

  // Keep the two panes at the same share of their scroll range: texts differ in length, so the
  // same pixel is not the same line, but the same share is close.
  const follow = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!linkedScroll || !from || !to || syncing.current) return;
    const range = from.scrollHeight - from.clientHeight;
    syncing.current = true;
    to.scrollTop = range > 0 ? (from.scrollTop / range) * (to.scrollHeight - to.clientHeight) : 0;
    requestAnimationFrame(() => (syncing.current = false));
  };

  const pane = (c: Candidate<TextMedia>, ref: React.RefObject<HTMLDivElement | null>, other: React.RefObject<HTMLDivElement | null>, segments: TextSegment[] | null) => (
    <figure className="grid min-w-0 gap-1.5">
      <figcaption className="flex items-baseline gap-2">
        <span className="type-label">{c.label}</span>
        {!blind && c.note && <span className="type-caption text-muted-foreground">{c.note}</span>}
      </figcaption>
      <div
        ref={ref}
        tabIndex={0}
        role="region"
        aria-label={`Text ${c.label}`}
        onScroll={() => follow(ref.current, other.current)}
        className="max-h-96 overflow-auto whitespace-pre-wrap rounded-surface border border-border bg-muted p-3 type-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {segments ? <Words segments={segments} changed /> : c.media.text}
      </div>
    </figure>
  );

  const counts = result && result !== "long" ? result : null;
  return (
    <section aria-label={label} className={cn("grid gap-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Switch label="Mark the words that differ" on={diff} onChange={setDiff} />
        {diff && reference && (
          <ToggleGroup
            label="Differences against"
            options={[
              { value: "other", label: "The other text" },
              { value: "reference", label: reference.label },
            ]}
            value={against}
            onChange={(v) => setAgainst(v as "other" | "reference")}
            size="sm"
          />
        )}
      </div>
      {reference && (
        <figure className="grid gap-1.5">
          <figcaption className="type-label">{reference.label}</figcaption>
          <p className="whitespace-pre-wrap rounded-surface border border-border p-3 type-body">{reference.text}</p>
        </figure>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {pane(a, boxA, boxB, counts ? counts.a : null)}
        {pane(b, boxB, boxA, counts ? counts.b : null)}
      </div>
      {diff && (
        <p role="status" className="type-body-sm text-muted-foreground">
          {result === "long"
            ? tooLong
            : counts && counts.changedA === 0 && counts.changedB === 0
              ? against === "reference" && reference
                ? `Both match ${reference.label} word for word.`
                : "The texts are the same word for word."
              : counts
                ? `${a.label}: ${counts.changedA} ${counts.changedA === 1 ? "word differs" : "words differ"}. ${b.label}: ${counts.changedB} ${counts.changedB === 1 ? "word differs" : "words differ"}.`
                : null}
        </p>
      )}
    </section>
  );
}
