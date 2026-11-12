import * as React from "react";
import { Button } from "./button";
import type { SeekBarSpan } from "./media";
import type { SpanTone } from "./line-chart";

// Marked stretches of a recording that the player draws on its seek bar and can act on (strata-react
// issue #207, from Tubes: intros, recaps, sponsor reads, adverts, credits). Three things an app that
// knows such stretches (chapter data, a transcript, a community database, an editor's marks) wants, and
// today writes beside the player by finding the <video> inside it:
//
// - They are seen: each is a range on the bar, named for a screen reader and in a tooltip.
// - What happens when playback reaches one is chosen per kind: `auto` acts as it starts (skip to its
//   end, or mute it for a stretch whose picture is wanted but whose sound is not) and says so with
//   Undo; `ask` offers a button over the picture; `off` only draws it.
// - Each stretch is acted on once: one that was skipped, or let play after Undo, is not acted on again
//   if playback goes back into it, and a muted one unmutes when playback leaves it.
//
// Deliberate choices, each from the rules this library already keeps:
// - Colour is a status role per kind (`tone`), never a colour the library picks, and never the only
//   carrier: the span is a named image with its times, and the Skip button names the kind in words.
// - One verb through every state, in the product's words (`words`): "Skip intro", "Skipped intro",
//   "Undo". A reversible action is done at once and offered back (ux-research patterns, undo over
//   confirmation), like `useUndoable`'s bar, but here the notice is the player's own.
// - Acting happens on playback entering a span while playing, however it got there (a seek into an
//   intro skips it too); nothing happens while paused, so a person who pauses inside a span and
//   scrubs about is not fought with.
// - A source still being made (`growing`) has spans beyond what exists: they are drawn, and an `auto`
//   skip waits until its end exists instead of skipping into nothing.
// - The keyboard path is the button (focusable) and the `s` key while an offer shows.
//
// Checked: React Aria has no part for this (it is a policy on top of time, not a control); the Skip
// button is a `Button`, the bar's ranges are drawn by `SeekBar`.

/** What happens when playback reaches a kind of stretch. `"off"` only draws it. */
export type SpanBehaviour = "auto" | "ask" | "off";

/** How one kind of stretch is drawn and treated. */
export type SpanKind = {
  /** "Intro": its name on the bar and in the buttons ("Skip intro"). */
  label: string;
  /** Default "off". */
  behaviour?: SpanBehaviour;
  /** Default "info". */
  tone?: SpanTone;
};

/** A stretch of the recording, in seconds on the player's timeline, of one of the `spanKinds`. */
export type MediaSpanData = {
  start: number;
  end: number;
  kind: string;
  /** What acting on it does: skip to its end (default), or mute until it ends. */
  action?: "skip" | "mute";
};

/** What the player did with a stretch, for an app that records it: `skipped`, `muted`, `undone` (the person took it back), `played` (it was offered and let play, or played after Undo). */
export type SpanOutcome = "skipped" | "muted" | "undone" | "played";

/** The words of the Skip button and the notice, in the product's voice. Each takes the kind's label. */
export type SpanWords = {
  /** Default `Skip intro` (the label in lower case). */
  skip?: (label: string) => string;
  /** Default `Skipped intro`. */
  skipped?: (label: string) => string;
  /** Default `Mute sponsor`. */
  mute?: (label: string) => string;
  /** Default `Muted sponsor`. */
  muted?: (label: string) => string;
  /** Default "Undo". */
  undo?: string;
};

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const WORDS: Required<SpanWords> = {
  skip: (l) => `Skip ${lower(l)}`,
  skipped: (l) => `Skipped ${lower(l)}`,
  mute: (l) => `Mute ${lower(l)}`,
  muted: (l) => `Muted ${lower(l)}`,
  undo: "Undo",
};

/** How long "Skipped intro, Undo" stays. */
const NOTICE_MS = 6000;

type Entry = MediaSpanData & { id: string; def: SpanKind; action: "skip" | "mute"; data: MediaSpanData };

type Options = {
  spans?: readonly MediaSpanData[];
  kinds?: Readonly<Record<string, SpanKind>>;
  words?: SpanWords;
  onSpan?: (span: MediaSpanData, what: SpanOutcome) => void;
  /** Seconds, on the same timeline as the spans. */
  time: number;
  playing: boolean;
  /** The length, once known: spans are cut to it. */
  duration: number | null;
  /** Seconds that exist so far, for a source still being made; a span ending beyond it is not skipped yet. */
  limit?: number;
  seek: (time: number) => void;
  /** 0 to 100; 0 is muted. */
  volume: number;
  setVolume: (volume: number) => void;
};

/** What `useMediaSpans` gives the player. */
export type MediaSpansState = {
  /** For `SeekBar spans`. */
  bars: SeekBarSpan[];
  /** The stretch being played that the person can skip (or mute), with its button's words; null when none is offered. */
  offer: { label: string; run: () => void } | null;
  /** What was just done, with the way back; gone after a few seconds. */
  notice: { text: string; undoLabel: string; undo: () => void } | null;
};

/** Draws the spans' ranges and acts on them as playback reaches them. See the file comment for the rules. */
export function useMediaSpans({ spans, kinds = {}, words, onSpan, time, playing, duration, limit = Infinity, seek, volume, setVolume }: Options): MediaSpansState {
  const w = { ...WORDS, ...words };
  const list = React.useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const s of spans ?? []) {
      const end = duration ? Math.min(s.end, duration) : s.end;
      const start = Math.max(s.start, 0);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const def = kinds[s.kind] ?? { label: s.kind.charAt(0).toUpperCase() + s.kind.slice(1) };
      out.push({ ...s, start, end, id: `${s.kind}:${s.start}-${s.end}`, def, action: s.action ?? "skip", data: s });
    }
    return out.sort((a, b) => a.start - b.start);
  }, [spans, kinds, duration]);

  const bars = React.useMemo<SeekBarSpan[]>(() => list.map((s) => ({ start: s.start, end: s.end, label: s.def.label, tone: s.def.tone })), [list]);

  // What has been acted on, what is being played through, and the volume a mute took away.
  const acted = React.useRef(new Set<string>());
  const undone = React.useRef(new Set<string>());
  const inside = React.useRef<string | null>(null);
  const muteHold = React.useRef<{ id: string; volume: number } | null>(null);
  const [notice, setNotice] = React.useState<{ text: string; undo: () => void; key: number } | null>(null);
  const noticeKey = React.useRef(0);
  const latest = React.useRef({ onSpan, seek, setVolume, volume, w });
  latest.current = { onSpan, seek, setVolume, volume, w };

  // A different set of spans is a different recording's: nothing has been acted on yet. Compared by content, so an
  // app that writes the array inline does not start every stretch over on each render.
  const content = (spans ?? []).map((s) => `${s.kind}:${s.start}-${s.end}:${s.action ?? ""}`).join("|");
  React.useEffect(() => {
    acted.current.clear();
    undone.current.clear();
    inside.current = null;
    muteHold.current = null;
    setNotice(null);
  }, [content]);

  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice((n) => (n?.key === notice.key ? null : n)), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const current = playing ? (list.find((s) => time >= s.start && time < s.end) ?? null) : null;

  const act = React.useCallback((s: Entry, from: number) => {
    const l = latest.current;
    acted.current.add(s.id);
    const key = ++noticeKey.current;
    if (s.action === "mute") {
      if (l.volume === 0) return;
      muteHold.current = { id: s.id, volume: l.volume };
      l.setVolume(0);
      l.onSpan?.(s.data, "muted");
      setNotice({
        key,
        text: l.w.muted(s.def.label),
        undo: () => {
          const held = muteHold.current;
          if (held?.id === s.id) {
            muteHold.current = null;
            latest.current.setVolume(held.volume);
          }
          undone.current.add(s.id);
          latest.current.onSpan?.(s.data, "undone");
          setNotice(null);
        },
      });
      return;
    }
    l.seek(s.end);
    l.onSpan?.(s.data, "skipped");
    setNotice({
      key,
      text: l.w.skipped(s.def.label),
      undo: () => {
        undone.current.add(s.id);
        latest.current.seek(from);
        latest.current.onSpan?.(s.data, "undone");
        setNotice(null);
      },
    });
  }, []);

  React.useEffect(() => {
    const was = inside.current;
    const now = current?.id ?? null;
    if (was !== null && was !== now) {
      const left = list.find((s) => s.id === was);
      // Leaving a stretch: a muted one gets its sound back (unless the person already moved the volume), and one that was
      // offered and let play, or played after Undo, is reported once.
      if (muteHold.current?.id === was) {
        const held = muteHold.current;
        muteHold.current = null;
        if (latest.current.volume === 0) latest.current.setVolume(held.volume);
      }
      if (left && (undone.current.has(was) || (left.def.behaviour === "ask" && !acted.current.has(was)))) {
        undone.current.delete(was);
        latest.current.onSpan?.(left.data, "played");
      }
    }
    inside.current = now;
    if (current && current.def.behaviour === "auto" && !acted.current.has(current.id) && !undone.current.has(current.id) && current.end <= limit) act(current, time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, list, limit, act]);

  const offered = current && current.def.behaviour === "ask" && !acted.current.has(current.id) && current.end <= limit ? current : null;
  const offer = React.useMemo(() => (offered ? { label: (offered.action === "mute" ? w.mute : w.skip)(offered.def.label), run: () => act(offered, time) } : null), [offered?.id, time, act, w.mute, w.skip]); // eslint-disable-line react-hooks/exhaustive-deps

  return { bars, offer, notice: notice ? { text: notice.text, undoLabel: w.undo, undo: notice.undo } : null };
}

/** The Skip button and the "Skipped intro, Undo" notice, for the player to draw over a picture or under the bar. The notice's live region is always present, so a screen reader hears what is put in it. */
export function SpanActions({ state, className }: { state: MediaSpansState; className?: string }) {
  const { offer, notice } = state;
  return (
    <div className={className}>
      {offer && (
        <Button variant="outline" size="sm" onClick={offer.run}>
          {offer.label}
          <span aria-hidden> ›</span>
        </Button>
      )}
      <div role="status" className={notice ? "flex items-center gap-2 rounded-overlay border border-border bg-background px-3 py-1 type-body-sm text-foreground shadow-overlay" : undefined}>
        {notice && (
          <>
            <span>{notice.text}</span>
            <Button variant="ghost" size="sm" onClick={notice.undo}>
              {notice.undoLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
