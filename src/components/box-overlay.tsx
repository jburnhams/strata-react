import * as React from "react";
import { ListBox, ListBoxItem } from "react-aria-components";
import { cn } from "../lib/utils";
import { readingOrder, type BoxTone, type PictureBox } from "../lib/boxes";

// Read-only boxes on a picture, linked to a list beside it (strata-react issue #237, from
// strata-scan's OCR lines; faces in strata-360 and regions in diary-study are the same shape).
// `RegionEditor` edits one or two windows and puts handles on them, so it does not fit a few
// hundred boxes that are only shown; `ViewportFrame`'s `overlay` is the swipe layer, a different
// thing. The picture and its transcript become one object, as `TranscriptView` makes a recording and
// its words one object over time.
//
// Three parts and a hook. `BoxOverlay` is a child of `ViewportFrame`, so it zooms and pans with the
// picture. `BoxList` is the list beside it. `useBoxes` is the state the two share: the active box
// (chosen), the pointed box (hovered), and where a choice came from. One source of truth, so the
// two cannot disagree (the `Shortcut[]` rule of hotkeys.tsx).
//
// Drawing. One SVG layer with a `viewBox` of the picture's own pixels and `xMidYMid meet`, which
// is exactly where `object-fit: contain` puts the picture, so a box lands on its pixels whatever
// shape the frame is. Outlines use `vector-effect: non-scaling-stroke`, so they stay 1.5px at any
// zoom. Outline only by default (the type stays readable); the pointed or active box also takes
// the tone's subtle fill. A `<rect>` per box is cheap to a few hundred, which is the range this
// is for; a DOM element per box (HTML) is not used.
//
// Keyboard and names. The layer is a labelled group with one tab stop; each box is a button named
// by its `label` ("Line 2: The Play of Puncn anp Jupy, 62%"), and the arrows, Home and End move
// through them in reading order (`readingOrder`: rows top to bottom, left to right), not the order
// the data happens to be in. Enter or Space chooses, as a click does. Zoom to box is the app's call
// (`onChoose`, and `zoomToBox` in `lib/boxes.ts`), since the viewport is the app's state.
//
// The list is React Aria's `ListBox` (single selection, type-ahead, arrows, the right roles) in the
// same reading order. Choosing a box in the picture scrolls the list to it and focuses it; choosing
// in the list marks the box. Not virtualised: the list is for tens to a few hundred lines.
// React Aria checked: it has no part that draws shapes over an image, and `ListBox` has no focused
// key prop, so moving focus to the chosen option is a `focus()` on its element (it carries `data-key`).

/** Where the last choice was made, so the other part can follow it (focus moves to the list only when the picture chose). */
export type BoxSource = "list" | "picture";

/** The state `BoxOverlay` and `BoxList` share. */
export type BoxesState = {
  /** The chosen box's id. */
  active: string | null;
  /** The box under the pointer or being tabbed to, in either part. */
  pointed: string | null;
  source: BoxSource | null;
  choose: (id: string | null, from?: BoxSource) => void;
  point: (id: string | null) => void;
};

/** Holds the active and pointed box for a `BoxOverlay` and the `BoxList` beside it. */
export function useBoxes(initial: string | null = null): BoxesState {
  const [active, setActive] = React.useState<string | null>(initial);
  const [source, setSource] = React.useState<BoxSource | null>(null);
  const [pointed, point] = React.useState<string | null>(null);
  const choose = React.useCallback((id: string | null, from: BoxSource = "list") => {
    setActive(id);
    setSource(from);
  }, []);
  return React.useMemo(() => ({ active, pointed, source, choose, point }), [active, pointed, source, choose]);
}

const STROKE: Record<BoxTone, string> = { neutral: "var(--foreground)", info: "var(--info)", success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" };
const FILL: Record<BoxTone, string> = { neutral: "var(--muted)", info: "var(--info-subtle)", success: "var(--success-subtle)", warning: "var(--warning-subtle)", danger: "var(--danger-subtle)" };

export type BoxOverlayProps = {
  /** Names the layer: "Lines the reader found". */
  label: string;
  /** The picture's size in pixels; the boxes are in these units. */
  of: { w: number; h: number };
  boxes: readonly PictureBox[];
  state: BoxesState;
  /** A box was chosen (a click, Enter or Space): zoom to it, scroll a text pane. The state already holds it. */
  onChoose?: (box: PictureBox) => void;
};

/** Read-only boxes drawn as one SVG layer over a picture, inside `ViewportFrame` so they zoom with it: outline by tone, hover and choice shared with a `BoxList`, one tab stop with arrows in reading order. */
export function BoxOverlay({ label, of, boxes, state, onChoose }: BoxOverlayProps) {
  const order = React.useMemo(() => readingOrder(boxes), [boxes]);
  const byId = React.useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);
  const group = React.useRef<SVGSVGElement>(null);
  // The one tab stop: the active box, else the first in reading order.
  const stop = state.active && byId.has(state.active) ? state.active : order[0];

  const move = (id: string, e: React.KeyboardEvent) => {
    const i = order.indexOf(id);
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? order.length - 1 : null;
    if (to !== null) {
      e.preventDefault();
      e.stopPropagation(); // the frame pans on arrows when zoomed; with a box focused they mean the next box
      const next = order[Math.min(Math.max(to, 0), order.length - 1)];
      group.current?.querySelector<SVGElement>(`[data-box-id="${CSS.escape(next)}"]`)?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      choose(id);
    }
  };
  const choose = (id: string) => {
    state.choose(id, "picture");
    const box = byId.get(id);
    if (box) onChoose?.(box);
  };

  // Drawn in reading order, the one pointed or active last so its heavier outline is on top.
  const drawn = [...order, ...[state.pointed, state.active].filter((id): id is string => id !== null && order.includes(id))];
  return (
    <svg ref={group} role="group" aria-label={label} viewBox={`0 0 ${of.w} ${of.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full overflow-visible">
      {drawn.map((id, n) => {
        const b = byId.get(id)!;
        const tone = b.tone ?? "neutral";
        const on = id === state.active;
        const lit = on || id === state.pointed;
        const repeat = n >= order.length; // the raised copy of a lit box
        return (
          <rect
            key={repeat ? `${id}:raised` : id}
            data-box-id={id}
            role="button"
            aria-label={b.label}
            aria-pressed={on}
            aria-hidden={repeat || undefined}
            tabIndex={repeat ? undefined : id === stop ? 0 : -1}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={lit ? FILL[tone] : "none"}
            fillOpacity={lit ? 0.25 : undefined}
            stroke={STROKE[tone]}
            strokeWidth={on ? 3 : 1.5}
            strokeOpacity={lit || tone !== "neutral" ? 1 : 0.55}
            vectorEffect="non-scaling-stroke"
            pointerEvents={repeat ? "none" : "all"}
            className={cn("cursor-pointer", repeat && "pointer-events-none")}
            onPointerEnter={() => state.point(id)}
            onPointerLeave={() => state.point(null)}
            onFocus={() => state.point(id)}
            onBlur={() => state.point(null)}
            onClick={() => choose(id)}
            onKeyDown={(e) => move(id, e)}
          />
        );
      })}
    </svg>
  );
}

export type BoxListProps = {
  /** Names the list: "Lines on this page". */
  label: string;
  boxes: readonly PictureBox[];
  state: BoxesState;
  /** What each line shows. Default: the box's label. */
  renderBox?: (box: PictureBox) => React.ReactNode;
  className?: string;
};

/** The list beside a `BoxOverlay`, in the same reading order: choosing a line marks its box, pointing at one lights it, and choosing a box in the picture scrolls the list to its line and focuses it. */
export function BoxList({ label, boxes, state, renderBox, className }: BoxListProps) {
  const order = React.useMemo(() => readingOrder(boxes), [boxes]);
  const byId = React.useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (state.source !== "picture" || !state.active) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(state.active)}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
    el?.focus({ preventScroll: true });
  }, [state.active, state.source]);
  return (
    <ListBox
      ref={ref}
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={state.active ? [state.active] : []}
      onSelectionChange={(keys) => {
        const id = [...keys][0];
        if (id !== undefined) state.choose(String(id), "list");
      }}
      className={cn("min-w-0 overflow-y-auto rounded-surface border border-border", className)}
    >
      {order.map((id) => {
        const b = byId.get(id)!;
        return (
          <ListBoxItem
            key={id}
            id={id}
            textValue={b.label}
            onHoverStart={() => state.point(id)}
            onHoverEnd={() => state.point(null)}
            className={cn(
              "flex cursor-pointer items-baseline gap-2 border-l-2 px-3 py-1.5 type-body-sm outline-offset-[-2px] transition-state",
              "selected:bg-surface-sunken selected:font-medium hover:bg-surface-sunken",
              state.pointed === id && "bg-surface-sunken",
            )}
            style={{ borderLeftColor: (b.tone ?? "neutral") === "neutral" ? "transparent" : STROKE[b.tone ?? "neutral"] }}
          >
            {renderBox ? renderBox(b) : b.label}
          </ListBoxItem>
        );
      })}
    </ListBox>
  );
}
