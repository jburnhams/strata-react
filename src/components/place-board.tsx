import * as React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { pictureInTile, useBeckon } from "../lib/beckon";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Status } from "./status";

// Answering by putting pictures in places: "Put 4 apples in the basket", "Put the numbers in
// order", "Match each capital to its small letter", "Sort the pictures by their first sound".
// Flashtap's placing rounds (give-N, sequence, match pairs, sort), Jonathan 2026-11-22: "add
// components to strata react as needed". `ChoiceGrid` answers one question with one tap and closes;
// here an answer is an arrangement, built up and changed freely until the app checks it.
//
// Three gestures, one model (Flashtap's owner, 2026-11-28: drag as well as taps, "picked up" far more of a visual
// clue, one tap for a single basket, and nothing moving round during the round):
// - Two taps: tap a piece to pick it up, tap a place to put it there. Tap the piece again to put it down where it
//   was; a placed piece that is picked up can be put back by tapping the gap it left in the pile ("Put 5 back").
//   The same two presses work by touch, mouse, keyboard (Tab, Enter or Space) and screen reader. A place with a
//   `limit` that is full still takes a piece: the one there goes back to the pile (the owner, 2026-11-28: in an
//   order, "allow an item to be placed on top of an existing one which then automatically puts back the one
//   currently there"), and the place's name says so ("Put 9 in second in place of 4").
// - One tap, when there is only one place (give a number: "Put 4 apples in the basket"): there is nowhere else to
//   put a piece, so picking it up first is a step for nothing. A tap in the pile puts it in the place, a tap on a
//   placed piece takes it out again (a big X over it on hover says so), and each is named for what it does.
// - Drag, by pointer: press a piece and move it, and it follows the finger or mouse until it is let go over a place
//   (or the pile, to put it back). Nothing to learn for a child who drags, nothing in the way of one who taps.
//
// React Aria first, checked rather than assumed: its drag and drop (`useDrag`, `DropZone`, `useDragAndDrop`) is the
// HTML drag events (react-aria `dnd/useDrag.mjs` sets `draggable: 'true'` and starts in `onDragStart`), which a touch
// screen starts only after a long press (iPad Safari, Android Chrome), and a plain tap never enters a "holding" state.
// A child presses and moves at once, so the drag is ours: pointer events from the press, a copy of the piece under
// the pointer (portalled, so no ancestor clips it), and the place under it found from the places' rectangles (no
// `elementFromPoint`, which jsdom lacks). The controls are still React Aria's: each piece a `ToggleButton`
// (`aria-pressed` while held), or a `Button` when one tap places it, each place a `Button`. A drag is the pointer's
// path only; keyboard and screen reader keep the taps. A piece takes `touch-action: none` while it can move, so a
// drag on a touch screen moves the piece, not the page.
//
// Picked up is blue, the info role, so it is neutral (it says nothing about right or wrong): the held piece gets a
// thick info ring and tint and its word, and every place that would take it the same ring, so the eye goes from one
// to the other; the place under a dragged piece is tinted too. Rings, not wider borders, so nothing moves by a pixel.
//
// Nothing moves round while the learner works: the pile keeps a slot for every piece in its order, and a piece that
// is out of it leaves an empty dashed gap of its size, so the pile's rows, sizes and order are the same from the first
// tap to the check; each place keeps room for a row of placed pieces from the start, so a place that holds one (order,
// match) does not grow when it is filled. `beckon` pulses the pile's pieces one at a time while none is held, and
// `stretch` shares the rows out, as on ChoiceGrid (`src/lib/beckon.ts`). A piece's picture is capped at 75% of the
// piece, so an app that grows the picture step on a wide screen cannot push it out.
//
// Places are disabled while nothing is held, so the Tab order is the pieces until one is picked
// up, then the places that can take it; a place's name then says what will happen ("Put apple in
// the basket"). After a move, focus follows the piece to where it went, so a keyboard user carries
// on from there. The board never decides anything: `placement` and `onMove` are the app's (it may
// refuse, swap a full place's piece back to the pile, or count), and so is the check: `check` draws its button,
// big (`Button size="lg"`, a tick either side of the word) and under the places, while the board is not locked. After
// one, `placeState` marks a place `right` or `wrong` with its word (`marks`, required, so a state is
// never colour alone); wrong is neutral, never red (Flashtap's spec, §17: a mistake is not
// punished). `locked` ends the round: nothing moves.
//
// Sizes are for small fingers, as `ChoiceGrid`: pieces at least 96px square (a place holds several,
// so they are a step smaller than a choice tile but twice the 44px minimum; 72px once placed), places
// at least 160px wide with a 120px target. Pictures use `type-picture`.

/** A place after the app has checked the arrangement: not checked, or right or wrong. */
export type PlaceState = "open" | "right" | "wrong";

/** Props of `PlaceBoard`. */
export type PlaceBoardProps<P, S> = {
  /** Names the board: the question ("Put the numbers in order"). */
  label: string;
  pieces: P[];
  pieceKey: (piece: P) => string;
  /** What a piece is, for its name ("apple", "5"). Never drawn: the picture is the piece. */
  pieceLabel: (piece: P) => string;
  /** The piece's picture: an emoji, a numeral or an `<img alt="">`. */
  renderPiece: (piece: P) => React.ReactNode;
  places: S[];
  placeKey: (place: S) => string;
  /** The place's name ("the basket", "first", "A"), used in "Put apple in the basket". */
  placeLabel: (place: S) => string;
  /** What the place shows as its target. Default: `placeLabel` as text. */
  renderPlace?: (place: S) => React.ReactNode;
  /** Where each piece is: piece key to place key. A piece with no entry is in the pile. */
  placement: Readonly<Record<string, string | undefined>>;
  /** The learner asked to move a piece to a place, or back to the pile (`null`). The app applies it, or not. */
  onMove: (pieceKey: string, placeKey: string | null) => void;
  /** Names the pile of pieces not yet placed ("Apples", "Numbers"). */
  pileLabel: string;
  /** Each place's state after the app checked the arrangement. Default: every place `open`. */
  placeState?: (place: S) => PlaceState;
  /** Words for the states: `{ held: "Picked up", right: "Right", wrong: "Not yet" }`. */
  marks: { held: string; right: string; wrong: string };
  /** The round is over: no piece can be picked up. */
  locked?: boolean;
  /** Share each row out between the pieces and places there are (as ChoiceGrid's `stretch`), so a few fill a wide screen. */
  stretch?: boolean;
  /** Pulse the pieces in the pile one at a time in a random order, every `beckonMs`, while none is held and the board is not locked. */
  beckon?: boolean;
  /** Time between pulses while `beckon`; default 1600. */
  beckonMs?: number;
  /** How many pieces a place holds at most (an order's slot: 1). A piece put in a full place sends the one there back to the pile, so a learner can put a piece on top of another instead of moving that one out first. Default: no limit. */
  limit?: (place: S) => number;
  /** The app's check, drawn as the board's big button under the places while it is not locked ("Check", with a tick either side). */
  check?: { label: string; onCheck: () => void; disabled?: boolean };
  className?: string;
};

const pieceSide = 96;
const placedSide = 72;
// The picture step's own override (strata.css), so a placed numeral keeps its face at a size that fits 72px.
const placedPicture = { "--type-picture-size": "2.5rem" } as React.CSSProperties;
const placeSide = 160;

/** Pictures put into places for an answer that is an arrangement (give a number, order, match, sort): two taps (pick up, put down), one tap when there is one place, or a drag. The app owns where each piece is and checks it; the board only moves what the learner asks, and keeps every piece's slot so nothing shifts. */
export function PlaceBoard<P, S>({
  label,
  pieces,
  pieceKey,
  pieceLabel,
  renderPiece,
  places,
  placeKey,
  placeLabel,
  renderPlace,
  placement,
  onMove,
  pileLabel,
  placeState = () => "open",
  marks,
  locked = false,
  stretch = false,
  beckon = false,
  beckonMs = 1600,
  check,
  limit,
  className,
}: PlaceBoardProps<P, S>) {
  const fill = stretch ? "auto-fit" : "auto-fill";
  const [heldKey, setHeld] = React.useState<string | null>(null);
  // The piece to focus once it has moved: its button is a new element in its new area.
  const [follow, setFollow] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const buttons = React.useRef(new Map<string, HTMLElement>());
  // Where a dragged piece can be let go: each place by its key, and the pile.
  const zones = React.useRef(new Map<string, HTMLElement>());
  // Set once a press has become a drag, until the click the browser sends after it, so letting go over the piece
  // itself does not also pick it up or place it.
  const dragged = React.useRef(false);
  const stopDrag = React.useRef<(() => void) | null>(null);
  const placeKeys = new Set(places.map(placeKey));
  const where = (p: P) => {
    const at = placement[pieceKey(p)];
    return at !== undefined && placeKeys.has(at) ? at : null;
  };
  // One place: a tap moves at once (in or out), with nothing held in between.
  const only = places.length === 1 ? places[0] : undefined;
  const held = locked ? undefined : pieces.find((p) => pieceKey(p) === heldKey);
  const heldAt = held === undefined ? null : where(held);
  // Only the pile beckons, and only while nothing is in hand: once a piece is picked up, the places are what to press.
  const lit = useBeckon(
    beckon && !locked && held === undefined,
    pieces.filter((p) => where(p) === null).map(pieceKey),
    beckonMs,
  );

  React.useEffect(() => {
    if (follow === null) return;
    buttons.current.get(follow)?.focus();
    setFollow(null);
  }, [follow]);
  React.useEffect(() => () => stopDrag.current?.(), []);
  React.useEffect(() => {
    if (locked) stopDrag.current?.();
  }, [locked]);

  // What a full place gives back when a piece goes in: the first piece there, back to the pile.
  const bumped = (key: string, to: string): P | undefined => {
    const s = places.find((q) => placeKey(q) === to);
    const max = s === undefined || limit === undefined ? Infinity : limit(s);
    const there = pieces.filter((p) => pieceKey(p) !== key && where(p) === to);
    return there.length >= max ? there[0] : undefined;
  };
  const send = (key: string, to: string | null) => {
    setHeld(null);
    const out = to === null ? undefined : bumped(key, to);
    if (out !== undefined) onMove(pieceKey(out), null);
    onMove(key, to);
    setFollow(key);
  };
  const move = (to: string | null) => {
    if (held !== undefined) send(pieceKey(held), to);
  };
  // The drag's handlers live past this render, so they read the board as it is when they run.
  const latest = React.useRef({ send, placement, placeKeys });
  latest.current = { send, placement, placeKeys };

  const hit = (x: number, y: number): string | undefined => {
    for (const [key, el] of zones.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return undefined;
  };

  const press = (key: string) => (e: React.PointerEvent<HTMLElement>) => {
    if (locked || e.button !== 0 || !e.isPrimary) return;
    stopDrag.current?.();
    const el = e.currentTarget;
    const { clientX: x0, clientY: y0, pointerId } = e;
    let size: { w: number; h: number } | null = null;
    const moved = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (size === null) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START) return;
        const r = el.getBoundingClientRect();
        size = { w: r.width, h: r.height };
        dragged.current = true;
        setHeld(key);
      }
      ev.preventDefault();
      setDrag({ key, x: ev.clientX, y: ev.clientY, ...size, over: hit(ev.clientX, ev.clientY) });
    };
    const ended = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      if (size === null) return;
      const over = ev.type === "pointerup" ? hit(ev.clientX, ev.clientY) : undefined;
      const { send, placement, placeKeys } = latest.current;
      const raw = placement[key];
      const at = raw !== undefined && placeKeys.has(raw) ? raw : null;
      const to = over === PILE ? null : over;
      if (to !== undefined && to !== at) send(key, to);
      else setHeld(null);
      // The click that follows this pointerup, if any, comes before a timer does.
      setTimeout(() => {
        dragged.current = false;
      }, 0);
    };
    const stop = () => {
      window.removeEventListener("pointermove", moved);
      window.removeEventListener("pointerup", ended);
      window.removeEventListener("pointercancel", ended);
      stopDrag.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", moved);
    window.addEventListener("pointerup", ended);
    window.addEventListener("pointercancel", ended);
    stopDrag.current = stop;
  };

  const zone = (key: string) => (el: HTMLElement | null) => {
    if (el) zones.current.set(key, el);
    else zones.current.delete(key);
  };
  const ref = (key: string) => (el: HTMLElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  const pieceClass = (key: string) =>
    cn(
      "@container relative flex aspect-square w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-overlay border-2 border-border bg-card p-1 text-card-foreground select-none outline-offset-2 transition-state press",
      "hover:border-primary disabled:cursor-default disabled:hover:border-border",
      "selected:border-info selected:bg-info-subtle selected:ring-4 selected:ring-info",
      key === lit?.key && cn(lit.className, "border-primary"),
    );
  const picture = (p: P, placed: boolean) => (
    <span aria-hidden className="type-picture" style={placed ? { ...placedPicture, ...pictureInTile } : pictureInTile}>
      {renderPiece(p)}
    </span>
  );

  const piece = (p: P, placed: boolean) => {
    const key = pieceKey(p);
    const isHeld = held !== undefined && pieceKey(held) === key;
    const name = pieceLabel(p);
    const control =
      only !== undefined ? (
        <AriaButton
          ref={ref(key)}
          isDisabled={locked}
          onPress={() => {
            if (!dragged.current) send(key, placed ? null : placeKey(only));
          }}
          aria-label={placed ? `Take ${name} out of ${placeLabel(only)}` : `Put ${name} in ${placeLabel(only)}`}
          data-beckon={key === lit?.key || undefined}
          className={cn(pieceClass(key), "group", isHeld && "border-info bg-info-subtle ring-4 ring-info")}
        >
          {picture(p, placed)}
          {placed && !locked && (
            // The way out, drawn on hover and keyboard focus: the name already says it, so it is hidden from a reader.
            <span
              aria-hidden
              data-remove
              className="absolute inset-0 flex items-center justify-center rounded-overlay bg-background/70 text-foreground opacity-0 transition-state group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <X className="size-3/4" strokeWidth={3} />
            </span>
          )}
        </AriaButton>
      ) : (
        <ToggleButton
          ref={ref(key)}
          isSelected={isHeld}
          onChange={(on) => {
            if (!dragged.current) setHeld(on ? key : null);
          }}
          isDisabled={locked}
          aria-label={isHeld ? `${name}, ${marks.held.toLowerCase()}` : name}
          data-held={isHeld || undefined}
          data-beckon={key === lit?.key || undefined}
          className={pieceClass(key)}
        >
          {picture(p, placed)}
          {isHeld && (
            <Status tone="info" className="max-w-full truncate">
              {marks.held}
            </Status>
          )}
        </ToggleButton>
      );
    return (
      // The press that may become a drag is caught around the control, in the capture phase: React Aria's press
      // stops its pointer events from bubbling (usePress). The HTML drag of an image inside is refused, so it never starts a drag of its own.
      <div
        key={key}
        data-piece={key}
        onPointerDownCapture={press(key)}
        onDragStart={(e) => e.preventDefault()}
        className={cn("grid min-w-0", !locked && "touch-none", drag?.key === key && "opacity-30")}
      >
        {control}
      </div>
    );
  };

  // In the pile pieces are 96px or more; in a place, which may hold several (a basket of apples),
  // 72px, still well over the touch minimum, so a full place does not grow taller than the screen.
  const columns = (side: number, fit: string) => ({
    gridTemplateColumns: `repeat(${fit}, minmax(min(${side}px, 100%), 1fr))`,
  });

  // The pile in its first order: a piece that is out of it leaves a gap of its size, which takes it back while it is held.
  const slot = (p: P) => {
    if (where(p) === null) return piece(p, false);
    const key = pieceKey(p);
    const isHeld = held !== undefined && pieceKey(held) === key && only === undefined;
    const gap = "aspect-square min-w-0 rounded-overlay border-2 border-dashed border-border";
    return isHeld ? (
      <AriaButton
        key={key}
        onPress={() => move(null)}
        aria-label={`Put ${pieceLabel(p)} back`}
        className={cn(
          gap,
          "cursor-pointer border-solid border-info ring-4 ring-info outline-offset-2 transition-state press hover:bg-info-subtle",
        )}
      />
    ) : (
      <div key={key} aria-hidden data-gap className={gap} />
    );
  };

  const target = (over: boolean) => over && "bg-info-subtle";
  const swap = (out: P | undefined) => (out === undefined ? "" : ` in place of ${pieceLabel(out)}`);

  return (
    <section aria-label={label} className={cn("grid min-w-0 gap-6", className)}>
      <div
        ref={zone(PILE)}
        role="group"
        aria-label={pileLabel}
        className={cn(
          "grid min-w-0 gap-2 rounded-overlay transition-state",
          target(drag?.over === PILE && heldAt !== null),
        )}
        style={columns(pieceSide, fill)}
      >
        {pieces.map(slot)}
      </div>
      <div className="grid min-w-0 gap-4" style={columns(placeSide, fill)}>
        {places.map((s) => {
          const key = placeKey(s);
          const state = placeState(s);
          const name = placeLabel(s);
          const inside = pieces.filter((p) => where(p) === key);
          const takes = held !== undefined && heldAt !== key;
          return (
            <div
              key={key}
              ref={zone(key)}
              data-place={state}
              className={cn(
                "grid min-w-0 content-start gap-2 rounded-overlay border-2 border-dashed border-input p-2 transition-state",
                takes && "border-solid border-info ring-4 ring-info",
                takes && target(drag?.over === key),
                state === "right" && "border-solid border-success bg-success-subtle ring-2 ring-success",
                state === "wrong" && "border-solid border-muted-foreground",
              )}
            >
              <AriaButton
                // One place takes a piece by a tap on the piece, so the place itself is only where a drag lets go.
                isDisabled={!takes || only !== undefined}
                onPress={() => move(key)}
                // The checked word is part of the name, as on a ChoiceGrid tile ("second, not yet"): the Status inside is overridden by aria-label.
                aria-label={
                  (takes && held !== undefined && only === undefined
                    ? `Put ${pieceLabel(held)} in ${name}` + swap(bumped(pieceKey(held), key))
                    : name) + (state === "open" ? "" : `, ${marks[state].toLowerCase()}`)
                }
                className="flex min-h-30 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-surface outline-offset-2 transition-state press hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span aria-hidden className={renderPlace ? "type-picture" : "type-heading"}>
                  {renderPlace ? renderPlace(s) : name}
                </span>
                {state !== "open" && (
                  <Status tone={state === "right" ? "success" : "neutral"} className="max-w-full truncate">
                    {marks[state]}
                  </Status>
                )}
              </AriaButton>
              {/* Room for a row of placed pieces from the start, so a place that holds one does not grow when filled.
                  Placed pieces keep to their size: a place holds several, and a stretched one would fill it with one. */}
              <div
                role={inside.length > 0 ? "group" : undefined}
                aria-label={inside.length > 0 ? `In ${name}` : undefined}
                className="grid min-h-18 min-w-0 gap-2"
                style={columns(placedSide, "auto-fill")}
              >
                {inside.map((p) => piece(p, true))}
              </div>
            </div>
          );
        })}
      </div>
      {check && !locked && (
        <Button
          variant="default"
          size="lg"
          onClick={check.onCheck}
          disabled={check.disabled}
          className="justify-self-center"
        >
          <Check aria-hidden strokeWidth={3} />
          {check.label}
          <Check aria-hidden strokeWidth={3} />
        </Button>
      )}
      {drag !== null &&
        createPortal(
          (() => {
            const p = pieces.find((q) => pieceKey(q) === drag.key);
            return p === undefined ? null : (
              <div
                aria-hidden
                data-dragging
                className="@container pointer-events-none fixed z-50 flex items-center justify-center rounded-overlay border-2 border-info bg-info-subtle p-1 text-card-foreground shadow-overlay ring-4 ring-info"
                style={{ left: drag.x - drag.w / 2, top: drag.y - drag.h / 2, width: drag.w, height: drag.h }}
              >
                {picture(p, where(p) !== null)}
              </div>
            );
          })(),
          document.body,
        )}
    </section>
  );
}

/** A piece being dragged: where the pointer is, the piece's size, and the zone under it (a place's key, `PILE`, or none). */
type Drag = { key: string; x: number; y: number; w: number; h: number; over: string | undefined };

/** The pile's key among the drop zones: not a string a place key can be. */
const PILE = "\u0000pile";
/** How far a press moves, in px, before it is a drag rather than a tap (a finger wobbles a few). */
const DRAG_START = 8;
