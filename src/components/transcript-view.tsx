import * as React from "react";
import { Button as AriaButton, Popover as AriaPopover } from "react-aria-components";
import { Ellipsis } from "lucide-react";
import { format } from "../lib/format";
import { isDoubtful, phraseAt, phraseDoubtful, phraseOfWordId, wordAt, wordId, type TranscriptGroup, type TranscriptPhrase, type TranscriptPhraseState } from "../lib/transcript";
import { cn } from "../lib/utils";
import { overlaySurface } from "../lib/overlay";
import { Button, IconButton } from "./button";
import { Menu, type Command, type MenuEntry } from "./commands";
import { NativeSelect, Textarea } from "./field";
import { Status } from "./status";
import { Toggle, ToggleGroup } from "./toggle";
import { Mark, MarkableText, type MarkKind } from "./markable-text";
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
// Doubt, a phrase's own mark, correction and a hover card (issue #223, from strata-360's transcript
// and lyrics screens):
// - **Doubt** is a property of a word (`doubtful`, or `confidence` under `doubtfulBelow`). A doubtful
//   word is dotted-underlined and carries "(doubtful)" for a screen reader, its phrase says
//   "Doubtful" in a `Status`, and the controls give the count ("7 doubtful", of phrases) and an
//   "Only doubtful" toggle: never colour alone, and the filter is how a person works through them.
// - **A phrase's own state** is `phrase.state` (`{ id, label, tone }`), drawn as a `Status` word.
//   `states` lists what a phrase can be marked, and a menu on each row (`Menu`, React Aria's) sets
//   one or clears it through `onPhraseState(phraseId, stateId | null)`. `renderActions` is the slot
//   for anything else the app puts on a row. A summary counts each state by its label.
// - **Correcting text** (its announcements share the one polite region with `announce`): Enter on a focused row, or F2 anywhere in it, opens its text in an inline
//   `Textarea` with Save and Cancel (Ctrl/Cmd+Enter saves, Escape cancels, focus goes back to the
//   row). `onEdit(phraseId, text, { mode })` hands the new text over; the word timings stay the
//   app's (it knows how to keep them), and the change is announced. What is edited is the text of
//   the mode shown (the words, or a translation). The open edit is held by phrase id, not by row,
//   so scrolling it out of a virtualised list and back does not lose it.
// - **A hover card** (`renderCard(phrase)`) opens after `cardDelay` ms on hover, and on focus of a
//   row or anything in it, as a non-modal React Aria `Popover` anchored to the row. Escape closes
//   it, and it is mounted only for the one phrase it is about, which is a mounted (so visible)
//   row. As with a tooltip it is never the only way to its data: what it holds is a detail the
//   app also reaches another way (its details panel), and it holds nothing to press.
//
// A review transcript with no player, and marking words (issue #260, from strata-360's whole-race
// transcript: select words and mark them "must use" or "never use", with a dotted underline where a
// word was corrected):
// - **No player.** `time` and `onSeek` are optional. Without `time` nothing is heard (no bar, no follow,
//   no "Jump to now"); without `onSeek` the words, the phrase times and a translation are text, not
//   buttons. Modes, speakers, doubt, phrase marks, editing and cards work as before.
// - **Marking** (`marking`: `kinds`, `marks`, `onMark`, `clearKeys`) puts the transcript in a
//   `MarkableText`, which is the selection model (ids, drag, Shift+click and arrows, the toolbar, the
//   legend, the summary), and draws each word as a `Mark` with the id `wordId(phraseId, index)`. The ids
//   are every word of the phrases shown, in order, so a drag or Shift+click over rows that are not
//   mounted still selects them all. A word is then a mark target and not a seek button (a press starts a
//   selection): a phrase is played from its time. In a translation there are no words to mark, so the
//   mode shows the text as it is. The caret scrolls its phrase into view the way following does. The
//   region is one tab stop of its own, before the list; keys act on it only while it has focus, so the
//   list keeps its arrows. Enter on the caret's word opens its correction (`onCorrectionPress`), as a
//   click does, so a corrected word is reachable without a pointer.
// - **A corrected word** (`word.correction`) has a dotted underline in the primary colour and says
//   "corrected, was …" to a screen reader; hovering it shows the original in a non-modal popover (the
//   same part as the phrase card). `onCorrectionPress(phraseId, wordIndex)` makes a click on it open
//   the correction (instead of seeking, where the word would seek).
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
  /** The player's time, seconds. Leave out for a transcript with no player: nothing is heard or followed. */
  time?: number;
  /** A word or phrase was pressed: seconds to play from, and which. Leave out and the words and times are text. */
  onSeek?: (time: number, from: TranscriptSeek) => void;
  /** Mark words (`MarkableText`): the kinds, the mark on each word id (`wordId(phraseId, index)`), and `onMark(ids, kind | null)`. Words become marks to select, not seek buttons. */
  marking?: { kinds: readonly MarkKind[]; marks: Readonly<Record<string, string | undefined>>; onMark: (ids: readonly string[], kind: string | null) => void; clearKeys?: string[]; summary?: boolean };
  /** A corrected word was pressed (a click, with no drag): open it for editing. Takes the click on that word from seeking. */
  onCorrectionPress?: (phraseId: string, wordIndex: number) => void;
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
  /** Words under this confidence are doubtful (when they carry `confidence`). Default 0.6. */
  doubtfulBelow?: number;
  /** What a phrase can be marked, offered in each row's menu: `[{ id: "not-sung", label: "Not sung", tone: "neutral" }]`. */
  states?: readonly TranscriptPhraseState[];
  /** A phrase was marked with a state, or `null` when the mark was cleared. */
  onPhraseState?: (phraseId: string, stateId: string | null) => void;
  /** More controls at the end of each phrase (its own menu, a button). */
  renderActions?: (phrase: TranscriptPhrase) => React.ReactNode;
  /** The text of a phrase was corrected (Enter or F2 on its row). Say which mode it was in; word timings are the app's to keep. Leave out for a read-only transcript. */
  onEdit?: (phraseId: string, text: string, from: { mode: string }) => void;
  /** Details shown on hover and focus: a clip's picture, real time, who spoke. Called only for the phrase it is open on. */
  renderCard?: (phrase: TranscriptPhrase) => React.ReactNode;
  /** How long hover or focus rests on a phrase before its card opens, ms. Default 500. */
  cardDelay?: number;
  /** Height of the scroll box once it is long enough to virtualise. Default 480. */
  height?: number;
  className?: string;
};

type Row = { kind: "heading"; key: string; group: TranscriptGroup } | { kind: "phrase"; key: string; phrase: TranscriptPhrase; index: number };

const ALL = "all";
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const range = (a: number, b: number) => `${format.runningTime(a)}–${format.runningTime(b)}`;

/** Timed text that follows playback: the heard word marked, any word or phrase pressed to play from, modes, speakers, follow and Jump to now. */
export function TranscriptView({ label, groups, time, onSeek, marking, onCorrectionPress, mode: controlledMode, onModeChange, modeLabels = {}, speaker: controlledSpeaker, onSpeakerChange, follow = true, announce = false, renderPlay, doubtfulBelow = 0.6, states = [], onPhraseState, renderActions, onEdit, renderCard, cardDelay = 500, height = 480, className }: TranscriptViewProps) {
  const [ownMode, setOwnMode] = React.useState("original");
  const [ownSpeaker, setOwnSpeaker] = React.useState(ALL);
  const mode = controlledMode ?? ownMode;
  const speaker = controlledSpeaker ?? ownSpeaker;

  const modes = React.useMemo(() => ["original", ...new Set(groups.flatMap((g) => g.phrases.flatMap((p) => Object.keys(p.alt ?? {}))))], [groups]);
  const speakers = React.useMemo(() => [...new Set(groups.flatMap((g) => g.phrases.map((p) => p.speaker).filter((s): s is string => Boolean(s))))], [groups]);

  const [onlyDoubtful, setOnlyDoubtful] = React.useState(false);
  // What the summary counts: phrases of the speaker shown, by doubt and by their own mark.
  const summary = React.useMemo(() => {
    const mine = groups.flatMap((g) => g.phrases).filter((p) => speaker === ALL || p.speaker === speaker);
    const doubtful = mine.filter((p) => phraseDoubtful(p, doubtfulBelow)).length;
    const marked = new Map<string, number>();
    for (const p of mine) if (p.state) marked.set(p.state.label, (marked.get(p.state.label) ?? 0) + 1);
    return { doubtful, marked: [...marked] };
  }, [groups, speaker, doubtfulBelow]);
  // The filter ends with nothing left to filter: no toggle, no empty transcript.
  const filtering = onlyDoubtful && summary.doubtful > 0;

  // The rows: a heading for each group that has phrases left, then those phrases. `phrases` is the flat list in order, for the lookup.
  const { rows, phrases } = React.useMemo(() => {
    const rows: Row[] = [];
    const phrases: TranscriptPhrase[] = [];
    for (const g of groups) {
      const mine = g.phrases.filter((p) => (speaker === ALL || p.speaker === speaker) && (!filtering || phraseDoubtful(p, doubtfulBelow)));
      if (mine.length === 0) continue;
      rows.push({ kind: "heading", key: `group:${g.id}`, group: { ...g, start: g.start ?? mine[0].start, end: g.end ?? mine[mine.length - 1].end } });
      for (const p of mine) {
        rows.push({ kind: "phrase", key: p.id, phrase: p, index: phrases.length });
        phrases.push(p);
      }
    }
    return { rows, phrases };
  }, [groups, speaker, filtering, doubtfulBelow]);

  const heard = time === undefined ? -1 : phraseAt(phrases, time);
  const heardPhrase = heard >= 0 ? phrases[heard] : null;
  const heardWord = heardPhrase && time !== undefined ? wordAt(heardPhrase, time) : -1;
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

  // Correcting text: held by phrase id (not by row), so a row that scrolls away and back keeps it.
  const [editing, setEditing] = React.useState<{ id: string; text: string; mode: string } | null>(null);
  const textOf = (p: TranscriptPhrase) => (mode === "original" ? p.words.map((w) => w.text).join(" ") : (p.alt?.[mode] ?? p.words.map((w) => w.text).join(" ")));
  const rowEl = (id: string) => root.current?.querySelector<HTMLElement>(`[data-phrase="${CSS.escape(id)}"]`)?.closest<HTMLElement>('[role="row"]') ?? null;
  const startEdit = (id: string) => {
    const p = phrases.find((x) => x.id === id);
    if (!p || !onEdit) return;
    setEditing({ id, text: textOf(p), mode });
    setSaid(`Editing the phrase at ${format.runningTime(p.start)}. Control Enter saves, Escape cancels.`);
  };
  const stopEdit = (saved: boolean) => {
    const id = editing?.id;
    if (editing && saved) {
      const p = phrases.find((x) => x.id === editing.id);
      // The text is saved against the mode it was opened in, even if the view has switched since.
      const was = p && (editing.mode === "original" ? p.words.map((w) => w.text).join(" ") : (p.alt?.[editing.mode] ?? p.words.map((w) => w.text).join(" ")));
      if (p && editing.text.trim() !== was) {
        onEdit?.(editing.id, editing.text.trim(), { mode: editing.mode });
        setSaid(`Saved the phrase at ${format.runningTime(p.start)}.`);
      } else setSaid("No change.");
    } else if (editing) setSaid("Edit cancelled.");
    setEditing(null);
    if (id) requestAnimationFrame(() => rowEl(id)?.focus());
  };

  // The hover card: one at a time, after a rest, for the phrase hovered or focused.
  const [card, setCard] = React.useState<string | null>(null);
  const cardTimer = React.useRef<number | undefined>(undefined);
  const dismissed = React.useRef<string | null>(null); // Escape closed this one; it stays closed until another is entered
  const showCard = (id: string | null) => {
    window.clearTimeout(cardTimer.current);
    if (id === null) return setCard(null);
    if (!renderCard || dismissed.current === id) return;
    cardTimer.current = window.setTimeout(() => setCard(id), cardDelay);
  };
  React.useEffect(() => () => window.clearTimeout(cardTimer.current), []);
  // Escape closes a card whatever has focus: a hover card has none, and nothing about it is modal.
  React.useEffect(() => {
    if (!card) return;
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dismissed.current = card;
      showCard(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [card]);
  const phraseOfEvent = (target: EventTarget | null): string | null => {
    const row = (target as HTMLElement | null)?.closest?.('[role="row"]');
    return row?.querySelector("[data-phrase]")?.getAttribute("data-phrase") ?? null;
  };
  const onKeys = (e: React.KeyboardEvent) => {
    if (!onEdit || editing) return;
    const id = phraseOfEvent(e.target);
    if (!id) return;
    // Enter on the row itself edits; Enter on a word or the time still plays from there.
    if (e.key === "F2" || (e.key === "Enter" && (e.target as HTMLElement).getAttribute("role") === "row")) {
      e.preventDefault();
      startEdit(id);
    }
  };

  const setMode = (m: string) => {
    if (controlledMode === undefined) setOwnMode(m);
    onModeChange?.(m);
  };
  const setSpeaker = (s: string) => {
    if (controlledSpeaker === undefined) setOwnSpeaker(s);
    onSpeakerChange?.(s);
  };
  const seek = onSeek
    ? (t: number, from: TranscriptSeek) => {
        setFollowing(follow);
        onSeek(t, from);
      }
    : undefined;

  // Marking: every word of the phrases shown, in order (also those in rows not mounted), and the
  // original words only: a translation has no words to mark.
  const marks = marking && mode === "original" ? marking : null;
  const wordIds = React.useMemo(() => (marks ? phrases.flatMap((p) => p.words.map((_, i) => wordId(p.id, i))) : []), [marks, phrases]);
  // A corrected word's original, shown on hover in the same kind of popover as the phrase card.
  const [hint, setHint] = React.useState<{ el: HTMLElement; text: string } | null>(null);

  const modeOptions = modes.map((m) => ({ value: m, label: m === "original" ? (modeLabels.original ?? "Original") : (modeLabels[m] ?? capital(m)) }));
  const speakerOptions = [{ value: ALL, label: "Everyone" }, ...speakers.map((s) => ({ value: s, label: s }))];

  const list = (
        <div className="relative" onKeyDown={onKeys} onFocus={(e) => showCard(phraseOfEvent(e.target))} onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) showCard(null); }} onPointerLeave={() => { dismissed.current = null; showCard(null); }}>
        <VirtualList label={label} items={rows} itemKey={(r) => r.key} estimateSize={72} height={height} virtualizeFrom={100}>
          {(row) =>
            row.kind === "heading" ? (
              <div className="flex items-baseline gap-3 bg-surface-sunken px-3 py-2">
                <h3 className="type-label text-foreground">{row.group.title}</h3>
                <span className="type-caption tabular-nums text-muted-foreground">{range(row.group.start!, row.group.end!)}</span>
              </div>
            ) : (
              <PhraseRow
                phrase={row.phrase}
                marking={Boolean(marks)}
                onCorrectionPress={onCorrectionPress}
                onHint={setHint}
                mode={mode}
                active={row.index === heard}
                word={row.index === heard ? heardWord : -1}
                onSeek={seek}
                play={renderPlay?.(row.phrase)}
                doubtfulBelow={doubtfulBelow}
                states={states}
                onPhraseState={onPhraseState}
                actions={renderActions?.(row.phrase)}
                edit={editing?.id === row.phrase.id ? { text: editing.text, change: (text) => setEditing({ ...editing, text }), done: stopEdit } : undefined}
                onHover={(on) => { if (!on) dismissed.current = null; showCard(on ? row.phrase.id : null); }}
              />
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
  );

  return (
    <div ref={root} className={cn("grid min-w-0 gap-3", className)}>
      {(modes.length > 1 || speakers.length > 1 || summary.doubtful > 0 || summary.marked.length > 0) && (
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
          {(summary.doubtful > 0 || summary.marked.length > 0) && (
            <p className="type-body-sm tabular-nums text-muted-foreground">
              {[...(summary.doubtful > 0 ? [`${summary.doubtful} doubtful`] : []), ...summary.marked.map(([name, n]) => `${n} ${name.toLowerCase()}`)].join(" · ")}
            </p>
          )}
          {summary.doubtful > 0 && <Toggle label="Only doubtful" size="sm" pressed={onlyDoubtful} onChange={setOnlyDoubtful} />}
        </div>
      )}
      {marks ? (
        <MarkableText label={`${label}, for marking`} ids={wordIds} marks={marks.marks} kinds={marks.kinds} onMark={marks.onMark} clearKeys={marks.clearKeys} summary={marks.summary} onActivate={onCorrectionPress ? (id) => { const pid = phraseOfWordId(id); const i = Number(id.slice(pid.length + 1)); if (phrases.find((x) => x.id === pid)?.words[i]?.correction) onCorrectionPress(pid, i); } : undefined} onCaretChange={(id) => scrollToHeard(phraseOfWordId(id))}>
          {list}
        </MarkableText>
      ) : (
        list
      )}
      <VisuallyHidden>
        <span role="status">{said}</span>
      </VisuallyHidden>
      {hint && (
        <AriaPopover triggerRef={{ current: hint.el }} isOpen isNonModal placement="top" offset={4} className={cn("layer-overlay max-w-xs px-2 py-1 type-caption", overlaySurface)}>
          {hint.text}
        </AriaPopover>
      )}
      {card && renderCard && (() => {
        const p = phrases.find((x) => x.id === card);
        const anchor = rowEl(card);
        return p && anchor ? (
          <AriaPopover triggerRef={{ current: anchor }} isOpen isNonModal placement="bottom start" offset={4} className={cn("layer-overlay max-w-xs p-3", overlaySurface)}>
            <div data-card={card}>{renderCard(p)}</div>
          </AriaPopover>
        ) : null;
      })()}
    </div>
  );
}

function PhraseRow({
  phrase,
  mode,
  active,
  word,
  onSeek,
  marking,
  onCorrectionPress,
  onHint,
  play,
  doubtfulBelow,
  states,
  onPhraseState,
  actions,
  edit,
  onHover,
}: {
  phrase: TranscriptPhrase;
  mode: string;
  active: boolean;
  word: number;
  onSeek?: (time: number, from: TranscriptSeek) => void;
  marking: boolean;
  onCorrectionPress?: (phraseId: string, wordIndex: number) => void;
  /** The pointer is over a corrected word (its element and what to say), or left. */
  onHint: (hint: { el: HTMLElement; text: string } | null) => void;
  play?: React.ReactNode;
  doubtfulBelow: number;
  states: readonly TranscriptPhraseState[];
  onPhraseState?: (phraseId: string, stateId: string | null) => void;
  actions?: React.ReactNode;
  edit?: { text: string; change: (text: string) => void; done: (saved: boolean) => void };
  onHover: (on: boolean) => void;
}) {
  const alt = mode === "original" ? null : (phrase.alt?.[mode] ?? null);
  const doubtful = phraseDoubtful(phrase, doubtfulBelow);
  // The mark it has is on the row as a word, so the menu offers the others and Clear mark; it closes after a choice.
  const marks: Command[] = states.filter((s) => s.id !== phrase.state?.id).map((s) => ({ id: s.id, label: s.label, run: () => onPhraseState?.(phrase.id, s.id) }));
  const commands: MenuEntry[] = [
    ...(marks.length > 0 ? [{ group: "Mark as", items: marks }] : []),
    ...(phrase.state ? [{ id: "clear", label: "Clear mark", run: () => onPhraseState?.(phrase.id, null) }] : []),
  ];
  return (
    <div
      data-phrase={phrase.id}
      data-active={active ? "" : undefined}
      aria-current={active ? "true" : undefined}
      onPointerEnter={() => onHover(true)}
      className={cn("flex items-start gap-2 border-l-2 border-transparent px-3 py-2", active && "border-primary bg-accent")}
    >
      {play}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {phrase.speaker && <span className="type-label text-muted-foreground">{phrase.speaker}</span>}
          {onSeek ? (
            <AriaButton onPress={() => onSeek(phrase.start, { phraseId: phrase.id })} className="rounded-control type-caption tabular-nums text-muted-foreground hover:text-foreground" aria-label={`Play from ${format.runningTime(phrase.start)}`}>
              {format.runningTime(phrase.start)}
            </AriaButton>
          ) : (
            <span className="type-caption tabular-nums text-muted-foreground">{format.runningTime(phrase.start)}</span>
          )}
          {doubtful && <Status tone="warning">Doubtful</Status>}
          {phrase.state && <Status tone={phrase.state.tone}>{phrase.state.label}</Status>}
        </div>
        {edit ? (
          <div className="mt-1 grid gap-2">
            <Textarea
              autoFocus
              aria-label={`Edit the phrase at ${format.runningTime(phrase.start)}`}
              value={edit.text}
              onChange={(e) => edit.change(e.target.value)}
              onKeyDown={(e) => {
                // A text box keeps its own keys: nothing here reaches the list's arrows or the row's Enter.
                e.stopPropagation();
                if (e.key === "Escape") edit.done(false);
                else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) edit.done(true);
              }}
              className="min-h-16"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="default" onPress={() => edit.done(true)}>Save</Button>
              <Button size="sm" variant="ghost" onPress={() => edit.done(false)}>Cancel</Button>
            </div>
          </div>
        ) : alt !== null ? (
          onSeek ? (
            <AriaButton onPress={() => onSeek(phrase.start, { phraseId: phrase.id })} className={cn("rounded-control text-left type-body", active && "font-medium underline decoration-2 underline-offset-4")}>
              {alt}
            </AriaButton>
          ) : (
            <p className={cn("type-body", active && "font-medium underline decoration-2 underline-offset-4")}>{alt}</p>
          )
        ) : (
          <p className="type-body">
            {phrase.words.map((w, i) => {
              const doubt = isDoubtful(w, doubtfulBelow);
              const looks = cn(doubt && "underline decoration-dotted decoration-2 underline-offset-4", w.correction && "underline decoration-dotted decoration-primary decoration-2 underline-offset-4");
              const said = (
                <>
                  {w.text}
                  {doubt && <VisuallyHidden> (doubtful)</VisuallyHidden>}
                  {w.correction && <VisuallyHidden> (corrected, was {w.correction.original})</VisuallyHidden>}
                </>
              );
              const hint = w.correction ? (el: HTMLElement | null) => onHint(el ? { el, text: `Was “${w.correction!.original}”${w.correction!.by ? `, corrected by ${w.correction!.by}` : ""}` } : null) : undefined;
              const press = w.correction && onCorrectionPress ? () => onCorrectionPress(phrase.id, i) : onSeek ? () => onSeek(w.start, { phraseId: phrase.id, wordIndex: i }) : undefined;
              return (
                <React.Fragment key={i}>
                  {i > 0 && " "}
                  {marking ? (
                    <Mark id={wordId(phrase.id, i)} className={cn(looks, i === word && "font-medium")} onClick={w.correction && onCorrectionPress ? press : undefined} onHover={hint}>
                      {said}
                    </Mark>
                  ) : press ? (
                    <AriaButton
                      aria-current={i === word ? "true" : undefined}
                      data-doubtful={doubt ? "" : undefined}
                      onPress={press}
                      onHoverStart={hint ? (e) => hint(e.target as HTMLElement) : undefined}
                      onHoverEnd={hint ? () => hint(null) : undefined}
                      className={cn("rounded-control hover:bg-muted", looks, i === word && "font-medium underline decoration-2 underline-offset-4")}
                    >
                      {said}
                    </AriaButton>
                  ) : (
                    <span
                      aria-current={i === word ? "true" : undefined}
                      data-doubtful={doubt ? "" : undefined}
                      onPointerEnter={hint ? (e) => hint(e.currentTarget) : undefined}
                      onPointerLeave={hint ? () => hint(null) : undefined}
                      className={cn("rounded-control", looks, i === word && "font-medium underline decoration-2 underline-offset-4")}
                    >
                      {said}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </p>
        )}
      </div>
      {(commands.length > 0 || actions) && !edit && (
        <div className="flex shrink-0 items-center gap-1">
          {commands.length > 0 && (
            <Menu label={`Mark the phrase at ${format.runningTime(phrase.start)}`} trigger={<IconButton icon={Ellipsis} label={`Mark the phrase at ${format.runningTime(phrase.start)}`} size="sm" />} items={commands} />
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
