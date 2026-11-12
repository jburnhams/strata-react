import * as React from "react";
import { Play, Square } from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { HANDLES, drawRect, lerpRect, moveRect, resizeRect, sameRect, type Easing, type Handle, type Rect } from "../lib/region";
import { Button } from "./button";
import { NumberField } from "./value-controls";
import { PropertyRow } from "./inspector";

// Draw and move one or two windows on a picture: a crop, or the start and end of a pan. Issue
// #190, from strata-360's photo motion editor and the 360 view's aim overlay. `Compare`'s `regions`
// can only be looked at; nothing edited a rectangle.
//
// Checked: React Aria has no rectangle-editing part. Its `useMove` reports pointer and keyboard
// deltas, but they are not a second reason to leave pointer events, which already give capture on
// the box, and the keyboard model here is ours to state (Enter keeps, Escape undoes) because a
// rectangle has four numbers and no part of the library models that. The numbers are React Aria's
// `NumberField` through `NumberField`, which is how a typed value is validated rather than clamped.
//
// Coordinates are the picture's own (pixels of the file, say), not the screen's: the editor draws
// by percentage, reads the overlay's rectangle on every pointer event, and so keeps working when the
// frame is resized or zoomed by a `ViewportFrame` around it. The picture is `children`, so it can
// be an `<img>`, a `Thumbnail` or a video frame; give the editor `size`, the picture's width and
// height, and it keeps that shape.
//
// Editing is a draft until it is kept. A drag, or Shift/arrow keys, changes a draft shown at once;
// letting go, Enter or leaving the box keeps it (`onChange`), Escape throws the draft away. Each
// keyboard change is said in words ("From: 640 wide by 360 high, 120 across and 80 down") in a
// polite region. Moving needs no precision a pointer lacks: arrows move one step (a hundredth of the
// picture by default), Shift+arrows resize by the right or bottom edge (right and down grow, left and up
// shrink; with an aspect lock the other side follows about the middle), and `aspect` locks the shape through every route, typed numbers included.
//
// Two windows ("from" and "to", `mode="move"`) draw a line between the windows' centres and a
// Watch button. The editor does not know what it is moving, so it supplies the rectangle at time
// `t` (`onPreview(rect, t)`, eased) and draws that rectangle itself; the app moves its own picture.
// With reduced motion the preview jumps to the end instead of travelling.
//
// A name tag on every window carries its label, so a tone (`success` for start, `danger` for end)
// never has to be told apart by colour alone.

/** The tone a window is drawn in: a role colour, never a hue of its own. */
export type RegionTone = "neutral" | "info" | "success" | "warning" | "danger";

/** One window on the picture, in the picture's coordinates. */
export type EditableRegion = Rect & { id: string; label: string; tone?: RegionTone };

const TONE: Record<RegionTone, { edge: string; fill: string }> = {
  neutral: { edge: "var(--foreground)", fill: "var(--muted)" },
  info: { edge: "var(--info)", fill: "var(--info-subtle)" },
  success: { edge: "var(--success)", fill: "var(--success-subtle)" },
  warning: { edge: "var(--warning)", fill: "var(--warning-subtle)" },
  danger: { edge: "var(--danger)", fill: "var(--danger-subtle)" },
};

const CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
const HANDLE_AT: Record<Handle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2",
};

export type RegionEditorProps = {
  /** Names the editor: "Crop for the cover photo". Required. */
  label: string;
  /** The picture, drawn to fill the frame (an `<img className="size-full object-cover">`). */
  children: React.ReactNode;
  /** The picture's width and height, which are the units of every window. */
  size: readonly [number, number];
  regions: readonly EditableRegion[];
  /** A window was changed and kept. Receives the whole list, edited. */
  onChange: (regions: readonly EditableRegion[]) => void;
  /** Which window is chosen (controlled); leave out to let the editor keep it. */
  selectedId?: string | null;
  onSelectedChange?: (id: string | null) => void;
  /** Width over height every window keeps. */
  aspect?: number;
  /** The smallest a window may be. Default a twentieth of the picture. */
  min?: { w: number; h: number };
  /** Where windows may be. Default the whole picture. */
  bounds?: Rect;
  /** An arrow key's step, in the picture's units. Default a hundredth of its longer side. */
  step?: number;
  /** A drag on the empty picture draws a new window and calls this with it; the app adds it. Without it nothing can be drawn. */
  onDraw?: (rect: Rect) => void;
  /** "move": the first window is the start and the second the end; draws a line between them and a Watch button. */
  mode?: "single" | "move";
  /** Called as Watch plays, with the rectangle at `t` (0 to 1) and `t`. Also drawn by the editor. */
  onPreview?: (rect: Rect, t: number) => void;
  /** How long Watch takes, in milliseconds. Default 1500. */
  duration?: number;
  easing?: Easing;
  /** Show a number field for each side of the chosen window under the picture. Default true. */
  fields?: boolean;
  /** The unit of the numbers: "px". */
  unit?: string;
  /** The windows as they began; with it a Reset appears while they differ. */
  defaults?: readonly EditableRegion[];
  className?: string;
};

const round = (n: number) => format.integer(Math.round(n));
/** A window said in words. */
export const describeRegion = (r: EditableRegion) => `${r.label}: ${round(r.w)} wide by ${round(r.h)} high, ${round(r.x)} across and ${round(r.y)} down`;

type Draft = { id: string; rect: Rect } | null;
type Gesture =
  | { kind: "move"; id: string; start: Rect; from: { x: number; y: number } }
  | { kind: "resize"; id: string; handle: Handle; start: Rect; from: { x: number; y: number } }
  | { kind: "draw"; from: { x: number; y: number } };

/** Draw and move one or two named windows on a picture, with pointer, keyboard and numbers kept in step; aspect and bounds hold through all three; two windows make a from/to move with a Watch preview. */
export function RegionEditor({
  label, children, size, regions, onChange, selectedId, onSelectedChange, aspect, min, bounds, step, onDraw, mode = "single",
  onPreview, duration = 1500, easing = "ease-in-out", fields = true, unit = "px", defaults, className,
}: RegionEditorProps) {
  const [w, h] = size;
  const limits = React.useMemo(
    () => ({ bounds: bounds ?? { x: 0, y: 0, w, h }, min: min ?? { w: w / 20, h: h / 20 }, aspect }),
    [bounds, min, w, h, aspect],
  );
  const stride = step ?? Math.max(w, h) / 100;
  const [own, setOwn] = React.useState<string | null>(regions[0]?.id ?? null);
  const selected = selectedId !== undefined ? selectedId : own;
  const select = (id: string | null) => {
    setOwn(id);
    onSelectedChange?.(id);
  };
  const overlay = React.useRef<HTMLDivElement>(null);
  const [draft, setDraft] = React.useState<Draft>(null);
  const [drawing, setDrawing] = React.useState<Rect | null>(null);
  const gesture = React.useRef<Gesture | null>(null);
  const [said, setSaid] = React.useState("");
  const hintId = React.useId();

  const rectOf = (r: EditableRegion): Rect => (draft?.id === r.id ? draft.rect : r);
  const shown = regions.map((r) => ({ ...r, ...rectOf(r) }));

  const keep = (id: string, rect: Rect) => {
    const before = regions.find((r) => r.id === id);
    setDraft(null);
    if (before && !sameRect(before, rect)) onChange(regions.map((r) => (r.id === id ? { ...r, ...rect } : r)));
  };
  const say = (r: EditableRegion) => setSaid(describeRegion(r));

  // --- pointer
  const unitsAt = (e: { clientX: number; clientY: number }) => {
    const box = overlay.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return { x: 0, y: 0 };
    return { x: ((e.clientX - box.left) / box.width) * w, y: ((e.clientY - box.top) / box.height) * h };
  };
  const capture = (e: React.PointerEvent) => (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

  const beginMove = (e: React.PointerEvent, r: EditableRegion) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    select(r.id);
    gesture.current = { kind: "move", id: r.id, start: rectOf(r), from: unitsAt(e) };
  };
  const beginResize = (e: React.PointerEvent, r: EditableRegion, handle: Handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    select(r.id);
    gesture.current = { kind: "resize", id: r.id, handle, start: rectOf(r), from: unitsAt(e) };
  };
  const beginDraw = (e: React.PointerEvent) => {
    if (e.button !== 0 || !onDraw || e.target !== e.currentTarget) return;
    capture(e);
    gesture.current = { kind: "draw", from: unitsAt(e) };
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const at = unitsAt(e);
    if (g.kind === "draw") setDrawing(drawRect(g.from, at, limits));
    else {
      const dx = at.x - g.from.x;
      const dy = at.y - g.from.y;
      setDraft({ id: g.id, rect: g.kind === "move" ? moveRect(g.start, dx, dy, limits.bounds) : resizeRect(g.start, g.handle, dx, dy, limits) });
    }
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "draw") {
      const r = drawing;
      setDrawing(null);
      if (r && r.w >= limits.min.w && r.h >= limits.min.h) onDraw?.(r);
    } else if (draft) {
      keep(draft.id, draft.rect);
      const kept = regions.find((x) => x.id === draft.id);
      if (kept) say({ ...kept, ...draft.rect });
    }
  };

  // --- keyboard
  const keys = (e: React.KeyboardEvent, r: EditableRegion) => {
    const now = rectOf(r);
    if (e.key === "Escape") {
      if (draft?.id === r.id) {
        e.preventDefault();
        e.stopPropagation();
        setDraft(null);
        setSaid(`${r.label}: change undone`);
      }
      return;
    }
    if (e.key === "Enter") {
      if (draft?.id === r.id) {
        e.preventDefault();
        e.stopPropagation();
        keep(r.id, draft.rect);
        say({ ...r, ...draft.rect });
      }
      return;
    }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation(); // a zoomed ViewportFrame around the editor pans on arrows; these keys edit the region instead
    const next = e.shiftKey ? resizeRect(now, dir[0] ? "e" : "s", dir[0] * stride, dir[1] * stride, limits) : moveRect(now, dir[0] * stride, dir[1] * stride, limits.bounds);
    setDraft({ id: r.id, rect: next });
    say({ ...r, ...next });
  };

  // --- numbers
  const chosen = shown.find((r) => r.id === selected);
  const setSide = (key: "x" | "y" | "w" | "h", value: number | null) => {
    if (!chosen || value === null) return;
    const cur = rectOf(chosen);
    const next = key === "x" || key === "y" ? moveRect(cur, key === "x" ? value - cur.x : 0, key === "y" ? value - cur.y : 0, limits.bounds) : resizeRect(cur, key === "w" ? "e" : "s", key === "w" ? value - cur.w : 0, key === "h" ? value - cur.h : 0, limits);
    keep(chosen.id, next);
    say({ ...chosen, ...next });
  };

  // --- Watch
  const [watching, setWatching] = React.useState<Rect | null>(null);
  const frame = React.useRef(0);
  const [from, to] = [shown[0], shown[1]];
  const stopWatch = React.useCallback(() => {
    cancelAnimationFrame(frame.current);
    setWatching(null);
  }, []);
  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const watch = () => {
    if (!from || !to) return;
    if (watching) return stopWatch();
    const a: Rect = { x: from.x, y: from.y, w: from.w, h: from.h };
    const b: Rect = { x: to.x, y: to.y, w: to.w, h: to.h };
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onPreview?.(b, 1);
      setWatching(b);
      frame.current = window.setTimeout(() => setWatching(null), 600) as unknown as number;
      return;
    }
    const began = performance.now();
    setWatching(a);
    const tick = (now: number) => {
      const t = Math.min((now - began) / duration, 1);
      const rect = lerpRect(a, b, t, easing);
      onPreview?.(rect, t);
      setWatching(rect);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else frame.current = window.setTimeout(() => setWatching(null), 400) as unknown as number;
    };
    frame.current = requestAnimationFrame(tick);
  };

  const pct = (r: Rect) => ({ left: `${(r.x / w) * 100}%`, top: `${(r.y / h) * 100}%`, width: `${(r.w / w) * 100}%`, height: `${(r.h / h) * 100}%` });
  const modified = defaults ? !(defaults.length === regions.length && defaults.every((d, i) => regions[i] && sameRect(d, regions[i]!) && d.id === regions[i]!.id)) : false;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-surface border border-border bg-surface-sunken" style={{ aspectRatio: `${w} / ${h}` }}>
        {children}
        <div
          ref={overlay}
          role="group"
          aria-label={label}
          aria-describedby={hintId}
          className={cn("absolute inset-0 touch-none select-none", onDraw && "cursor-crosshair")}
          onPointerDown={beginDraw}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            gesture.current = null;
            setDraft(null);
            setDrawing(null);
          }}
        >
          {mode === "move" && from && to && (
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
              <defs>
                <marker id={`${hintId}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 10 5 0 10z" fill="var(--foreground)" />
                </marker>
              </defs>
              <line x1={from.x + from.w / 2} y1={from.y + from.h / 2} x2={to.x + to.w / 2} y2={to.y + to.h / 2} stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" markerEnd={`url(#${hintId}-arrow)`} />
            </svg>
          )}
          {shown.map((r) => {
            const tone = TONE[r.tone ?? "neutral"];
            const active = r.id === selected;
            return (
              <div
                key={r.id}
                role="group"
                aria-roledescription="region"
                aria-label={describeRegion(r)}
                tabIndex={0}
                data-region={r.id}
                data-selected={active || undefined}
                onFocus={() => select(r.id)}
                onBlur={(e) => {
                  if (draft?.id === r.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    keep(r.id, draft.rect);
                  }
                }}
                onKeyDown={(e) => keys(e, r)}
                onPointerDown={(e) => beginMove(e, r)}
                className={cn("absolute cursor-move border-2 outline-offset-2 transition-state", active ? "z-10" : "opacity-90")}
                style={{ ...pct(r), borderColor: tone.edge, backgroundColor: `color-mix(in oklab, ${tone.fill} 35%, transparent)`, borderStyle: active ? "solid" : "dashed" }}
              >
                <span className="pointer-events-none absolute left-0 top-0 max-w-full -translate-y-full truncate rounded-t-control px-1.5 type-caption" style={{ backgroundColor: tone.edge, color: "var(--background)" }}>
                  {r.label}
                </span>
                {active &&
                  HANDLES.map((handle) => (
                    <span
                      key={handle}
                      aria-hidden
                      data-handle={handle}
                      onPointerDown={(e) => beginResize(e, r, handle)}
                      className={cn("absolute size-3 rounded-pill border-2 bg-background", HANDLE_AT[handle])}
                      style={{ borderColor: tone.edge, cursor: CURSOR[handle] }}
                    />
                  ))}
              </div>
            );
          })}
          {drawing && <div aria-hidden className="pointer-events-none absolute border-2 border-dashed border-foreground bg-foreground/10" style={pct(drawing)} />}
          {watching && <div aria-hidden data-preview className="pointer-events-none absolute z-20 border-2 border-foreground bg-foreground/15" style={pct(watching)} />}
        </div>
      </div>

      <p id={hintId} className="type-caption text-muted-foreground">
        {onDraw ? "Drag on the picture to draw a window. " : ""}Drag a window to move it, or its handles to resize. Keys: arrows move, Shift and arrows resize, Enter keeps, Escape undoes.
      </p>

      {(mode === "move" || (defaults && modified)) && (
        <div className="flex flex-wrap items-center gap-2">
          {mode === "move" && (
            <Button size="sm" onPress={watch} disabled={!from || !to}>
              {watching ? <Square /> : <Play />} {watching ? "Stop" : "Watch"}
            </Button>
          )}
          {defaults && modified && (
            <Button size="sm" variant="ghost" onPress={() => { stopWatch(); onChange(defaults); setSaid("Windows put back as they began"); }}>
              Reset
            </Button>
          )}
        </div>
      )}

      {fields && chosen && (
        <div role="group" aria-label={`Position and size of ${chosen.label}`} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PropertyRow label="Across"><NumberField value={Math.round(chosen.x)} onChange={(v) => setSide("x", v)} min={limits.bounds.x} max={limits.bounds.x + limits.bounds.w - chosen.w} unit={unit} size="sm" /></PropertyRow>
          <PropertyRow label="Down"><NumberField value={Math.round(chosen.y)} onChange={(v) => setSide("y", v)} min={limits.bounds.y} max={limits.bounds.y + limits.bounds.h - chosen.h} unit={unit} size="sm" /></PropertyRow>
          <PropertyRow label="Width"><NumberField value={Math.round(chosen.w)} onChange={(v) => setSide("w", v)} min={Math.ceil(limits.min.w)} max={Math.floor(limits.bounds.w)} unit={unit} size="sm" /></PropertyRow>
          <PropertyRow label="Height"><NumberField value={Math.round(chosen.h)} onChange={(v) => setSide("h", v)} min={Math.ceil(limits.min.h)} max={Math.floor(limits.bounds.h)} unit={unit} size="sm" /></PropertyRow>
        </div>
      )}

      <div role="status" aria-live="polite" className="sr-only">{said}</div>
    </div>
  );
}
