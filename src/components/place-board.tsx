import * as React from "react";
import { Button as AriaButton, ToggleButton } from "react-aria-components";
import { cn } from "../lib/utils";
import { Status } from "./status";

// Answering by putting pictures in places: "Put 4 apples in the basket", "Put the numbers in
// order", "Match each capital to its small letter", "Sort the pictures by their first sound".
// Flashtap's placing rounds (give-N, sequence, match pairs, sort), Jonathan 2026-11-22: "add
// components to strata react as needed". `ChoiceGrid` answers one question with one tap and closes;
// here an answer is an arrangement, built up and changed freely until the app checks it.
//
// The gesture is two taps: tap a piece to pick it up, tap a place to put it there. Tap the piece
// again to put it down where it was; tap the pile's "Put back" to return a placed piece. The same
// two presses work by touch, mouse, keyboard (Tab, Enter or Space) and screen reader, so there is
// one model to learn and nothing to hold down. React Aria first, checked rather than assumed:
// its drag and drop (`useDrag`, `DropZone`, `useDragAndDrop` on a `GridList`, which `SortableList`
// uses) starts a drag from the HTML drag events of a pointer, or from Enter or a screen reader's
// virtual click (useDrag.mjs: `onKeyUpCapture` Enter and `onClick` with `isVirtualClick` call
// `startDragging`); a plain tap or click never enters a "holding" state, so a child would have to
// drag (a long press first on iPad Safari) with a small finger across the screen. That is the one
// behaviour it lacks, so the holding state is ours; the controls are React Aria's: each piece is a
// `ToggleButton` (`aria-pressed` while held), each place a `Button`. Drag can be added on top later
// with `useDrag`/`useDrop` without changing the props.
//
// Places are disabled while nothing is held, so the Tab order is the pieces until one is picked
// up, then the places that can take it; a place's name then says what will happen ("Put apple in
// the basket"). After a move, focus follows the piece to where it went, so a keyboard user carries
// on from there. The board never decides anything: `placement` and `onMove` are the app's (it may
// refuse, swap a full place's piece back to the pile, or count), and so is the check. After one,
// `placeState` marks a place `right` or `wrong` with its word (`marks`, required, so a state is
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
  className?: string;
};

const pieceSide = 96;
const placedSide = 72;
// The picture step's own override (strata.css), so a placed numeral keeps its face at a size that fits 72px.
const placedPicture = { "--type-picture-size": "2.5rem" } as React.CSSProperties;
const placeSide = 160;

/** Pictures put into places with two taps (pick up, put down) for an answer that is an arrangement: give a number, order, match, sort. The app owns where each piece is and checks it; the board only moves what the learner asks. */
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
  className,
}: PlaceBoardProps<P, S>) {
  const [heldKey, setHeld] = React.useState<string | null>(null);
  // The piece to focus once it has moved: its button is a new element in its new area.
  const [follow, setFollow] = React.useState<string | null>(null);
  const buttons = React.useRef(new Map<string, HTMLElement>());
  const placeKeys = new Set(places.map(placeKey));
  const where = (p: P) => {
    const at = placement[pieceKey(p)];
    return at !== undefined && placeKeys.has(at) ? at : null;
  };
  const held = locked ? undefined : pieces.find((p) => pieceKey(p) === heldKey);
  const heldAt = held === undefined ? null : where(held);

  React.useEffect(() => {
    if (follow === null) return;
    buttons.current.get(follow)?.focus();
    setFollow(null);
  }, [follow]);

  const move = (to: string | null) => {
    if (held === undefined) return;
    const key = pieceKey(held);
    setHeld(null);
    onMove(key, to);
    setFollow(key);
  };

  const piece = (p: P, placed: boolean) => {
    const key = pieceKey(p);
    const isHeld = held !== undefined && pieceKey(held) === key;
    return (
      <ToggleButton
        key={key}
        ref={(el) => {
          if (el) buttons.current.set(key, el);
          else buttons.current.delete(key);
        }}
        isSelected={isHeld}
        onChange={(on) => setHeld(on ? key : null)}
        isDisabled={locked}
        aria-label={isHeld ? `${pieceLabel(p)}, ${marks.held.toLowerCase()}` : pieceLabel(p)}
        data-held={isHeld || undefined}
        className={cn(
          "flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-overlay border-2 border-border bg-card p-1 text-card-foreground select-none outline-offset-2 transition-state press",
          "hover:border-primary disabled:cursor-default disabled:hover:border-border",
          "selected:border-4 selected:border-primary selected:bg-muted",
        )}
      >
        <span aria-hidden className="type-picture" style={placed ? placedPicture : undefined}>
          {renderPiece(p)}
        </span>
        {isHeld && (
          <Status tone="info" className="max-w-full truncate">
            {marks.held}
          </Status>
        )}
      </ToggleButton>
    );
  };

  // In the pile pieces are 96px or more; in a place, which may hold several (a basket of apples),
  // 72px, still well over the touch minimum, so a full place does not grow taller than the screen.
  const grid = (inside: P[], name: string, side: number) =>
    inside.length > 0 && (
      <div
        role="group"
        aria-label={name}
        className="grid min-w-0 gap-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${side}px, 100%), 1fr))` }}
      >
        {inside.map((p) => piece(p, side === placedSide))}
      </div>
    );

  const pile = pieces.filter((p) => where(p) === null);

  return (
    <section aria-label={label} className={cn("grid min-w-0 gap-6", className)}>
      <div className="grid min-w-0 gap-2">
        {grid(pile, pileLabel, pieceSide)}
        {heldAt !== null && held !== undefined && (
          <AriaButton
            onPress={() => move(null)}
            className="min-h-(--control-h) justify-self-start rounded-control border border-input bg-background px-3 type-label transition-state press hover:bg-muted"
          >
            {`Put ${pieceLabel(held)} back`}
          </AriaButton>
        )}
      </div>
      <div
        className="grid min-w-0 gap-4"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${placeSide}px, 100%), 1fr))` }}
      >
        {places.map((s) => {
          const key = placeKey(s);
          const state = placeState(s);
          const name = placeLabel(s);
          const inside = pieces.filter((p) => where(p) === key);
          const takes = held !== undefined && heldAt !== key;
          return (
            <div
              key={key}
              data-place={state}
              className={cn(
                "grid min-w-0 content-start gap-2 rounded-overlay border-2 border-dashed border-input p-2 transition-state",
                takes && "border-solid border-primary",
                state === "right" && "border-4 border-solid border-success bg-success-subtle",
                state === "wrong" && "border-solid border-muted-foreground",
              )}
            >
              <AriaButton
                isDisabled={!takes}
                onPress={() => move(key)}
                // The checked word is part of the name, as on a ChoiceGrid tile ("second, not yet"): the Status inside is overridden by aria-label.
                aria-label={
                  (takes && held !== undefined ? `Put ${pieceLabel(held)} in ${name}` : name) +
                  (state === "open" ? "" : `, ${marks[state].toLowerCase()}`)
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
              {grid(inside, `In ${name}`, placedSide)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
