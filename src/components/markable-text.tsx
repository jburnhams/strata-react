import * as React from "react";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { countMarks, rangeBetween, stepId } from "../lib/marks";
import type { IconComponent } from "../lib/icon";
import { Button } from "./button";
import { CommandLegend, useCommands, type Command } from "./commands";
import { Toolbar } from "./toolbar";

// Select words and apply a mark from a small toolbar: must use, never use, clear. Issue #187, from
// strata-360's word marker, where you drag across words and phrases and keys G, R and W do the same.
//
// The selection is ids, not DOM. The words are `<Mark id>` elements the app draws (so they can be
// inside a `VirtualList` or a `TranscriptView`), and the selection is a run of ids in the order the
// app gives in `ids` (`rangeBetween`). A drag or a Shift+click across rows that are not all mounted
// still selects every id between, which a browser `Range` cannot: it would lose the rows scrolled out.
// The app does the storing: `onMark(ids, kind | null)` is the one outgoing call, and `marks` (id to
// kind key) the one incoming state. Undo is the app's `useHistory`: name the step ("Mark 5 words
// must use") and have `onMark` push a command that restores the previous kinds of those ids.
//
// How a mark looks. A kind has a tone (a role colour, never a hue of ours), a pattern (an underline
// style: solid, dashed, dotted, double) and an icon for the toolbar and legend, and the word carries
// its meaning in text for a screen reader ("must use"), so colour is never alone. A selected word is
// tinted with the accent and the caret word has an outline.
//
// Keyboard-only use is complete. The region takes one tab stop; Left and Right move a caret across
// words, Shift extends from where the selection began, Home and End go to the ends, Escape clears.
// The words are not separate tab stops (a transcript has thousands), so the caret is announced in a
// polite region instead: the word and its mark, and "5 words selected" when a run grows. The kinds'
// chords are `Command`s through `useCommands`, so single keys never fire while typing, show in a
// legend and are disabled, with the reason, while nothing is selected. `onCaretChange` lets a
// virtualised list scroll the caret's word into view.
//
// The toolbar is a bar above the text, not a `Popover` at the selection: a selection can start in a
// row that is unmounted, so there may be no element to anchor to, and our `Popover` takes a trigger
// element and moves focus, which would take it from the text and end Shift+arrow selection. The bar
// is the same `Toolbar` (one tab stop, arrows) and appears only while words are selected.
//
// Pointer: press on a word starts a selection, moving over others while pressed extends it (a
// click is one word), Shift+click extends from the last. Text selection by the browser is off in the
// region, since a second selection model on the same words would fight this one.

/** A tone for a mark, as a role colour. */
export type MarkTone = "neutral" | "info" | "success" | "warning" | "danger";

/** An underline pattern, so a mark does not depend on its colour. */
export type MarkPattern = "solid" | "dashed" | "dotted" | "double" | "wavy";

/** One kind of mark the app offers. */
export type MarkKind = {
  /** What is stored per word. */
  key: string;
  /** What the mark means, said and shown: "Must use". Never a colour name. */
  label: string;
  tone: MarkTone;
  pattern: MarkPattern;
  /** Shown in the toolbar, legend and summary beside the label. */
  icon?: IconComponent;
  /** The chord that applies it to the selection: `["g"]`. Single keys are fine; they never fire while typing. */
  keys?: string[];
};

const TONE: Record<MarkTone, { fill: string; edge: string }> = {
  neutral: { fill: "var(--muted)", edge: "var(--muted-foreground)" },
  info: { fill: "var(--info-subtle)", edge: "var(--info)" },
  success: { fill: "var(--success-subtle)", edge: "var(--success)" },
  warning: { fill: "var(--warning-subtle)", edge: "var(--warning)" },
  danger: { fill: "var(--danger-subtle)", edge: "var(--danger)" },
};

type Ctx = {
  kinds: readonly MarkKind[];
  marks: Readonly<Record<string, string | undefined>>;
  selected: ReadonlySet<string>;
  caret: string | null;
  press: (e: React.PointerEvent, id: string) => void;
  over: (id: string) => void;
};
const MarksContext = React.createContext<Ctx | null>(null);

/** One word (or phrase, or clip) that can be marked. Draws its mark, its selection and the caret; inside a `MarkableText`. */
export function Mark({ id, children, className, onClick, onHover }: { id: string; children: React.ReactNode; className?: string; /** A click on the word (a press and release on it), beside selecting it: a correction opens. */ onClick?: () => void; /** The pointer is over the word (its element) or has left (`null`). */ onHover?: (el: HTMLElement | null) => void }) {
  const c = React.useContext(MarksContext);
  if (!c) return <span className={className}>{children}</span>;
  const kind = c.kinds.find((k) => k.key === c.marks[id]);
  const tone = kind && TONE[kind.tone];
  const on = c.selected.has(id);
  return (
    <span
      data-mark-id={id}
      data-mark={kind?.key}
      data-selected={on || undefined}
      data-caret={c.caret === id || undefined}
      onPointerDown={(e) => c.press(e, id)}
      onPointerEnter={(e) => {
        c.over(id);
        onHover?.(e.currentTarget);
      }}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
      onClick={onClick}
      className={cn("cursor-text rounded-control px-px", on && "bg-primary/20", c.caret === id && "outline-2 outline-primary", className)}
      style={kind && tone ? { backgroundColor: on ? undefined : tone.fill, textDecorationLine: "underline", textDecorationStyle: kind.pattern, textDecorationColor: tone.edge, textDecorationThickness: "2px", textUnderlineOffset: "3px" } : undefined}
    >
      {children}
      {kind && <span className="sr-only"> ({kind.label.toLowerCase()})</span>}
    </span>
  );
}

/** "12 words must use, 3 never": a count for each kind in use, with its icon. */
export function MarkSummary({ marks, kinds, unit = ["word", "words"], className }: { marks: Readonly<Record<string, string | undefined>>; kinds: readonly MarkKind[]; unit?: readonly [string, string]; className?: string }) {
  const counts = countMarks(marks);
  const used = kinds.filter((k) => counts[k.key]);
  if (!used.length) return <p className={cn("type-caption text-muted-foreground", className)}>Nothing marked yet.</p>;
  return (
    <ul aria-label="Marked" className={cn("flex flex-wrap gap-x-4 gap-y-1 type-body-sm", className)}>
      {used.map((k) => {
        const Icon = k.icon;
        return (
          <li key={k.key} className="inline-flex items-center gap-1.5">
            {Icon && <Icon aria-hidden className="size-4" />}
            <span className="tabular-nums">{format.count(counts[k.key]!, unit[0], unit[1])}</span> {k.label.toLowerCase()}
          </li>
        );
      })}
    </ul>
  );
}

export type MarkableTextProps = {
  /** Names the region: "Transcript, for marking". Required. */
  label: string;
  /** Every markable id in document order, including those in rows not mounted now. */
  ids: readonly string[];
  /** The mark on each id (a kind's `key`); ids with none are unmarked. */
  marks: Readonly<Record<string, string | undefined>>;
  kinds: readonly MarkKind[];
  /** Apply a kind (or `null` to clear) to the selected ids. The app stores it. */
  onMark: (ids: readonly string[], kind: string | null) => void;
  /** Chords that clear the selection's marks: `["w"]`. */
  clearKeys?: string[];
  /** The caret moved to this id (so a virtualised list can scroll it into view). */
  onCaretChange?: (id: string) => void;
  /** What one id is called in counts: `["word", "words"]`. */
  unit?: readonly [string, string];
  /** Show the summary line under the text. Default true. */
  summary?: boolean;
  /** The text, with `<Mark id>` elements. */
  children: React.ReactNode;
  className?: string;
};

/** Selects ids over `<Mark>` words by drag, Shift+click and Shift+arrows (a run in the app's order, so it holds across virtualised rows), offers the app's marks as chorded commands in a bar, says each change in words, and lists what is marked. */
export function MarkableText({ label, ids, marks, kinds, onMark, clearKeys = [], onCaretChange, unit = ["word", "words"], summary = true, children, className }: MarkableTextProps) {
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const [caret, setCaret] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");
  const dragging = React.useRef(false);
  const hintId = React.useId();
  const run = React.useMemo(() => rangeBetween(ids, anchor, caret), [ids, anchor, caret]);
  const selected = React.useMemo(() => new Set(run), [run]);
  const n = run.length;
  const counted = (k: number) => format.count(k, unit[0], unit[1]);

  const moveCaret = (id: string | null, extend: boolean) => {
    if (id === null) return;
    setCaret(id);
    if (!extend || anchor === null) setAnchor(id);
    onCaretChange?.(id);
  };
  const apply = (kind: string | null) => {
    if (!n) return;
    onMark(run, kind);
    const k = kinds.find((x) => x.key === kind);
    setSaid(kind === null ? `${counted(n)} cleared` : `${counted(n)} marked ${k?.label.toLowerCase() ?? kind}`);
  };

  const commands: Command[] = [
    ...kinds.map((k): Command => ({ id: `mark-${k.key}`, label: k.label, keys: k.keys, icon: k.icon, disabled: n ? false : "Select words first", run: () => apply(k.key) })),
    { id: "mark-clear", label: "Clear mark", keys: clearKeys, disabled: n ? false : "Select words first", run: () => apply(null) },
  ];
  useCommands(commands);

  React.useEffect(() => {
    const stop = () => (dragging.current = false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const ctx: Ctx = {
    kinds, marks, selected, caret,
    press: (e, id) => {
      if (e.button !== 0) return;
      dragging.current = true;
      if (e.shiftKey && anchor !== null) setCaret(id);
      else {
        setAnchor(id);
        setCaret(id);
      }
      onCaretChange?.(id);
      setSaid("");
    },
    over: (id) => {
      if (dragging.current && id !== caret) setCaret(id);
    },
  };

  // Say the selection when it changes by key or pointer; the word when the caret moves alone.
  React.useEffect(() => {
    if (n > 1) setSaid(`${counted(n)} selected`);
    else if (n === 1 && caret) setSaid(`${document.querySelector(`[data-mark-id="${CSS.escape(caret)}"]`)?.textContent ?? caret}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, caret]);

  const keys = (e: React.KeyboardEvent) => {
    // Keys from something focused inside (a transcript's list of rows) are that thing's own.
    if (e.target !== e.currentTarget) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const to = e.key === "ArrowRight" ? stepId(ids, caret, 1) : e.key === "ArrowLeft" ? stepId(ids, caret, -1) : e.key === "Home" ? ids[0] ?? null : e.key === "End" ? ids[ids.length - 1] ?? null : undefined;
    if (to !== undefined) {
      e.preventDefault();
      moveCaret(to, e.shiftKey);
    } else if (e.key === "Escape" && (anchor !== null || caret !== null)) {
      e.preventDefault();
      setAnchor(null);
      setCaret(null);
      setSaid("Selection cleared");
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {n > 0 && (
        <Toolbar label="Marks" className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-surface border border-border bg-background p-1.5">
          <span className="px-1 type-label tabular-nums">{counted(n)} selected</span>
          {kinds.map((k) => {
            const Icon = k.icon;
            return (
              <Button key={k.key} size="sm" onPress={() => apply(k.key)}>
                {Icon && <Icon />} {k.label}
              </Button>
            );
          })}
          <Button size="sm" variant="ghost" onPress={() => apply(null)}>Clear mark</Button>
          <Button size="sm" variant="ghost" onPress={() => { setAnchor(null); setCaret(null); }}>Deselect</Button>
        </Toolbar>
      )}
      <MarksContext.Provider value={ctx}>
        <div
          role="group"
          aria-label={label}
          aria-describedby={hintId}
          tabIndex={0}
          onKeyDown={keys}
          className="select-none rounded-surface outline-offset-2"
        >
          {children}
        </div>
      </MarksContext.Provider>
      <p id={hintId} className="type-caption text-muted-foreground">
        Drag across words, or Shift+click, to select. Left and Right move; Shift and arrows select; Escape clears.
      </p>
      <CommandLegend commands={commands} label="Mark keys" />
      {summary && <MarkSummary marks={marks} kinds={kinds} unit={unit} />}
      <div role="status" aria-live="polite" className="sr-only">{said}</div>
    </div>
  );
}

