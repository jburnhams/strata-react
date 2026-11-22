import * as React from "react";
import { GridList, GridListItem } from "react-aria-components";
import { cn } from "../lib/utils";
import { Status } from "./status";

// One question, a few pictures, exactly one right answer, tapped by someone who may not read yet:
// Flashtap's rounds ("Find the cow", "How many apples?") for children of two to five. Jonathan,
// 2026-11-22: "add components to strata react as needed"; Flashtap had hand-built these tiles in
// its own CSS. Neither existing grid fits. `SelectableGrid` keeps a set of chosen tiles for a bulk
// action and draws a checkbox; `TileGrid` opens a link and has no answer state. Here a press is an
// answer, an answer cannot be taken back, and the grid ends once the right one is shown.
//
// Behaviour is React Aria's GridList with `layout="grid"` and `onAction` (as `TileGrid`): a labelled
// grid whose arrow keys move across and down, Enter or a press answers, type-ahead by name. A tile
// already answered is in `disabledKeys` with `disabledBehavior="all"`, so it cannot be pressed twice
// or focused, and assistive technology hears it as unavailable; once a tile is `right` or `answer`
// every tile is disabled, so the grid needs no separate "finished" prop that could disagree with
// the tiles. Checked in `useGridListItem`: a disabled key with behaviour "all" gets no press, no
// focus and `aria-disabled`.
//
// The state of each tile is the app's (it knows the answer key; strata-react never does): `open`,
// `wrong` (tapped, not it), `right` (tapped, it) or `answer` (the right one shown because the tries
// ran out). Each closed state carries its word under the picture (`marks`, required, so a state is
// never colour alone) and in the tile's name ("Cow, not this one"). Wrong is greyed and neutral,
// never red: a mistake is not punished (the early-years spec behind Flashtap, §17). Right and answer
// get the success role's border and tint.
//
// Sizes are for small, imprecise fingers: tiles at least 120px (`md`) or 160px (`lg`) square, well
// over the 44px touch minimum, growing to fill the row. The picture uses `type-picture`, the one
// step above 28px outside Persuade, because an emoji or a numeral a child must recognise across a
// table is a picture, not text to read. Feedback in sound (saying "No, that's a pig") is the app's.

/** Where a tile stands in the round: not yet tried, tried and wrong, tried and right, or shown as the answer after the tries ran out. */
export type ChoiceState = "open" | "wrong" | "right" | "answer";

/** Smallest tile side: `md` 120px, `lg` 160px. Tiles grow to fill the row. */
export type ChoiceSize = "md" | "lg";

const minSide: Record<ChoiceSize, number> = { md: 120, lg: 160 };
const closed = (s: ChoiceState) => s === "right" || s === "answer";

/** Props of `ChoiceGrid`. */
export type ChoiceGridProps<T> = {
  /** Names the grid: "Choices", or the question itself ("Find the cow"). */
  label: string;
  items: T[];
  itemKey: (item: T) => string;
  /** What the picture is, said by a screen reader and used for type-ahead: "cow", "3". Never drawn, which would give the answer away. */
  itemLabel: (item: T) => string;
  /** The picture: an emoji, a numeral or an `<img alt="">`; drawn at `type-picture`. */
  renderPicture: (item: T) => React.ReactNode;
  /** Each tile's state in the round. The app owns the answer; the grid only draws it. */
  state: (item: T) => ChoiceState;
  /** The word under a closed tile, for each closed state: `{ wrong: "Not this one", right: "Right", answer: "This one" }`. */
  marks: Record<Exclude<ChoiceState, "open">, string>;
  /** An open tile was pressed (pointer, touch, Enter or Space). */
  onChoose: (item: T) => void;
  /** Default `md`. */
  size?: ChoiceSize;
  className?: string;
};

const columns = (size: ChoiceSize) => ({ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minSide[size]}px, 100%), 1fr))` });

/** A grid of large picture tiles for answering one question with a tap: each tile open, wrong, right or shown as the answer, with its word; answered tiles cannot be pressed again, and the grid closes once the answer shows. */
export function ChoiceGrid<T>({ label, items, itemKey, itemLabel, renderPicture, state, marks, onChoose, size = "md", className }: ChoiceGridProps<T>) {
  const byKey = new Map(items.map((item) => [itemKey(item), item]));
  const over = items.some((item) => closed(state(item)));
  const disabledKeys = items.filter((item) => over || state(item) !== "open").map(itemKey);

  return (
    <GridList
      aria-label={label}
      layout="grid"
      disabledKeys={disabledKeys}
      disabledBehavior="all"
      onAction={(key) => {
        const item = byKey.get(String(key));
        if (item !== undefined) onChoose(item);
      }}
      className={cn("grid min-w-0 gap-4 outline-none", className)}
      style={columns(size)}
    >
      {items.map((item) => {
        const key = itemKey(item);
        const s = state(item);
        const mark = s === "open" ? null : marks[s];
        return (
          <GridListItem
            key={key}
            id={key}
            textValue={itemLabel(item)}
            aria-label={mark ? `${itemLabel(item)}, ${mark.toLowerCase()}` : itemLabel(item)}
            data-choice={s}
            className={cn(
              "flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-overlay border-2 border-border bg-card p-2 text-card-foreground select-none outline-offset-2 transition-state press",
              "hover:border-primary disabled:cursor-default disabled:hover:border-border",
              closed(s) && "border-4 border-success bg-success-subtle disabled:hover:border-success",
            )}
          >
            <span aria-hidden className={cn("type-picture transition-state", s === "wrong" && "opacity-40")}>
              {renderPicture(item)}
            </span>
            {mark && (
              <Status tone={s === "wrong" ? "neutral" : "success"} className="max-w-full truncate">
                {mark}
              </Status>
            )}
          </GridListItem>
        );
      })}
    </GridList>
  );
}

/** The loading shape of a `ChoiceGrid`: `count` tiles at the same size, for a `DataView` skeleton. */
export function ChoiceGridSkeleton({ count = 4, size = "md", className }: { count?: number; size?: ChoiceSize; className?: string }) {
  return (
    <div aria-hidden className={cn("grid min-w-0 gap-4", className)} style={columns(size)}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="block aspect-square rounded-overlay bg-muted" />
      ))}
    </div>
  );
}
