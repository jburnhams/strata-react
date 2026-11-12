import * as React from "react";
import { Ban } from "lucide-react";
import { clampToRoom, settleCut, gridPoints, stepOnGrid, type Grid } from "../lib/sequence";
import { tickLabel, tickStep, ticksBetween, tidy } from "../lib/timeline";
import { cn } from "../lib/utils";

// A gapless sequence on a time axis, where the cut between two neighbours is dragged. Issue #191,
// from strata-360's film strip: the film is consecutive windows in film time, and moving a cut moves
// the end of one window and the start of the next at once.
//
// Not a mode of `Timeline`, and why (checked in `timeline.tsx`): `Timeline` reports one item's
// change (`TimelineChange` is one `start`, `length`, `lane`), so a move that has two items as its
// subject cannot be said through `onItemChange`, `validate` judges one item, and `snapPoints` snaps a
// time but cannot clamp a boundary to the room two neighbours leave. What is shared is shared: the
// ruler's tick ladder and labels (`tickStep`, `ticksBetween`, `tickLabel`), `tidy`, and the zoom
// state (`useTimelineZoom`), so the two draw the same axis. The window items are ordinary buttons.
//
// The unit of change is a cut. `onCutChange(i, time, { before, after })` reports the new edges of
// both windows (`before` ends at `time`, `after` starts at it); the app applies it and passes new
// `items`, so the sequence holds no second copy. `room(i)` is the app's: it knows how much media is
// behind each side, so it gives the earliest and latest time a cut may take and, optionally, the
// reason for each end, which is shown in words while a drag is stopped there (never a silent stop).
//
// Each cut is a `slider` (React Aria has no gapless-boundary part, and its slider hooks model one
// thumb on a track, not a thumb between two windows with a room of its own; the keys here are the
// slider pattern's): Left/Right move it one step of the grid (`grid` is a step in seconds or the
// beats' own times; with none, `step`), Shift one second, Home and End to the ends of its room,
// with the new time and both window lengths announced politely ("Cut 4 moved to 0:13.5. Window 4 is
// 3.5 s, window 5 is 6 s."). A drag snaps to the grid, which is drawn on the ruler, and is kept on
// release, so the app sees one change per drag. Keyboard steps are kept at once.
//
// Choosing a run: click a window, Shift+click another and the run between them is selected
// (`onSelectRange` gets the ids in order). The window's content is a slot (`renderItem`) for a
// thumbnail; windows are buttons with `aria-pressed`, named by their label and time range.

/** One window of the sequence. Windows tile the axis: each starts where the one before ends. */
export type SequenceItem = { id: string; label: string; start: number; end: number };

/** The room a cut has: the earliest and latest time it may take, with the reason for each end. */
export type CutRoom = { min: number; max: number; minReason?: string; maxReason?: string };

/** A cut's change: the two windows with their new edges. */
export type CutChange = { before: SequenceItem; after: SequenceItem };

export type SequenceTimelineProps = {
  /** Names the sequence: "Film, windows in order". Required. */
  label: string;
  /** The windows in time order, each starting where the last ends. */
  items: readonly SequenceItem[];
  /** Pixels per second; leave out to fit the width. */
  zoom?: number;
  /** A cut was moved (dragged and let go, or stepped by key). The app applies it. */
  onCutChange: (boundaryIndex: number, time: number, change: CutChange) => void;
  /** The room for the cut between `items[i]` and `items[i + 1]`. Default: each window keeps `minLength`. */
  room?: (boundaryIndex: number) => CutRoom;
  /** The shortest a window may be when `room` is not given. Default 0.1 s. */
  minLength?: number;
  /** A beat grid: a step in seconds, or the beats' times. Cuts snap to it and arrows step along it. */
  grid?: Grid;
  /** The arrow-key step when there is no grid. Default 0.1 s. */
  step?: number;
  /** The windows chosen, as ids. */
  selected?: readonly string[];
  /** A window or a run (Shift+click) was chosen: ids in order. */
  onSelectRange?: (ids: readonly string[]) => void;
  /** The inside of a window, such as a thumbnail; it gets the window and whether it is chosen. */
  renderItem?: (item: SequenceItem, selected: boolean) => React.ReactNode;
  /** The height of the strip. Default 5rem. */
  height?: string;
  className?: string;
};

const seconds = (n: number) => `${tidy(Math.round(n * 10) / 10)} s`;
const at = (t: number) => tickLabel(t, 0.1);

type Drag = { index: number; time: number; refused: string | null };

/** A gapless strip of windows whose cuts are dragged or stepped, snapping to a beat grid inside the room the app gives; each cut is a slider that announces both windows' new lengths; Shift+click chooses a run. */
export function SequenceTimeline({
  label, items, zoom, onCutChange, room, minLength = 0.1, grid, step = 0.1, selected = [], onSelectRange, renderItem, height = "5rem", className,
}: SequenceTimelineProps) {
  const start = items[0]?.start ?? 0;
  const end = items[items.length - 1]?.end ?? 0;
  const span = Math.max(end - start, 1e-6);
  const track = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState(800);
  React.useLayoutEffect(() => {
    const el = track.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const read = () => setFit(el.clientWidth || 800);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pxPerUnit = zoom ?? fit / span;
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [said, setSaid] = React.useState("");
  const anchor = React.useRef<string | null>(null);

  const roomFor = React.useCallback(
    (i: number): CutRoom => room?.(i) ?? { min: items[i]!.start + minLength, max: items[i + 1]!.end - minLength },
    [room, items, minLength],
  );

  // The windows as they look now, with a cut being dragged applied.
  const view = items.map((it, i) => ({
    ...it,
    start: drag && drag.index === i - 1 ? drag.time : it.start,
    end: drag && drag.index === i ? drag.time : it.end,
  }));

  const change = (i: number, time: number): CutChange => ({ before: { ...items[i]!, end: time }, after: { ...items[i + 1]!, start: time } });
  const words = (i: number, time: number) =>
    `Cut ${i + 1} moved to ${at(time)}. Window ${i + 1} is ${seconds(time - items[i]!.start)}, window ${i + 2} is ${seconds(items[i + 1]!.end - time)}.`;

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || !box.width) return start;
    return start + ((clientX - box.left) / box.width) * span;
  };

  const keys = (e: React.KeyboardEvent, i: number) => {
    const r = roomFor(i);
    const now = items[i]!.end;
    let target: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const dir = e.key === "ArrowRight" ? 1 : -1;
      target = e.shiftKey ? now + dir : stepOnGrid(now, dir, grid, step);
    } else if (e.key === "Home") target = r.min;
    else if (e.key === "End") target = r.max;
    if (target === null) return;
    e.preventDefault();
    const { time, limit } = clampToRoom(tidy(target), r);
    if (Math.abs(time - now) < 1e-9) {
      const why = limit?.reason ?? (e.key === "End" || e.key === "ArrowRight" ? r.maxReason : r.minReason);
      setSaid(`Cut ${i + 1} stays at ${at(now)}.${why ? ` ${why}` : ""}`);
      return;
    }
    onCutChange(i, time, change(i, time));
    setSaid(words(i, time) + (limit?.reason ? ` ${limit.reason}` : ""));
  };

  // --- pointer
  const begin = (e: React.PointerEvent, i: number) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ index: i, time: items[i]!.end, refused: null });
  };
  const drive = (e: React.PointerEvent) => {
    if (!drag) return;
    const { time, limit } = settleCut(timeAt(e.clientX), grid, roomFor(drag.index));
    setDrag({ index: drag.index, time, refused: limit ? `Cut ${drag.index + 1} stops at ${at(limit.at)}.${limit.reason ? ` ${limit.reason}` : ""}` : null });
  };
  const release = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (Math.abs(d.time - items[d.index]!.end) > 1e-9) {
      onCutChange(d.index, d.time, change(d.index, d.time));
      setSaid(words(d.index, d.time) + (d.refused ? ` ${d.refused}` : ""));
    } else if (d.refused) setSaid(d.refused);
  };

  // --- ruler
  const step0 = tickStep(pxPerUnit);
  const ticks = ticksBetween(start, end, step0);
  const all = gridPoints(grid, start, end);
  const beats = (end - start) / Math.max(all.length, 1) * pxPerUnit >= 4 ? all : [];
  const pct = (t: number) => `${((t - start) / span) * 100}%`;

  const choose = (e: React.MouseEvent, id: string) => {
    if (!onSelectRange) return;
    const here = items.findIndex((x) => x.id === id);
    const from = anchor.current ? items.findIndex((x) => x.id === anchor.current) : -1;
    if (e.shiftKey && from >= 0) {
      const [a, b] = from <= here ? [from, here] : [here, from];
      onSelectRange(items.slice(a, b + 1).map((x) => x.id));
    } else {
      anchor.current = id;
      onSelectRange([id]);
    }
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div role="group" aria-label={label} className="overflow-x-auto pb-2">
        <div ref={track} className="relative" style={{ width: zoom ? `${span * zoom}px` : "100%" }}>
          <div aria-hidden className="relative h-6 border-b border-border">
            {ticks.map((t) => (
              <span key={t} className="absolute top-0 -translate-x-1/2 type-caption tabular-nums text-muted-foreground" style={{ left: pct(t) }}>
                {tickLabel(t, step0)}
              </span>
            ))}
            {beats.map((p) => (
              <span key={`b${p}`} data-beat className="absolute bottom-0 h-1.5 w-px bg-border" style={{ left: pct(p) }} />
            ))}
          </div>
          <div className="relative mt-1" style={{ height }}>
            {view.map((it) => {
              const on = selected.includes(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${it.label}, ${at(it.start)} to ${at(it.end)}`}
                  onClick={(e) => choose(e, it.id)}
                  className={cn("absolute inset-y-0 min-w-0 cursor-pointer overflow-hidden rounded-control border px-1.5 text-left transition-state", on ? "border-primary bg-primary/10" : "border-border bg-muted hover:bg-muted/70")}
                  style={{ left: pct(it.start), width: `calc(${((it.end - it.start) / span) * 100}% - 2px)` }}
                >
                  {renderItem ? renderItem(it, on) : (
                    <>
                      <span className="block truncate type-label">{it.label}</span>
                      <span className="block truncate type-caption tabular-nums text-muted-foreground">{seconds(it.end - it.start)}</span>
                    </>
                  )}
                </button>
              );
            })}
            {items.slice(0, -1).map((it, i) => {
              const r = roomFor(i);
              const now = drag?.index === i ? drag.time : it.end;
              return (
                <div
                  key={`cut${it.id}`}
                  role="slider"
                  tabIndex={0}
                  aria-label={`Cut ${i + 1}, between window ${i + 1} and window ${i + 2}`}
                  aria-orientation="horizontal"
                  aria-valuemin={r.min}
                  aria-valuemax={r.max}
                  aria-valuenow={now}
                  aria-valuetext={at(now)}
                  data-cut={i}
                  onKeyDown={(e) => keys(e, i)}
                  onPointerDown={(e) => begin(e, i)}
                  onPointerMove={drive}
                  onPointerUp={release}
                  onPointerCancel={() => setDrag(null)}
                  className="group absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none outline-offset-1"
                  style={{ left: pct(now) }}
                >
                  <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-pill bg-foreground group-hover:w-1 group-focus-visible:w-1" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {drag?.refused && (
        <p className="mt-1 flex items-center gap-1.5 type-body-sm text-danger"><Ban className="size-4 shrink-0" aria-hidden /> {drag.refused}</p>
      )}
      <div role="status" aria-live="polite" className="sr-only">{said}</div>
    </div>
  );
}
