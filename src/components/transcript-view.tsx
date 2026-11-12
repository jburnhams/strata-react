import * as React from "react";
import { Button as AriaButton } from "react-aria-components";
import { format } from "../lib/format";
import { phraseAt, wordAt, type TranscriptGroup, type TranscriptPhrase } from "../lib/transcript";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { NativeSelect } from "./field";
import { ToggleGroup } from "./toggle";
import { VirtualList } from "./virtual-list";
import { VisuallyHidden } from "react-aria";

// Timed text against a player (strata-react issue #186, from strata-360, which is built around a
// transcript: phrases by clip with per-word timing, original and translated text, who spoke, a word lit
// as it is heard, click a word to play from it). `CompareText` shows two texts; nothing showed timed
// text following playback.
//
// - **The phrase and word being heard** come from `time` (the player's, or `useMediaElement`'s) by
//   binary search (`phraseAt`, `wordAt`: a phrase is heard from its start up to its end, a word until
//   the next begins). They are marked by more than colour: the phrase has a bar down its side and
//   `aria-current`, the word is underlined and weighted. Nothing is announced word by word: a screen
//   reader reads the transcript in DOM order as text, and `announce` adds one polite sentence per
//   phrase, off by default (a person reading along with a screen reader hears the speech already).
// - **Follow** scrolls the heard phrase to the middle, but only while the person has not scrolled
//   away: a scroll that follows something they did (wheel, touch, a key, a press on a scrollbar)
//   switches it off and "Jump to now" appears; pressing it, or seeking, switches it back on. A scroll
//   nothing of theirs caused (our own, a layout shift) does not count. With `follow` off there is
//   nothing to jump back to, so no button.
// - **Words are buttons**, so a click or Enter seeks to the word (`onSeek(time, { phraseId,
//   wordIndex })`). They are not tab stops one by one: a row is a grid row (React Aria's `GridList`
//   through `VirtualList`), arrows move between rows and into a row's words, as in every Strata list.
//   In an alternate mode (a translation) there are no word times to click, so the phrase is one button.
// - **Modes and speakers**: `ToggleGroup` for the modes that any phrase has an `alt` for (plus
//   "Original"), and for who spoke (a select past four speakers). Groups with nothing left are hidden.
// - **Long transcripts** are `VirtualList` from 100 rows (headings count as rows). Checked in React
//   Aria's source: the Virtualizer keeps only the visible rows and the focused or dragged ones
//   (`persistedKeys` in `GridList` is drag and drop's), with no way to pin another, so the heard phrase
//   is mounted while it is in view, which follow keeps true, and not when the person has scrolled away.
//   "Jump to now" then shows the heard phrase's text, so it is still named. Scrolling to a row that is
//   not mounted goes by the average mounted row's height, then settles on the row once it is.
// - **A play control per phrase** is a slot (`renderPlay`), normally `PlayWindowButton` from the
//   `window` work (#180), so this component never owns a media element.
//
// Checked: React Aria has no transcript or timed-text part; `GridList` (through `VirtualList`) and the
// toggle buttons are used as they are.

/** What a seek from the transcript says about where it came from. */
export type TranscriptSeek = { phraseId: string; /** The word pressed, when a word was. */ wordIndex?: number };

export type TranscriptViewProps = {
  /** Names the transcript. */
  label: string;
  /** Phrases by clip, in time order. */
  groups: readonly TranscriptGroup[];
  /** The player's time, seconds. */
  time: number;
  /** A word or phrase was pressed: seconds to play from, and which. */
  onSeek: (time: number, from: TranscriptSeek) => void;
  /** The mode shown: "original" (the words) or a key of the phrases' `alt`. Leave out to let the component hold it. */
  mode?: string;
  onModeChange?: (mode: string) => void;
  /** Names for the modes: `{ translated: "English" }`. Default: the key, capitalised. */
  modeLabels?: Readonly<Record<string, string>>;
  /** Show one speaker's phrases: "all" or a speaker. Leave out to let the component hold it. */
  speaker?: string;
  onSpeakerChange?: (speaker: string) => void;
  /** Scroll the heard phrase into view while the person has not scrolled away. Default true. */
  follow?: boolean;
  /** Say each phrase politely as it starts. Default false. */
  announce?: boolean;
  /** A control at the start of each phrase (a `PlayWindowButton`). */
  renderPlay?: (phrase: TranscriptPhrase) => React.ReactNode;
  /** Height of the scroll box once it is long enough to virtualise. Default 480. */
  height?: number;
  className?: string;
};

type Row = { kind: "heading"; key: string; group: TranscriptGroup } | { kind: "phrase"; key: string; phrase: TranscriptPhrase; index: number };

const ALL = "all";
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const range = (a: number, b: number) => `${format.runningTime(a)}–${format.runningTime(b)}`;

/** Timed text that follows playback: the heard word marked, any word or phrase pressed to play from, modes, speakers, follow and Jump to now. */
export function TranscriptView({ label, groups, time, onSeek, mode: controlledMode, onModeChange, modeLabels = {}, speaker: controlledSpeaker, onSpeakerChange, follow = true, announce = false, renderPlay, height = 480, className }: TranscriptViewProps) {
  const [ownMode, setOwnMode] = React.useState("original");
  const [ownSpeaker, setOwnSpeaker] = React.useState(ALL);
  const mode = controlledMode ?? ownMode;
  const speaker = controlledSpeaker ?? ownSpeaker;

  const modes = React.useMemo(() => ["original", ...new Set(groups.flatMap((g) => g.phrases.flatMap((p) => Object.keys(p.alt ?? {}))))], [groups]);
  const speakers = React.useMemo(() => [...new Set(groups.flatMap((g) => g.phrases.map((p) => p.speaker).filter((s): s is string => Boolean(s))))], [groups]);

  // The rows: a heading for each group that has phrases left, then those phrases. `phrases` is the flat list in order, for the lookup.
  const { rows, phrases } = React.useMemo(() => {
    const rows: Row[] = [];
    const phrases: TranscriptPhrase[] = [];
    for (const g of groups) {
      const mine = g.phrases.filter((p) => speaker === ALL || p.speaker === speaker);
      if (mine.length === 0) continue;
      rows.push({ kind: "heading", key: `group:${g.id}`, group: { ...g, start: g.start ?? mine[0].start, end: g.end ?? mine[mine.length - 1].end } });
      for (const p of mine) {
        rows.push({ kind: "phrase", key: p.id, phrase: p, index: phrases.length });
        phrases.push(p);
      }
    }
    return { rows, phrases };
  }, [groups, speaker]);

  const heard = phraseAt(phrases, time);
  const heardPhrase = heard >= 0 ? phrases[heard] : null;
  const heardWord = heardPhrase ? wordAt(heardPhrase, time) : -1;
  const heardText = heardPhrase ? (mode === "original" ? heardPhrase.words.map((w) => w.text).join(" ") : (heardPhrase.alt?.[mode] ?? heardPhrase.words.map((w) => w.text).join(" "))) : "";

  // Follow.
  const root = React.useRef<HTMLDivElement>(null);
  const [following, setFollowing] = React.useState(follow);
  React.useEffect(() => setFollowing(follow), [follow]);
  const ours = React.useRef(0);
  const scrollBox = () => root.current?.querySelector<HTMLElement>("[data-strata-scroll]") ?? null;
  const scrollToHeard = React.useCallback(
    (id: string, tries = 0) => {
      const el = root.current?.querySelector<HTMLElement>(`[data-phrase="${CSS.escape(id)}"]`);
      ours.current = Date.now();
      if (el) {
        el.scrollIntoView?.({ block: "center" });
        return;
      }
      // Not mounted yet (the rows are still being built) or a virtualised row far away: go by the
      // average height of the rows that are mounted, then settle on the row once it is.
      if (tries > 5) return;
      const box = scrollBox();
      const mounted = box ? [...box.querySelectorAll<HTMLElement>("[data-index]")] : [];
      if (box && mounted.length > 0 && box.scrollHeight > box.clientHeight) {
        const avg = mounted.reduce((sum, m) => sum + m.getBoundingClientRect().height, 0) / mounted.length;
        const index = rows.findIndex((r) => r.key === id);
        box.scrollTop = Math.max(index * avg - box.clientHeight / 2, 0);
      }
      requestAnimationFrame(() => scrollToHeard(id, tries + 1));
    },
    [rows],
  );
  const heardId = heardPhrase?.id;
  React.useEffect(() => {
    if (following && heardId) scrollToHeard(heardId);
  }, [heardId, following, scrollToHeard]);
  // A scroll is the person's when they just did something that scrolls (wheel, touch, a key, a press on
  // a scrollbar): a scroll nothing of theirs caused (our own, a layout shift, a test runner's) is not.
  React.useEffect(() => {
    let intent = 0;
    const meant = () => void (intent = Date.now());
    const onScroll = (e: Event) => {
      const el = root.current;
      const target = e.target as Node | null;
      if (!el || !target || !(target === document || (target as Node).contains?.(el) || el.contains(target))) return;
      if (Date.now() - ours.current < 400 || Date.now() - intent > 1000) return;
      setFollowing(false);
    };
    const gestures = ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"] as const;
    for (const g of gestures) document.addEventListener(g, meant, { capture: true, passive: true });
    document.addEventListener("scroll", onScroll, true);
    return () => {
      for (const g of gestures) document.removeEventListener(g, meant, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  // One polite sentence per phrase, when asked for.
  const [said, setSaid] = React.useState("");
  React.useEffect(() => {
    if (announce) setSaid(heardText);
  }, [announce, heardId, heardText]);

  const setMode = (m: string) => {
    if (controlledMode === undefined) setOwnMode(m);
    onModeChange?.(m);
  };
  const setSpeaker = (s: string) => {
    if (controlledSpeaker === undefined) setOwnSpeaker(s);
    onSpeakerChange?.(s);
  };
  const seek = (t: number, from: TranscriptSeek) => {
    setFollowing(follow);
    onSeek(t, from);
  };

  const modeOptions = modes.map((m) => ({ value: m, label: m === "original" ? (modeLabels.original ?? "Original") : (modeLabels[m] ?? capital(m)) }));
  const speakerOptions = [{ value: ALL, label: "Everyone" }, ...speakers.map((s) => ({ value: s, label: s }))];

  return (
    <div ref={root} className={cn("grid min-w-0 gap-3", className)}>
      {(modes.length > 1 || speakers.length > 1) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {modes.length > 1 && <ToggleGroup label={`${label}: text`} options={modeOptions} value={mode} onChange={setMode} size="sm" />}
          {speakers.length > 1 &&
            (speakers.length <= 4 ? (
              <ToggleGroup label={`${label}: speaker`} options={speakerOptions} value={speaker} onChange={setSpeaker} size="sm" />
            ) : (
              <NativeSelect aria-label={`${label}: speaker`} size="sm" value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
                {speakerOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            ))}
        </div>
      )}
      <div className="relative">
        <VirtualList label={label} items={rows} itemKey={(r) => r.key} estimateSize={72} height={height} virtualizeFrom={100}>
          {(row) =>
            row.kind === "heading" ? (
              <div className="flex items-baseline gap-3 bg-surface-sunken px-3 py-2">
                <h3 className="type-label text-foreground">{row.group.title}</h3>
                <span className="type-caption tabular-nums text-muted-foreground">{range(row.group.start!, row.group.end!)}</span>
              </div>
            ) : (
              <PhraseRow phrase={row.phrase} mode={mode} active={row.index === heard} word={row.index === heard ? heardWord : -1} onSeek={seek} play={renderPlay?.(row.phrase)} />
            )
          }
        </VirtualList>
        {follow && !following && heardPhrase && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <Button className="pointer-events-auto max-w-full shadow-overlay" onPress={() => setFollowing(true)}>
              <span className="truncate">Jump to now: {heardText}</span>
            </Button>
          </div>
        )}
      </div>
      <VisuallyHidden>
        <span role="status">{said}</span>
      </VisuallyHidden>
    </div>
  );
}

function PhraseRow({ phrase, mode, active, word, onSeek, play }: { phrase: TranscriptPhrase; mode: string; active: boolean; word: number; onSeek: (time: number, from: TranscriptSeek) => void; play?: React.ReactNode }) {
  const alt = mode === "original" ? null : (phrase.alt?.[mode] ?? null);
  return (
    <div data-phrase={phrase.id} data-active={active ? "" : undefined} aria-current={active ? "true" : undefined} className={cn("flex items-start gap-2 border-l-2 border-transparent px-3 py-2", active && "border-primary bg-accent")}>
      {play}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {phrase.speaker && <span className="type-label text-muted-foreground">{phrase.speaker}</span>}
          <AriaButton onPress={() => onSeek(phrase.start, { phraseId: phrase.id })} className="rounded-control type-caption tabular-nums text-muted-foreground hover:text-foreground" aria-label={`Play from ${format.runningTime(phrase.start)}`}>
            {format.runningTime(phrase.start)}
          </AriaButton>
        </div>
        {alt !== null ? (
          <AriaButton onPress={() => onSeek(phrase.start, { phraseId: phrase.id })} className={cn("rounded-control text-left type-body", active && "font-medium underline decoration-2 underline-offset-4")}>
            {alt}
          </AriaButton>
        ) : (
          <p className="type-body">
            {phrase.words.map((w, i) => (
              <React.Fragment key={i}>
                {i > 0 && " "}
                <AriaButton
                  aria-current={i === word ? "true" : undefined}
                  onPress={() => onSeek(w.start, { phraseId: phrase.id, wordIndex: i })}
                  className={cn("rounded-control hover:bg-muted", i === word && "font-medium underline decoration-2 underline-offset-4")}
                >
                  {w.text}
                </AriaButton>
              </React.Fragment>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
