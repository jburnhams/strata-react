import * as React from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Field, Input } from "./field";
import { Status } from "./status";
import { VirtualList } from "./virtual-list";

// A command console: a log above one command line (issue #369, moved from the Quake 2 explorer's
// `Console.tsx`). A game needs it (cvars, commands) and so does any tool with a scripting or admin
// surface: a server's console, a dev panel. Parts and the reasons for them:
//
// - **The log is a `log` live region, polite**, so a burst of lines is read as it comes and never
//   interrupts what the person is typing. It is `VirtualList` (React Aria's `GridList` in its
//   `Virtualizer`) from 100 lines, so a long session stays fast and its rows keep their place; below
//   that it is the same grid in the page's flow. Lines are plain text rows with a level.
// - **Level is a word as well as a tone**: `warning` and `error` lines start with a `Status` ("Warning",
//   "Error"), so no level rests on colour; an `echo` line is the command the person ran, drawn with a
//   prompt mark, so a command and its output read in order. The console draws what it is given: the
//   app appends the echo (it knows what ran) in its `onCommand`.
// - **Pinned to the bottom unless the person scrolled up.** A new line follows only while the log is
//   at its end; once the person scrolls up to read, it stays, and a "Latest" button says there are newer
//   lines and takes them back.
// - **The command line is a `Field`'s `Input` with a `Run` button as its action** (the one-field form the
//   rest of Strata draws), so it has a label, a hint place and the same sizes. Enter runs; Up and Down
//   walk the history; Tab completes. History is kept under `historyKey` in localStorage (try/catch:
//   storage throws in private windows), newest last, the last 100, a repeat of the previous command not
//   stored twice.
// - **Completion is the app's**: `complete(text)` returns the whole inputs that could follow what has been
//   typed (`["map e1m1", "map e1m2"]`). One match fills the line; several fill their common start and are
//   listed under the line, said politely, so Tab on `ma` is never a silent no-op.
// A key that opens the console (`` ` `` in a game) is the app's `useHotkeys`; focus goes to the line from
// the `ref` it takes. Checked for React Aria first: there is no console or terminal part; the log is its
// `GridList` and the line its `Input` inside our `Field`.

/** The kind of a console line: output (`info`), a `warning` or `error`, or the `echo` of a command that ran. */
export type ConsoleLevel = "info" | "warning" | "error" | "echo";

/** One line of the log. */
export type ConsoleLine = {
  /** Unique and stable: the row's key. A counter will do. */
  id: string | number;
  text: string;
  /** Default `info`. */
  level?: ConsoleLevel;
};

export type ConsoleProps = {
  /** Names the console: "Game console". The log and the command line are named from it. */
  label: string;
  /** The log, oldest first. */
  lines: readonly ConsoleLine[];
  /** A command was entered (Enter or Run), trimmed and not empty. The line clears. Append its echo and output to `lines`. */
  onCommand: (text: string) => void;
  /** The whole inputs that could follow what is typed, for Tab. Not given: Tab moves on as it does anywhere. */
  complete?: (text: string) => readonly string[];
  /** Where the history of commands is kept (localStorage). Not given: kept for this visit only. */
  historyKey?: string;
  /** The tallest the log may be, in px, before it scrolls. Default 320. */
  height?: number;
  /** Every line is exactly this tall (px) and does not wrap (a long line is cut with an ellipsis, whole in its title): nothing is measured, which is faster for a long log and what a test DOM, which does no layout, needs. Default: lines wrap and are measured. */
  lineHeight?: number;
  /** The command line's label. Default "Command". */
  commandLabel?: string;
  /** The input, for moving focus to it when the console opens. */
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
};

const HISTORY_MAX = 100;
const LEVEL_WORD: Partial<Record<ConsoleLevel, { word: string; tone: "warning" | "danger" }>> = {
  warning: { word: "Warning", tone: "warning" },
  error: { word: "Error", tone: "danger" },
};

const lineKey = (line: ConsoleLine) => String(line.id);

function readHistory(key: string | undefined): string[] {
  if (!key) return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string").slice(-HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

/** The longest start every string shares. */
function commonStart(items: readonly string[]): string {
  if (items.length === 0) return "";
  let prefix = items[0]!;
  for (const item of items) while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

/** A command console: a polite, virtualised log pinned to its end, above a command line with history (Up, Down) and Tab completion from the app's list. */
export function Console({ label, lines, onCommand, complete, historyKey, height = 320, lineHeight, commandLabel = "Command", inputRef, className }: ConsoleProps) {
  const [text, setText] = React.useState("");
  const history = React.useRef<string[]>(readHistory(historyKey));
  const [cursor, setCursor] = React.useState<number | null>(null); // index into history while walking it
  const draft = React.useRef("");
  const [matches, setMatches] = React.useState<readonly string[]>([]);

  // Pinned to the end unless the person scrolled up.
  const box = React.useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = React.useState(true);
  const scroller = () => box.current?.querySelector<HTMLElement>("[data-strata-scroll]") ?? null;
  const toEnd = React.useCallback(() => {
    const el = scroller();
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  React.useEffect(() => {
    const el = scroller();
    if (!el) return;
    const onScroll = () => setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  });
  React.useLayoutEffect(() => {
    if (pinned) toEnd();
    // Rows are measured after they draw, so the end moves once more.
    const frame = requestAnimationFrame(() => pinned && toEnd());
    return () => cancelAnimationFrame(frame);
  }, [lines, pinned, toEnd]);

  const run = () => {
    const command = text.trim();
    if (!command) return;
    if (history.current[history.current.length - 1] !== command) history.current = [...history.current, command].slice(-HISTORY_MAX);
    if (historyKey) {
      try {
        window.localStorage.setItem(historyKey, JSON.stringify(history.current));
      } catch {
        // Not remembered; it still works for this visit.
      }
    }
    setText("");
    setCursor(null);
    setMatches([]);
    setPinned(true);
    onCommand(command);
  };

  const walk = (direction: -1 | 1) => {
    const past = history.current;
    if (past.length === 0) return;
    if (cursor === null) {
      if (direction === 1) return;
      draft.current = text;
      setCursor(past.length - 1);
      setText(past[past.length - 1]!);
      return;
    }
    const next = cursor + direction;
    if (next < 0) return;
    if (next >= past.length) {
      setCursor(null);
      setText(draft.current);
    } else {
      setCursor(next);
      setText(past[next]!);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      walk(e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Tab" && complete && !e.shiftKey && text.length > 0) {
      const found = complete(text);
      if (found.length === 0) return; // nothing to complete: Tab moves on
      e.preventDefault();
      const start = commonStart(found);
      if (start.length > text.length) setText(start);
      setMatches(found.length > 1 ? found : []);
    } else if (e.key === "Escape") {
      setMatches([]);
    }
  };

  return (
    <section aria-label={label} className={cn("grid min-w-0 gap-2", className)}>
      <div ref={box} role="log" aria-live="polite" aria-relevant="additions" aria-label={`${label}: log`} className="relative min-w-0 rounded-control border border-border bg-surface-sunken">
        <VirtualList
          label={`${label} lines`}
          items={lines as ConsoleLine[]}
          itemKey={lineKey}
          height={height}
          bounded
          estimateSize={24}
          rowHeight={lineHeight}
        >
          {(line) => {
            const word = LEVEL_WORD[line.level ?? "info"];
            return (
              <div className={cn("flex min-w-0 items-start gap-2 px-3 py-0.5 font-mono type-body-sm", line.level === "echo" && "text-muted-foreground")}>
                {word ? <Status tone={word.tone}>{word.word}</Status> : line.level === "echo" ? <span aria-hidden>›</span> : null}
                {line.level === "echo" && <span className="sr-only">Command: </span>}
                <span title={lineHeight ? line.text : undefined} className={cn("min-w-0 flex-1", lineHeight ? "truncate" : "break-words whitespace-pre-wrap")}>{line.text}</span>
              </div>
            );
          }}
        </VirtualList>
        {lines.length === 0 && <p className="px-3 py-2 type-body-sm text-muted-foreground">Nothing has been written yet.</p>}
        {!pinned && (
          <Button size="sm" variant="outline" onPress={() => { setPinned(true); toEnd(); }} className="absolute bottom-2 left-1/2 -translate-x-1/2 shadow-overlay">
            <ArrowDown /> Latest
          </Button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Field label={commandLabel} action={<Button type="submit">Run</Button>}>
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCursor(null);
              setMatches([]);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
      </form>
      <p role="status" className={cn("type-caption text-muted-foreground", matches.length === 0 && "sr-only")}>
        {matches.length > 0 ? `${matches.length} matches: ${matches.join(", ")}` : ""}
      </p>
    </section>
  );
}
