import * as React from "react";
import { ArrowDown, Send, Square } from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { parseRichText, plainText, type Block, type EntityMatcher, type Inline } from "../lib/rich-text";
import { Button } from "./button";
import { Disclosure } from "./disclosure";
import { Textarea } from "./field";

// A question-and-answer thread: turns, a composer, and answers with a little rich text whose ids
// are buttons. Issue #192, from strata-360's Ask page. Parts: `RichText` (a safe subset, no HTML),
// `Conversation` (the log), `Composer` (the box).
//
// What the log announces. A streaming answer grows token by token, and a screen reader reading
// each one would be unusable, so the log is not a live region itself. A separate polite region
// says one sentence when an answer finishes ("Answer finished: …", its first words), or that it
// failed. The turns are `article`s in a labelled region, so the reading order is the thread.
//
// Scrolling. The log follows a growing answer only while the person is at the bottom (within a
// few pixels); once they scroll up to read, it stays where they are and a "Jump to latest"
// button appears, which returns them and resumes following. Their own message always scrolls
// into view, as they have just written it.
//
// A failed answer says what happened in the app's words (`error`) and has Try again in place, on
// the turn that failed, so a retry never makes a second turn. States are in the type: a turn is
// `streaming`, `done` or `failed`, and `failed` cannot be written without its sentence.
//
// The composer: Enter sends, Shift+Enter is a new line, and Enter during an IME composition does
// neither. While an answer is on its way the text box is disabled with the reason written under
// it (not just greyed), and the send button becomes Stop. Suggested questions are buttons that
// send. Send is the view's one filled button.

const LINK = "text-primary underline underline-offset-2 hover:no-underline";

function renderInline(nodes: readonly Inline[], onOpen: ((id: string) => void) | undefined, keyBase = ""): React.ReactNode {
  return nodes.map((n, i) => {
    const key = `${keyBase}${i}`;
    switch (n.type) {
      case "text":
        return <React.Fragment key={key}>{n.text}</React.Fragment>;
      case "bold":
        return <strong key={key} className="font-semibold">{renderInline(n.children, onOpen, `${key}.`)}</strong>;
      case "code":
        return <code key={key} className="rounded-control bg-muted px-1 py-0.5 font-mono type-caption">{n.text}</code>;
      case "link":
        return (
          <a key={key} href={n.href} target="_blank" rel="noopener noreferrer" className={LINK}>
            {renderInline(n.children, onOpen, `${key}.`)}
          </a>
        );
      case "entity":
        return onOpen ? (
          <button key={key} type="button" onClick={() => onOpen(n.id)} className={cn(LINK, "cursor-pointer font-mono type-caption")}>
            {n.text}
          </button>
        ) : (
          <code key={key} className="font-mono type-caption">{n.text}</code>
        );
    }
  });
}

function renderBlocks(blocks: readonly Block[], onOpen: ((id: string) => void) | undefined): React.ReactNode {
  return blocks.map((b, i) =>
    b.type === "paragraph" ? (
      <p key={i}>{renderInline(b.children, onOpen)}</p>
    ) : b.ordered ? (
      <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{renderInline(it, onOpen)}</li>)}</ol>
    ) : (
      <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}>{renderInline(it, onOpen)}</li>)}</ul>
    ),
  );
}

export type RichTextProps = {
  /** The text, in the small subset: paragraphs, `- ` and `1. ` lists, **bold**, `code`, [links](https://…). */
  children: string;
  /** Ids that become buttons: a list (longest first, whole words only) or a function reporting matches. */
  entities?: EntityMatcher;
  /** Called with the id when an entity button is pressed. Without it, an id is drawn as code. */
  onOpen?: (id: string) => void;
  className?: string;
};

/** Draws a small safe subset of text (bold, code, lists, http links) and turns known ids into buttons. Never HTML: whatever the string holds is shown as text. */
export function RichText({ children, entities, onOpen, className }: RichTextProps) {
  const blocks = React.useMemo(() => parseRichText(children, entities), [children, entities]);
  return <div className={cn("space-y-2 break-words type-body", className)}>{renderBlocks(blocks, onOpen)}</div>;
}

/** One turn of the thread. `failed` cannot be written without the sentence saying what happened. */
export type ConversationTurn = { id: string; role: "person" | "answer"; time: Date | string | number; text: string; lookedUp?: React.ReactNode } & (
  | { state?: "done" }
  | { state: "streaming" }
  | { state: "failed"; error: string }
);

export type ConversationProps = {
  /** Names the thread for assistive technology: "Questions about the kiln". */
  label: string;
  turns: readonly ConversationTurn[];
  /** Who the answers come from, shown on each: "Assistant". */
  answerName: string;
  /** What a person is called in their own turns: "You". */
  personName?: string;
  entities?: EntityMatcher;
  /** An id in an answer was pressed. */
  onOpen?: (id: string) => void;
  /** Try again on a failed answer; the turn is replaced in place. */
  onRetry: (turnId: string) => void;
  /** Shown while there are no turns: the app's invitation, with the suggested questions if it likes. */
  empty: React.ReactNode;
  /** What the "what it looked up" disclosure is called. */
  lookedUpLabel?: string;
  className?: string;
};

const NEAR_BOTTOM = 24;

/** A thread of turns: answers stream, finish or fail in place; the log follows only while the person is at the bottom (with Jump to latest), and a finished answer is announced once, politely. */
export function Conversation({ label, turns, answerName, personName = "You", entities, onOpen, onRetry, empty, lookedUpLabel = "What it looked up", className }: ConversationProps) {
  const box = React.useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const following = React.useRef(true);
  const [announcement, setAnnouncement] = React.useState("");
  const last = turns[turns.length - 1];

  const toBottom = React.useCallback(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
    setAtBottom(true);
  }, []);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM;
    following.current = near;
    setAtBottom(near);
  };

  // Follow growth only while at the bottom; a person's own new turn always scrolls.
  React.useLayoutEffect(() => {
    if (last?.role === "person" || following.current) toBottom();
  }, [turns.length, last?.text, last?.state, last?.role, toBottom]);

  // One polite sentence when an answer ends, never per token.
  const states = React.useRef(new Map<string, string | undefined>());
  React.useEffect(() => {
    for (const t of turns) {
      const before = states.current.get(t.id);
      if (t.role === "answer" && before === "streaming" && t.state !== "streaming") {
        setAnnouncement(t.state === "failed" ? `${answerName} could not answer: ${t.error}` : `${answerName} answered: ${plainText(t.text).slice(0, 160)}`);
      }
      states.current.set(t.id, t.state ?? "done");
    }
  }, [turns, answerName]);

  return (
    <div className={cn("relative flex min-h-0 flex-col", className)}>
      <div role="region" aria-label={label} ref={box} onScroll={onScroll} tabIndex={0} className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-surface p-1">
        {turns.length === 0 ? (
          empty
        ) : (
          turns.map((t) => (
            <article key={t.id} aria-label={`${t.role === "person" ? personName : answerName}, ${format.clock(t.time)}`} aria-busy={t.state === "streaming"} className={cn("flex flex-col gap-1", t.role === "person" && "items-end")}>
              <header className="flex items-baseline gap-2 type-caption text-muted-foreground">
                <span className="type-label text-foreground">{t.role === "person" ? personName : answerName}</span>
                <time dateTime={new Date(t.time).toISOString()}>{format.clock(t.time)}</time>
              </header>
              <div className={cn("max-w-prose rounded-surface px-3 py-2", t.role === "person" ? "bg-muted" : "border border-border")}>
                {t.state === "streaming" && !t.text ? (
                  <p className="type-body-sm text-muted-foreground">{answerName} is working on it…</p>
                ) : (
                  <RichText entities={entities} onOpen={onOpen}>{t.text}</RichText>
                )}
                {t.state === "streaming" && t.text && <p className="mt-1 type-caption text-muted-foreground">Still writing…</p>}
                {t.state === "failed" && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 type-body-sm text-danger">
                    <span>{t.error}</span>
                    <Button size="sm" onClick={() => onRetry(t.id)}>Try again</Button>
                  </div>
                )}
              </div>
              {t.lookedUp && t.state !== "streaming" && (
                <Disclosure summary={lookedUpLabel} className="max-w-prose type-body-sm">{t.lookedUp}</Disclosure>
              )}
            </article>
          ))
        )}
      </div>
      {!atBottom && (
        <Button size="sm" variant="outline" onClick={toBottom} className="absolute bottom-2 left-1/2 -translate-x-1/2 shadow-overlay">
          <ArrowDown /> Jump to latest
        </Button>
      )}
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
    </div>
  );
}

export type ComposerProps = {
  /** Names the box: "Ask about the kiln". */
  label: string;
  /** Called with the trimmed text on Enter or the send button; the box then clears. */
  onSend: (text: string) => void;
  /** An answer is on its way: the box is disabled, with `answeringReason` under it, and send becomes Stop. */
  answering?: boolean;
  /** Stops the answer in progress. Required, so a long answer can always be cut short. */
  onStop: () => void;
  /** Why the box is disabled while answering, in the app's words: "Waiting for the answer." */
  answeringReason: string;
  /** Questions to start from; each is a button that sends. */
  suggestions?: readonly string[];
  sendLabel?: string;
  className?: string;
};

/** The box a question is typed in: Enter sends, Shift+Enter is a new line, disabled with its reason while answering (and Stop), suggestions as buttons. */
export function Composer({ label, onSend, answering = false, onStop, answeringReason, suggestions, sendLabel = "Send", className }: ComposerProps) {
  const [text, setText] = React.useState("");
  const reasonId = React.useId();
  const send = (value: string) => {
    const v = value.trim();
    if (!v || answering) return;
    onSend(v);
    setText("");
  };
  return (
    <div className={cn("space-y-2", className)}>
      {suggestions && suggestions.length > 0 && !answering && (
        <div role="group" aria-label="Suggested questions" className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button key={s} size="sm" onClick={() => send(s)}>{s}</Button>
          ))}
        </div>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Textarea
          aria-label={label}
          aria-describedby={answering ? reasonId : undefined}
          rows={2}
          value={text}
          disabled={answering}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          className="min-h-0 flex-1 resize-none"
        />
        {answering ? (
          <Button onClick={onStop}><Square /> Stop</Button>
        ) : (
          <Button type="submit" variant="default" disabled={!text.trim()}><Send /> {sendLabel}</Button>
        )}
      </form>
      {answering && <p id={reasonId} className="type-caption text-muted-foreground">{answeringReason}</p>}
    </div>
  );
}
