import * as React from "react";
import { Flag } from "lucide-react";
import { Button } from "./button";
import { Menu } from "./commands";
import { Compare, type Candidate, type CompareProps } from "./compare";
import { DataView, type Load } from "./data-view";
import type { Shortcut } from "./hotkeys";
import { cn } from "../lib/utils";

// The answering half of a blind pairwise judgment ("which is better: A, B, or about the same?"),
// wrapped around `Compare` because the two share one keyboard and one legend. It exists because
// strata-models' judge and the stills arena each drew their own bar and their own keys beside
// Compare's: two legends, answer keys nobody could guess (`[` `]` `t`) because the natural ones
// were taken, and the pictures lost "click to choose" once a click panned.
//
// - Keys come from one list merged into Compare's (`extraShortcuts`), so there is one legend and
//   a clash is visible: `a` and `b` choose a side, `t` is about the same, `s` is can't tell. None
//   of them is a view, zoom or full-screen key. Arrow keys are left to panning and the swipe
//   divider on purpose: a person who zooms in and presses an arrow to pan must not cast a vote.
// - Choosing is a button under the pictures, not a click on them: a click on a picture pans.
//   The bar is part of Compare's footer so it stays on screen in full screen.
// - No button is filled: while either side can win, nothing is the default (ux-research
//   `patterns.md` §2, one filled button, and a filled "A" would lean on the judge).
// - The last answer's Undo sits in the same footer, so it is inside full screen too: a judge who answers
//   there must be able to take it back without leaving.
// - `pending` disables the buttons and the keys, and says so in words, because an answer
//   that is still being saved must not be answered twice.
// - The pair is a `Load` so a pair that is on its way, an empty queue and a failed read each have
//   their own words (`skeleton`, `empty` required, the failure with Try again).
// - Blind is Compare's: `blind` stays required here, and the buttons are named with the labels
//   only ("Prefer A"), never the id.
// - Statistics (ratings, confidence, which pair comes next) stay on the server; this draws the
//   question and reports the answer.
// Checked: React Aria has no vote or pairwise-choice part; the bar is `Button`s and a `Menu`
// (React Aria's) for the flag reasons.

/** One answer to a pair: a side, "about the same", "can't tell", or a flag with its reason. */
export type PairAnswer = { answer: "a" | "b" | "tie" | "skip" } | { answer: "flag"; reason: string };

/** A pair to judge. */
export type Pair = { label: string; a: Candidate; b: Candidate };

/** Words for the vote bar, all in the product's voice. */
export type PairVoteWords = {
  /** Default "About the same". */
  tie?: string;
  /** Default "Can't tell". */
  skip?: string;
  /** What choosing a side says: `(label) => "Prefer " + label`. Default "Prefer …". */
  prefer?: (label: string) => string;
  /** Said while an answer is being saved. Default "Saving your answer…". */
  pending?: string;
  /** The flag menu's button. Default "Flag this pair". */
  flag?: string;
};

/** Props for `PairVote`. */
export type PairVoteProps = Omit<CompareProps, "label" | "a" | "b" | "extraShortcuts" | "footer"> & {
  /** The pair now being judged, as a read. */
  pair: Load<Pair | null>;
  /** Mirrors the pictures and the bar while the pair loads. Required. */
  skeleton: React.ReactNode;
  /** What to show when there is nothing left to judge, and what to do next. Required. */
  empty: React.ReactNode;
  /** Receives the answer. The caller sends it and sets `pending` meanwhile. */
  onAnswer: (answer: PairAnswer) => void;
  /** An answer is being saved: buttons and keys are off. */
  pending: boolean;
  /** A line above the pictures: "12 pairs left". */
  progress?: React.ReactNode;
  /** Reasons the judge can give for setting a pair aside ("Picture missing", "Not the same scene"); no flag menu without them. */
  flagReasons?: readonly string[];
  /** Addresses of the next pairs' pictures, fetched ahead so the next pair is on screen the moment this one is answered. */
  preload?: readonly string[];
  /** The answer just given: what it was, how to take it back, and what to show of the pair after (`reveal`, never during the judgment). */
  last?: { text: string; onUndo: () => void; reveal?: React.ReactNode };
  words?: PairVoteWords;
};

/** A blind pairwise judgment: two pictures in `Compare`, answer keys in its legend, and a vote bar that never leans on either side. */
export function PairVote({ pair, skeleton, empty, onAnswer, pending, progress, flagReasons, preload, last, words = {}, ...compare }: PairVoteProps) {
  React.useEffect(() => {
    // Warm the cache only; the elements are dropped at once.
    for (const src of preload ?? []) new Image().src = src;
  }, [preload]);
  const w = { tie: "About the same", skip: "Can't tell", pending: "Saving your answer…", flag: "Flag this pair", prefer: (l: string) => `Prefer ${l}`, ...words };
  return (
    <div className="grid gap-3">
      {progress && <p className="type-body-sm text-muted-foreground">{progress}</p>}
      <DataView state={pair} isEmpty={(p) => p === null} skeleton={skeleton} empty={empty}>
        {(p) =>
          p && (
            <Judged pair={p} onAnswer={onAnswer} pending={pending} flagReasons={flagReasons} words={w} last={last} compare={compare} />
          )
        }
      </DataView>
      {/* With no pair on screen (the queue just ran out) the last answer can still be taken back. */}
      {last && !(pair.status === "ready" && pair.data) && <LastAnswer last={last} />}
    </div>
  );
}

function LastAnswer({ last }: { last: NonNullable<PairVoteProps["last"]> }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 type-body-sm text-muted-foreground">
      <span>{last.text}</span>
      <Button size="sm" variant="ghost" onPress={last.onUndo}>
        Undo
      </Button>
      {last.reveal}
    </div>
  );
}

function Judged({ pair, onAnswer, pending, flagReasons, words, last, compare }: { pair: Pair; last?: PairVoteProps["last"]; onAnswer: (a: PairAnswer) => void; pending: boolean; flagReasons?: readonly string[]; words: Required<PairVoteWords>; compare: Omit<CompareProps, "label" | "a" | "b" | "extraShortcuts" | "footer"> }) {
  const { a, b } = pair;
  const answer = (x: PairAnswer) => !pending && onAnswer(x);
  const shortcuts: Shortcut[] = [
    { keys: ["a"], label: words.prefer(a.label), run: () => answer({ answer: "a" }), disabled: pending },
    { keys: ["b"], label: words.prefer(b.label), run: () => answer({ answer: "b" }), disabled: pending },
    { keys: ["t"], label: words.tie, run: () => answer({ answer: "tie" }), disabled: pending },
    { keys: ["s"], label: words.skip, run: () => answer({ answer: "skip" }), disabled: pending },
  ];
  const footer = (
    <div className={cn("grid gap-2")} aria-busy={pending || undefined}>
      <div role="group" aria-label="Your answer" className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onPress={() => answer({ answer: "a" })}>{words.prefer(a.label)}</Button>
        <Button disabled={pending} onPress={() => answer({ answer: "tie" })}>{words.tie}</Button>
        <Button disabled={pending} onPress={() => answer({ answer: "b" })}>{words.prefer(b.label)}</Button>
        <Button variant="ghost" disabled={pending} onPress={() => answer({ answer: "skip" })}>{words.skip}</Button>
        {flagReasons && flagReasons.length > 0 && (
          <Menu
            label={words.flag}
            trigger={
              <Button variant="ghost" disabled={pending}>
                <Flag aria-hidden />
                {words.flag}
              </Button>
            }
            items={flagReasons.map((reason) => ({ id: reason, label: reason, run: () => answer({ answer: "flag", reason }) }))}
          />
        )}
      </div>
      {pending && <p role="status" className="type-body-sm text-muted-foreground">{words.pending}</p>}
      {last && <LastAnswer last={last} />}
    </div>
  );
  return <Compare {...compare} label={pair.label} a={a} b={b} extraShortcuts={shortcuts} footer={footer} />;
}
