import * as React from "react";
import { VisuallyHidden, mergeProps, useDrop, useFocusRing, useSlider, useSliderThumb } from "react-aria";
import type { DropItem } from "react-aria-components";
import { useSliderState } from "react-stately";
import { Ban, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { clamp, snapTo, tickLabel, tickStep, ticksBetween, tidy } from "../lib/timeline";
import { cn } from "../lib/utils";
import { IconButton } from "./button";

// A time axis with lanes of items (strata issue #77, from a video editor's timeline; the research's
// own example is a kiln schedule). Video and audio editors, rotas, resource bookings, Gantt-style
// plans and deployment timelines are the same picture: a ruler, lanes, items with a start and a
// length, a current-time line, markers.
//
// The component draws and the app decides. Every change (move, trim, change lane, set the current
// time, select) is reported through a callback and applied by the app, so the app's own rules
// (overlap, snapping to its grid, undo) stay in one place and the timeline never holds a second copy
// of the data. A change the app refuses (`validate` returns a reason) is shown while it is being
// made, with an icon and the reason in words, and is not reported.
//
// Keyboard first (the issue found nothing but Delete working). One tab stop for the items, with the
// focus moving inside it: Left and Right go to the previous and next item in the lane, Up and Down
// to the nearest in the lane above or below, Home and End to the lane's first and last. Enter or
// Space selects (with Ctrl or Shift, adds to the selection). On the focused item: Ctrl+Left/Right
// nudge it by `step` (Shift: ten steps), Ctrl+Up/Down move it a lane, Alt+Left/Right trim the end,
// Alt+Shift+Left/Right trim the start, Delete asks the app to remove the selection. The current time
// is React Aria's slider hooks, with the ruler as its track and the marker as its thumb (a press or
// drag on the ruler moves it; arrows `step`, Shift ten steps, Page keys ten, Home and End the limits
// are a capture handler on its input, because the hooks have one step and a drag needs a fine one; the
// value is spoken through `formatTime`, which `Intl.NumberFormat` options cannot do).
// `+`, `-` and `0` zoom in, out and to fit when `onZoomChange` is given. Every change is announced
// politely in words: "run-02.mp4 moved to 0:14, Track 1".
//
// Items are named for a screen reader as "run-02.mp4, 0:12 to 0:47, Track 1" and lanes are labelled
// groups. The ruler's labels are chosen from a ladder of steps a person would write on a scale
// (1, 2, 5, 10 s, 15 s, 30 s, minutes…) wide enough apart that they never collide, and the end
// labels stay inside the axis (components.md §3.8). Nothing animates on zoom, scroll or move: these
// are the most repeated actions on the screen (ux-character.md, by frequency).
//
// Performance: items outside the visible window, plus a margin, are not rendered, so thousands of
// items cost what is on screen. Widths come from the props (`zoom` is pixels per unit) and one
// ResizeObserver reading the viewport, not from measuring items.
//
// Drops from outside (issue #121, strata-vid's library list). Each lane is a React Aria `useDrop`
// target, so the pointer path, the keyboard path (React Aria's virtual drag: the lane takes focus
// and Enter drops) and the screen-reader announcements are its. Checked in `useDrop.d.ts` and
// `DragManager`: while a drag is over a lane the types are known but the items are not, so the
// preview is `dropLength` long and the app learns what was dropped only in `onDrop`. A pointer
// drop lands with its left edge at the pointer, snapped like a move; a virtual drop reports the
// lane's centre, not a time (and in a different coordinate space from a pointer's), so it is told
// apart by the lane being the focused element and lands at the current time (`position`, else the
// start). `validateDrop` is `validate` for a drop: the refusal shows beside the preview while it is
// over a lane and is announced for the keyboard.
//
// Pointer moves are our own pointer events with a 3px threshold between click and drag. React
// Aria's `useMove` (in `react-aria`, a transitive dependency of `react-aria-components`) would do
// the pointer and arrow-key deltas, but using it means listing `react-aria` as a direct
// dependency, which is Jonathan's call (CLAUDE.md), so it is not done here; it is offered in the
// PR. Native HTML drag and drop (#76's `SortableList`) is for lists and cannot give a live,
// snapped, zoom-aware position along time, which is why this is not built on it.

export type TimelineItem = {
  id: string;
  /** The lane's id. */
  lane: string;
  start: number;
  length: number;
  /** The item's name, in the item and for a screen reader. */
  label: string;
  /** What kind of thing it is (video, audio, booking). Shown as a word and a colour stripe, never colour alone. Its colour is `kindColours[kind]`, else the chart palette in order of appearance. */
  kind?: string;
};

export type TimelineLane = {
  id: string;
  label: string;
  /** The app's controls for the lane (mute, lock, delete). Drawn in the lane's header, at the left. */
  header?: React.ReactNode;
};

export type TimelineMarker = { id: string; time: number; label: string };

/** What a move or trim would produce. */
export type TimelineChange = { start: number; length: number; lane: string };

/** Where something dragged in from outside landed. */
export type TimelineDrop = TimelineChange & { items: DropItem[] };

export type TimelineProps = {
  /** Names the timeline for a screen reader ("Firing schedule"). */
  label: string;
  lanes: readonly TimelineLane[];
  items: readonly TimelineItem[];
  /** The axis runs from this time. Default 0. */
  from?: number;
  /** ... to this time. */
  to: number;
  /** Pixels per unit of time. Controlled with `onZoomChange`. */
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  /** The current time, drawn as a rule across the lanes and set by the slider on the ruler. */
  position?: number;
  onPositionChange?: (time: number) => void;
  /** Keep the current time in view as it advances. */
  follow?: boolean;
  markers?: readonly TimelineMarker[];
  selectedIds?: ReadonlySet<string>;
  /** The selection changed: `ids` is the whole new selection. */
  onSelect?: (ids: string[]) => void;
  /** The item was moved, trimmed or put in another lane. Not called for a change `validate` refused. */
  onItemChange?: (id: string, next: TimelineChange) => void;
  /** The person asked to remove the selection (Delete). The app does it, undoably. */
  onDelete?: (ids: string[]) => void;
  /** A reason a change cannot be made, in the product's words, or `null`. Called while dragging, so keep it cheap. */
  validate?: (id: string, next: TimelineChange) => string | null;
  /** Extra times items snap to, besides the edges of other items, markers and the current time. */
  snapPoints?: readonly number[];
  /** Turn snapping off. Default on. */
  snap?: boolean;
  /** One keyboard step, in time units. Default 1. */
  step?: number;
  /** Smallest an item may be, in time units. Default `step`. */
  minLength?: number;
  /** The colour of each kind's stripe, chosen by the app: a CSS colour, normally a role or a subject colour of its theme (`var(--info)`, `var(--kind-gpx)`). Without an entry a kind takes the chart palette in order of appearance, which moves when the set of kinds changes. */
  kindColours?: Readonly<Record<string, string>>;
  /** How many control heights tall each lane is. Default 1; 2 or 3 for items that draw thumbnails or a waveform. */
  laneRows?: number;
  /** Drag types a lane accepts from outside the timeline (`"text/plain"`, an app type). Without it nothing can be dropped. */
  dropTypes?: readonly string[];
  /** Length of an item dropped from outside, for the preview and for `validateDrop`. Default five steps. */
  dropLength?: number;
  /** Something was dropped on a lane at a time (snapped like a move). The app makes the item. Not called for a drop `validateDrop` refused. */
  onDrop?: (drop: TimelineDrop) => void;
  /** A reason a drop cannot be made, in the product's words, or `null`. Called while a drag is over a lane, so keep it cheap. */
  validateDrop?: (next: TimelineChange) => string | null;
  /** Draws an item's content (a strip of thumbnails, a waveform). Default: the label and kind. */
  renderItem?: (item: TimelineItem, state: { selected: boolean; width: number }) => React.ReactNode;
  /** A time as words ("0:14", "13:30"). Default `m:ss`, with tenths on the ruler when zoomed far in. Also labels the ruler when given, so a schedule in hours reads as clock times. */
  formatTime?: (time: number) => string;
  /** Shown instead of the lanes' area when there are no lanes. */
  empty?: React.ReactNode;
  className?: string;
};

const EDGE_PX = 8;
const DRAG_THRESHOLD = 3;

const defaultFormat = (t: number) => tickLabel(t, 1);

type Drag = { id: string; mode: "move" | "start" | "end"; originX: number; origin: TimelineItem; next: TimelineChange; reason: string | null; guide: number | null; moved: boolean };

/** Zoom state for a timeline: `zoomIn`, `zoomOut`, and `fit` to a viewport width. Pass `zoom` and `setZoom` as the timeline's `zoom` and `onZoomChange`. */
export function useTimelineZoom({ initial = 20, min = 0.5, max = 400 }: { initial?: number; min?: number; max?: number } = {}) {
  const [zoom, set] = React.useState(initial);
  const setZoom = React.useCallback((z: number) => set(clamp(z, min, max)), [min, max]);
  return {
    zoom,
    setZoom,
    zoomIn: () => setZoom(zoom * 1.5),
    zoomOut: () => setZoom(zoom / 1.5),
    /** Zoom so `duration` fills `viewportWidth` pixels. */
    fit: (viewportWidth: number, duration: number) => setZoom(viewportWidth / Math.max(duration, 1e-6)),
  };
}

/** Zoom in, zoom out and fit, as named icon buttons for a timeline's toolbar. */
export function TimelineZoomControls({ zoom }: { zoom: Pick<ReturnType<typeof useTimelineZoom>, "zoomIn" | "zoomOut"> & { fit: () => void } }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={ZoomOut} label="Zoom out" hint="-" onClick={zoom.zoomOut} />
      <IconButton icon={ZoomIn} label="Zoom in" hint="+" onClick={zoom.zoomIn} />
      <IconButton icon={Maximize2} label="Fit to view" hint="0" onClick={zoom.fit} />
    </div>
  );
}

/** A rule that refuses an item overlapping another in its lane, for `validate`: names the item in the way. */
export function noOverlap(items: readonly TimelineItem[]): (id: string, next: TimelineChange) => string | null {
  return (id, next) => {
    const me = items.find((i) => i.id === id);
    const other = items.find((i) => i.id !== id && i.lane === next.lane && i.start < next.start + next.length - 1e-9 && next.start < i.start + i.length - 1e-9);
    return other ? `${me?.label ?? "This"} would overlap ${other.label}.` : null;
  };
}

/** Items placed on a zoomable time axis in lanes, with a current-time rule and markers. Reports every move, trim, selection and time change; the app applies them. Keyboard-complete, and only the items near the view are rendered. */
export function Timeline({
  label,
  lanes,
  items,
  from = 0,
  to,
  zoom,
  onZoomChange,
  position,
  onPositionChange,
  follow,
  markers = [],
  selectedIds,
  onSelect,
  onItemChange,
  onDelete,
  validate,
  snapPoints = [],
  snap = true,
  step = 1,
  minLength,
  renderItem,
  kindColours,
  laneRows = 1,
  dropTypes,
  dropLength,
  onDrop,
  validateDrop,
  formatTime = defaultFormat,
  empty,
  className,
}: TimelineProps) {
  const min = minLength ?? step;
  const scroller = React.useRef<HTMLDivElement>(null);
  const laneRefs = React.useRef(new Map<string, HTMLElement>());
  const [view, setView] = React.useState({ left: 0, width: 640 });
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");
  const [hover, setHover] = React.useState<{ next: TimelineChange; reason: string | null; guide: number | null } | null>(null);
  const refocus = React.useRef<string | null>(null);
  const selected = selectedIds ?? new Set<string>();
  const laneIndex = React.useMemo(() => new Map(lanes.map((l, i) => [l.id, i])), [lanes]);
  const laneLabel = (id: string) => lanes.find((l) => l.id === id)?.label ?? id;
  const width = Math.max((to - from) * zoom, 1);
  const x = (t: number) => (t - from) * zoom;

  // The viewport: its width, and where it is scrolled. Items outside it (plus a margin of one
  // viewport on each side) are not rendered.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => setView({ left: el.scrollLeft, width: el.clientWidth || 640 });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    el.addEventListener("scroll", read, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", read);
    };
  }, []);

  // Follow the current time: scroll only when it leaves the view, so a person who scrolled away to
  // look is not dragged back while it is still on screen.
  React.useEffect(() => {
    const el = scroller.current;
    if (!follow || position === undefined || !el) return;
    const px = x(position);
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = Math.max(px - el.clientWidth * 0.25, 0);
  }, [follow, position, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    const el = scroller.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`);
    if (el && document.activeElement !== el && (!document.activeElement || document.activeElement === document.body || !scroller.current?.contains(document.activeElement))) el.focus();
  }, [items]);

  const sorted = React.useMemo(() => {
    const byLane = new Map<string, TimelineItem[]>();
    for (const l of lanes) byLane.set(l.id, []);
    for (const i of items) byLane.get(i.lane)?.push(i);
    for (const list of byLane.values()) list.sort((a, b) => a.start - b.start);
    return byLane;
  }, [lanes, items]);

  const snapTimes = React.useMemo(() => {
    const pts = [...snapPoints, ...markers.map((m) => m.time)];
    if (position !== undefined) pts.push(position);
    return pts;
  }, [snapPoints, markers, position]);

  /** Apply a change: validate, report, and say it. Returns the refusal, if any. */
  const commit = (item: TimelineItem, next: TimelineChange): string | null => {
    const reason = validate?.(item.id, next) ?? null;
    if (reason) {
      setSaid(reason);
      return reason;
    }
    // A change of lane remounts the item's element in the new lane; put focus back on it once the app has applied the change.
    refocus.current = item.id;
    onItemChange?.(item.id, next);
    const where = next.lane !== item.lane ? `, ${laneLabel(next.lane)}` : "";
    setSaid(
      next.start !== item.start && next.length === item.length
        ? `${item.label} moved to ${formatTime(next.start)}${where}.`
        : next.lane !== item.lane
          ? `${item.label} moved to ${laneLabel(next.lane)}.`
          : `${item.label} now ${formatTime(next.start)} to ${formatTime(next.start + next.length)}.`,
    );
    return null;
  };

  const select = (id: string, add: boolean) => {
    const next = add ? (selected.has(id) ? [...selected].filter((s) => s !== id) : [...selected, id]) : [id];
    onSelect?.(next);
  };

  // --- keyboard on an item -------------------------------------------------------------------
  const focusItem = (id: string) => {
    setFocusId(id);
    requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`)?.focus());
    // jsdom has no layout and runs rAF late; focus now too when the element is already mounted.
    scroller.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`)?.focus();
    const item = items.find((i) => i.id === id);
    if (item && scroller.current) {
      const el = scroller.current;
      if (x(item.start) < el.scrollLeft) el.scrollLeft = x(item.start) - 16;
      else if (x(item.start + item.length) > el.scrollLeft + el.clientWidth) el.scrollLeft = x(item.start + item.length) - el.clientWidth + 16;
    }
  };

  const onItemKeyDown = (e: React.KeyboardEvent, item: TimelineItem) => {
    const k = e.key;
    const big = e.shiftKey ? 10 : 1;
    const lane = sorted.get(item.lane) ?? [];
    const idx = lane.findIndex((i) => i.id === item.id);
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.ctrlKey || e.metaKey) {
      if (k === "ArrowLeft" || k === "ArrowRight") {
        handled();
        const dir = k === "ArrowLeft" ? -1 : 1;
        commit(item, { start: clamp(tidy(item.start + dir * step * big), from, to - item.length), length: item.length, lane: item.lane });
      } else if (k === "ArrowUp" || k === "ArrowDown") {
        handled();
        const target = lanes[(laneIndex.get(item.lane) ?? 0) + (k === "ArrowUp" ? -1 : 1)];
        if (target) commit(item, { start: item.start, length: item.length, lane: target.id });
        return;
      }
      // Ctrl or Cmd with Enter or Space adds to the selection; the switch below handles it.
      if (k !== "Enter" && k !== " ") return;
    }
    if (e.altKey && (k === "ArrowLeft" || k === "ArrowRight")) {
      handled();
      const dir = k === "ArrowLeft" ? -1 : 1;
      if (e.shiftKey) {
        // Trim the start: Right shortens from the start, Left extends it.
        const start = clamp(tidy(item.start + dir * step), from, item.start + item.length - min);
        commit(item, { start, length: tidy(item.start + item.length - start), lane: item.lane });
      } else {
        commit(item, { start: item.start, length: clamp(tidy(item.length + dir * step), min, to - item.start), lane: item.lane });
      }
      return;
    }
    switch (k) {
      case "ArrowLeft":
        handled();
        if (lane[idx - 1]) focusItem(lane[idx - 1].id);
        break;
      case "ArrowRight":
        handled();
        if (lane[idx + 1]) focusItem(lane[idx + 1].id);
        break;
      case "ArrowUp":
      case "ArrowDown": {
        handled();
        const neighbour = lanes[(laneIndex.get(item.lane) ?? 0) + (k === "ArrowUp" ? -1 : 1)];
        const candidates = neighbour ? (sorted.get(neighbour.id) ?? []) : [];
        const nearest = candidates.reduce<TimelineItem | null>((best, c) => (!best || Math.abs(c.start - item.start) < Math.abs(best.start - item.start) ? c : best), null);
        if (nearest) focusItem(nearest.id);
        break;
      }
      case "Home":
        handled();
        if (lane[0]) focusItem(lane[0].id);
        break;
      case "End":
        handled();
        if (lane.length) focusItem(lane[lane.length - 1].id);
        break;
      case "Enter":
      case " ":
        handled();
        select(item.id, e.shiftKey || e.ctrlKey || e.metaKey);
        break;
      case "Delete":
      case "Backspace":
        if (selected.size && onDelete) {
          handled();
          onDelete([...selected]);
        }
        break;
    }
  };

  /** Snaps an item of `length` starting at `start` to whichever of its ends is nearer an edge. */
  const snapMove = (start: number, length: number, exclude?: string) => {
    const edges = [...snapTimes, ...items.filter((i) => i.id !== exclude).flatMap((i) => [i.start, i.start + i.length])];
    const a = snap ? snapTo(start, edges, zoom) : null;
    const b = snap ? snapTo(start + length, edges, zoom) : null;
    if (a && (!b || Math.abs(a.time - start) <= Math.abs(b.time - (start + length)))) return { start: a.time, guide: a.point as number | null };
    if (b) return { start: b.time - length, guide: b.point as number | null };
    return { start, guide: null as number | null };
  };

  // --- drops from outside ----------------------------------------------------------------------
  const dropLen = dropLength ?? step * 5;
  const dropAt = (lane: string, px: number | null) => {
    const at = px === null ? (position ?? from) : from + px / zoom;
    const snapped = snapMove(at, dropLen);
    const next: TimelineChange = { start: clamp(tidy(snapped.start), from, Math.max(to - dropLen, from)), length: dropLen, lane };
    return { next, guide: snapped.guide, reason: validateDrop?.(next) ?? null };
  };
  const onLaneHover = (lane: string, px: number | null) => {
    const h = dropAt(lane, px);
    setHover(h);
    // A pointer sees the preview; the keyboard is told, as nothing else says where the drop would land.
    if (px === null) setSaid(h.reason ?? `Drop here: ${laneLabel(lane)} at ${formatTime(h.next.start)}.`);
  };
  const onLaneDrop = (lane: string, px: number | null, dropped: DropItem[]) => {
    setHover(null);
    const h = dropAt(lane, px);
    if (h.reason) {
      setSaid(h.reason);
      return;
    }
    onDrop?.({ ...h.next, items: dropped });
    setSaid(`Added at ${formatTime(h.next.start)}, ${laneLabel(lane)}.`);
  };
  const dropsOn = Boolean(dropTypes?.length && onDrop);

  // --- pointer: move and trim ----------------------------------------------------------------
  const begin = (e: React.PointerEvent, item: TimelineItem, mode: Drag["mode"]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const d: Drag = { id: item.id, mode, originX: e.clientX, origin: item, next: { start: item.start, length: item.length, lane: item.lane }, reason: null, guide: null, moved: false };
    dragRef.current = d;
    setDrag(d);
  };

  const laneAt = (clientY: number, fallback: string) => {
    for (const [id, el] of laneRefs.current) {
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) return id;
    }
    return fallback;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.originX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && d.mode !== "move") return;
    const dt = dx / zoom;
    const o = d.origin;
    let next: TimelineChange = { start: o.start, length: o.length, lane: o.lane };
    let guide: number | null = null;
    const edges = [...snapTimes, ...items.filter((i) => i.id !== o.id).flatMap((i) => [i.start, i.start + i.length])];
    const snapped = (t: number) => {
      const s = snap ? snapTo(t, edges, zoom) : null;
      if (s) guide = s.point;
      return s ? s.time : t;
    };
    if (d.mode === "move") {
      const m = snapMove(o.start + dt, o.length, o.id);
      const start = m.start;
      guide = m.guide;
      next = { start: clamp(tidy(start), from, to - o.length), length: o.length, lane: laneAt(e.clientY, o.lane) };
    } else if (d.mode === "end") {
      next = { start: o.start, length: clamp(tidy(snapped(o.start + o.length + dt) - o.start), min, to - o.start), lane: o.lane };
    } else {
      const start = clamp(tidy(snapped(o.start + dt)), from, o.start + o.length - min);
      next = { start, length: tidy(o.start + o.length - start), lane: o.lane };
    }
    const moved = d.moved || Math.abs(dx) >= DRAG_THRESHOLD || next.lane !== o.lane;
    const updated: Drag = { ...d, next, guide, moved, reason: moved ? (validate?.(o.id, next) ?? null) : null };
    dragRef.current = updated;
    setDrag(updated);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!d.moved) {
      if (d.mode === "move") select(d.id, e.shiftKey || e.ctrlKey || e.metaKey);
      return;
    }
    if (d.reason) setSaid(d.reason);
    else commit(d.origin, d.next);
  };

  // --- the ruler and the current time --------------------------------------------------------
  const stepSize = tickStep(zoom);
  const ticks = React.useMemo(() => ticksBetween(from, to, stepSize), [from, to, stepSize]);
  const setPosition = (t: number) => onPositionChange?.(clamp(tidy(t), from, to));
  // The current time is React Aria's slider: the ruler is its track (a press or drag on it moves the
  // time), and the marker is its thumb. The value text goes through `formatTime`, and the keys are a
  // capture handler on the input (see `onSliderKey`), for the reasons in the opening comment.
  const scrubTrack = React.useRef<HTMLDivElement>(null);
  const scrubInput = React.useRef<HTMLInputElement>(null);
  const spokenTime = React.useMemo(
    () => ({ format: formatTime, formatRange: (a: number, b: number) => `${formatTime(a)} to ${formatTime(b)}`, resolvedOptions: () => ({ locale: "en-US" }) }) as unknown as Intl.NumberFormat,
    [formatTime],
  );
  const scrubState = useSliderState({
    minValue: from,
    maxValue: Math.max(to, from + 1e-9),
    step: 0.001,
    value: [clamp(position ?? from, from, to)],
    onChange: ([t]) => setPosition(t),
    numberFormatter: spokenTime,
    isDisabled: position === undefined || !onPositionChange,
  });
  const { trackProps: rulerProps } = useSlider({ "aria-label": "Current time", isDisabled: position === undefined || !onPositionChange }, scrubState, scrubTrack);
  const { thumbProps, inputProps } = useSliderThumb({ index: 0, trackRef: scrubTrack, inputRef: scrubInput, "aria-label": "Current time", isDisabled: position === undefined || !onPositionChange }, scrubState);
  const { focusProps, isFocusVisible } = useFocusRing();
  const onSliderKey = (e: React.KeyboardEvent) => {
    if (position === undefined) return;
    const big = e.shiftKey ? 10 : 1;
    const moves: Record<string, number> = { ArrowLeft: -step * big, ArrowDown: -step * big, ArrowRight: step * big, ArrowUp: step * big, PageDown: -step * 10, PageUp: step * 10 };
    if (e.key in moves) setPosition(position + moves[e.key]);
    else if (e.key === "Home") setPosition(from);
    else if (e.key === "End") setPosition(to);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!onZoomChange || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") onZoomChange(zoom * 1.5);
    else if (e.key === "-") onZoomChange(zoom / 1.5);
    else if (e.key === "0") onZoomChange(view.width / Math.max(to - from, 1e-6));
    else return;
    e.preventDefault();
  };

  // Ctrl or Cmd with the wheel zooms about the pointer (a plain wheel scrolls). Attached natively
  // because React's wheel listener is passive and cannot stop the page zooming.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || !onZoomChange) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoomChange(e.deltaY < 0 ? zoom * 1.25 : zoom / 1.25);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomChange, zoom]);

  const rovingId = focusId && items.some((i) => i.id === focusId) ? focusId : (sorted.get(lanes[0]?.id ?? "")?.[0]?.id ?? items[0]?.id ?? null);
  // Only items near the view are drawn, and always the focused one so focus is never lost.
  const lo = view.left - view.width;
  const hi = view.left + 2 * view.width;
  const visible = (i: TimelineItem) => i.id === focusId || i.id === rovingId || (x(i.start + i.length) >= lo && x(i.start) <= hi);

  const itemLabel = (i: TimelineItem) => `${i.label}, ${formatTime(i.start)} to ${formatTime(i.start + i.length)}, ${laneLabel(i.lane)}`;

  return (
    <div role="group" aria-label={label} onKeyDown={onKeyDown} className={cn("min-w-0 text-foreground", className)} style={{ "--lane-h": `calc(var(--control-h) * ${Math.max(laneRows, 1)})` } as React.CSSProperties}>
      <p role="status" className="sr-only">
        {said}
      </p>
      <div className="flex">
        <div className="w-max max-w-80 min-w-40 shrink-0 border-r border-border">
          <div className="h-8 border-b border-border" aria-hidden />
          {lanes.map((l) => (
            <div key={l.id} className="flex h-(--lane-h) items-center gap-1 border-b border-border px-2 type-label">
              <span className="min-w-0 flex-1 truncate" title={l.label}>
                {l.label}
              </span>
              {l.header}
            </div>
          ))}
        </div>
        <div ref={scroller} className="relative min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width }}>
            {/* The ruler: ticks and labels on a ladder of steps, thinned so they never collide, the end labels kept inside the axis. */}
            <div {...rulerProps} ref={scrubTrack} className="relative h-8 touch-none border-b border-border" data-ruler>
              {ticks.map((t) => {
                const px = x(t);
                const last = px > width - 40;
                return (
                  <span key={t} aria-hidden className="absolute top-0 h-full border-l border-border pl-1 type-caption text-muted-foreground tabular-nums" style={{ left: px, transform: last ? "translateX(-100%)" : undefined, borderLeftWidth: last ? 0 : 1, paddingRight: last ? 4 : 0 }}>
                    {formatTime === defaultFormat ? tickLabel(t, stepSize) : formatTime(t)}
                  </span>
                );
              })}
              {markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-label={`Marker: ${m.label}, ${formatTime(m.time)}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setPosition(m.time)}
                  className="absolute bottom-0 max-w-32 -translate-x-px truncate rounded-control border-l-2 border-foreground bg-muted px-1 type-caption"
                  style={{ left: x(m.time) }}
                >
                  {m.label}
                </button>
              ))}
              {position !== undefined && (
                <div {...thumbProps} className={cn("absolute top-0 -ml-2 h-full w-4 cursor-ew-resize", isFocusVisible && "outline-2 outline-offset-2 outline-ring")} style={{ left: x(position) }}>
                  <span aria-hidden className="mx-auto block size-3 rounded-pill bg-primary" />
                  <VisuallyHidden>
                    <input ref={scrubInput} {...mergeProps(inputProps, focusProps)} aria-labelledby={undefined} onKeyDownCapture={onSliderKey} />
                  </VisuallyHidden>
                </div>
              )}
            </div>
            {lanes.length === 0 && <div className="p-4">{empty}</div>}
            {lanes.map((l) => (
              <LaneRow
                key={l.id}
                label={l.label}
                register={(el) => void (el ? laneRefs.current.set(l.id, el) : laneRefs.current.delete(l.id))}
                types={dropsOn ? dropTypes : undefined}
                onHover={(px) => onLaneHover(l.id, px)}
                onLeave={() => setHover(null)}
                onDropItems={(px, dropped) => onLaneDrop(l.id, px, dropped)}
              >
                {hover && hover.next.lane === l.id && (
                  <div aria-hidden className={cn("pointer-events-none absolute top-1 bottom-1 rounded-control border border-dashed", hover.reason ? "border-danger bg-danger-subtle" : "border-primary bg-muted")} style={{ left: x(hover.next.start), width: Math.max(hover.next.length * zoom, 4) }} />
                )}
                {(sorted.get(l.id) ?? []).filter(visible).map((item) => {
                  const live = drag?.id === item.id && drag.moved ? drag : null;
                  // Stays mounted in its own lane while dragged (it holds the pointer capture) and is
                  // shifted by whole lanes to show where it would land.
                  const shown = live ? live.next : item;
                  const laneShift = live ? (laneIndex.get(live.next.lane) ?? 0) - (laneIndex.get(item.lane) ?? 0) : 0;
                  const isSel = selected.has(item.id);
                  const px = x(shown.start);
                  const w = Math.max(shown.length * zoom, 4);
                  return (
                    <div
                      key={item.id}
                      data-item={item.id}
                      role="button"
                      aria-pressed={isSel}
                      aria-label={itemLabel(item)}
                      tabIndex={item.id === rovingId ? 0 : -1}
                      onFocus={() => setFocusId(item.id)}
                      onKeyDown={(e) => onItemKeyDown(e, item)}
                      onPointerDown={(e) => begin(e, item, "move")}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      className={cn(
                        "absolute top-1 bottom-1 min-w-1 cursor-grab touch-none overflow-hidden rounded-control border border-input border-t-4 bg-background px-1.5 type-caption select-none",
                        isSel && "bg-muted font-medium outline-2 outline-offset-1 outline-primary",
                        live?.reason && "border-dashed border-danger bg-danger-subtle",
                      )}
                      style={{ left: px, width: w, borderTopColor: item.kind ? (kindColours?.[item.kind] ?? kindColour(item.kind, items)) : undefined, transform: laneShift ? `translateY(calc(var(--lane-h) * ${laneShift}))` : undefined, zIndex: live ? 10 : undefined }}
                    >
                      {renderItem ? renderItem(item, { selected: isSel, width: w }) : <DefaultItem item={item} width={w} />}
                      {/* Trim handles: pointer-only. The keyboard trims with Alt+arrows. */}
                      <span aria-hidden className="absolute inset-y-0 left-0 cursor-ew-resize touch-none" style={{ width: EDGE_PX }} onPointerDown={(e) => begin(e, item, "start")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
                      <span aria-hidden className="absolute inset-y-0 right-0 cursor-ew-resize touch-none" style={{ width: EDGE_PX }} onPointerDown={(e) => begin(e, item, "end")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
                    </div>
                  );
                })}
              </LaneRow>
            ))}
            {position !== undefined && <div aria-hidden className="pointer-events-none absolute top-8 bottom-0 w-0.5 bg-primary" style={{ left: x(position) - 1 }} />}
            {(() => {
              const guide = drag?.moved ? drag.guide : (hover?.guide ?? null);
              return guide !== null && <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-foreground" style={{ left: x(guide) }} />;
            })()}
          </div>
        </div>
      </div>
      {(() => {
        const info = drag?.moved ? { next: drag.next, reason: drag.reason } : hover;
        return (
          info && (
            <p aria-hidden className="mt-1 flex items-center gap-1.5 type-body-sm tabular-nums text-muted-foreground">
              {info.reason ? (
                <>
                  <Ban className="size-4 shrink-0 text-danger" />
                  <span className="text-danger">{info.reason}</span>
                </>
              ) : (
                <>
                  {formatTime(info.next.start)} to {formatTime(info.next.start + info.next.length)}, {laneLabel(info.next.lane)}
                </>
              )}
            </p>
          )
        );
      })()}
    </div>
  );
}

function kindColour(kind: string, items: readonly TimelineItem[]) {
  const kinds = [...new Set(items.map((i) => i.kind).filter(Boolean))] as string[];
  return `var(--chart-${(Math.max(kinds.indexOf(kind), 0) % 5) + 1})`;
}

function DefaultItem({ item, width }: { item: TimelineItem; width: number }) {
  return (
    <span className="flex h-full min-w-0 items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.kind && width > 120 && <span className="shrink-0 text-muted-foreground">{item.kind}</span>}
    </span>
  );
}

/** One lane: a labelled group that is a React Aria drop target when `types` is given. `px` is the pointer's distance along the lane, or null for a keyboard drag (the lane is then the focused element). */
function LaneRow({ label, register, types, onHover, onLeave, onDropItems, children }: { label: string; register: (el: HTMLDivElement | null) => void; types?: readonly string[]; onHover: (px: number | null) => void; onLeave: () => void; onDropItems: (px: number | null, items: DropItem[]) => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const keyboard = () => document.activeElement === ref.current;
  const { dropProps } = useDrop({
    ref,
    isDisabled: !types,
    // A pointer drag hands over a `DragTypes` and a keyboard (virtual) drag a plain `Set` (checked in
    // `DragManager`), and only the first takes an array in `has`, so each type is asked on its own.
    getDropOperation: (t) => (types?.some((type) => t.has(type)) ? "copy" : "cancel"),
    onDropEnter: (e) => onHover(keyboard() ? null : e.x),
    onDropMove: (e) => onHover(keyboard() ? null : e.x),
    onDropExit: onLeave,
    // A browser sends no drop for a refused type; a keyboard drag's event says so in `dropOperation`.
    onDrop: (e) => e.dropOperation !== "cancel" && onDropItems(keyboard() ? null : e.x, e.items),
  });
  return (
    <div
      {...(types ? dropProps : {})}
      ref={(el) => {
        ref.current = el;
        register(el);
      }}
      role="group"
      aria-label={label}
      // Focusable by script only: React Aria's keyboard drag moves focus to the lane it is over.
      tabIndex={types ? -1 : undefined}
      className="relative h-(--lane-h) border-b border-border"
    >
      {children}
    </div>
  );
}
