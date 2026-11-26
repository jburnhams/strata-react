import * as React from "react";

// The input every 3D viewer needs, written once (strata-react issue #386, from the quake2ts explorer, whose labs wrote an orbit
// camera, keys and words by hand beside `PanoramaViewer` and `SceneViewport`, which each had their own copy of the same three
// things). `PanoramaViewer` (looking from inside a sphere) and `SceneViewport` (round or through a scene) differ in what a drag
// does to the view, not in how a drag is read, so the reading is here and each viewer keeps its own meaning:
//
// - `useViewPointers`: one pointer drags (the viewer says what that turns), two pointers pinch, a press that did not move is a tap.
//   Pointer capture, focusing the viewer on press and the 4 px that tells a click from a drag are decided once.
// - `useWheelZoom`: a native, non-passive wheel listener (React's is passive, so the page would scroll too), with a test for
//   which wheels count: a panorama zooms on any wheel, a scene only with Ctrl or Cmd, so the page still scrolls past it.
// - `useSettledStatus`: the polite sentence said once the view has been still for a moment, never per frame, and not on first render.
//
// Checked: React Aria's `usePress` reports a press and its start and end with no movement, and `useMove` gives one pointer's
// deltas with no pinch or capture; a viewer needs both pointers and a tap in one gesture, so this is plain pointer events.

type Point = { x: number; y: number };

export type ViewPointerOptions = {
  /** One pointer moved while down: the change since its last event, and the event (for Shift and the buttons). Called once the drag is past `threshold`. */
  onDrag: (dx: number, dy: number, event: React.PointerEvent<HTMLElement>) => void;
  /** Two pointers: the earlier distance over the new one, so more than 1 is fingers coming together. Called with the event. */
  onPinch?: (ratio: number, event: React.PointerEvent<HTMLElement>) => void;
  /** A press that did not drag, or pinch, ended. */
  onTap?: (event: React.PointerEvent<HTMLElement>) => void;
  /** Called first on a press that is taken (a scene cancels its Reset animation here). */
  onDown?: (event: React.PointerEvent<HTMLElement>) => void;
  /** A press to leave alone (a button in the viewer, a secondary mouse button). Default: none. */
  ignore?: (event: React.PointerEvent<HTMLElement>) => boolean;
  /** Pixels a press must move before it is a drag. Default 4; 0 drags at once. */
  threshold?: number;
};

/** The pointer handlers of a viewer: spread them on the focusable box. Handlers are read fresh each event, so they may close over state. */
export function useViewPointers(options: ViewPointerOptions) {
  const live = React.useRef(options);
  live.current = options;
  const pointers = React.useRef(new Map<number, Point>());
  const gesture = React.useRef<{ moved: boolean; pinch: number | null; start: Point } | null>(null);
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };
  return React.useMemo(() => {
    const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
      if (live.current.ignore?.(e)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.currentTarget.focus({ preventScroll: true });
      live.current.onDown?.(e);
      gesture.current = { moved: false, pinch: spread(), start: { x: e.clientX, y: e.clientY } };
    };
    const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
      const last = pointers.current.get(e.pointerId);
      const g = gesture.current;
      if (!last || !g) return;
      const now = { x: e.clientX, y: e.clientY };
      pointers.current.set(e.pointerId, now);
      if (pointers.current.size === 2) {
        const d = spread();
        if (g.pinch && d) live.current.onPinch?.(g.pinch / d, e);
        g.pinch = d;
        g.moved = true;
        return;
      }
      const threshold = live.current.threshold ?? 4;
      if (!g.moved && Math.hypot(now.x - g.start.x, now.y - g.start.y) > threshold) g.moved = true;
      if (!g.moved) return;
      live.current.onDrag(now.x - last.x, now.y - last.y, e);
    };
    const end = (e: React.PointerEvent<HTMLElement>, tap: boolean) => {
      const g = gesture.current;
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) {
        gesture.current = null;
        if (tap && g && !g.moved) live.current.onTap?.(e);
      } else if (g) g.pinch = null;
    };
    return {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => end(e, true),
      // A cancelled pointer (the browser took a touch or pen gesture) leaves the gesture without a tap.
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => end(e, false),
    };
  }, []);
}

/** A wheel that zooms a viewer: `onZoom` gets a factor (above 1 is out). `when` says which wheels count; the rest scroll the page. */
export function useWheelZoom(
  ref: React.RefObject<HTMLElement | null>,
  onZoom: (factor: number, event: WheelEvent) => void,
  { when, enabled = true }: { when?: (event: WheelEvent) => boolean; enabled?: boolean } = {},
) {
  const live = React.useRef({ onZoom, when });
  live.current = { onZoom, when };
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      if (live.current.when && !live.current.when(e)) return;
      e.preventDefault();
      live.current.onZoom(Math.exp(e.deltaY * 0.0015), e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref, enabled]);
}

/** The words for a view, once it has been still for `ms`: "" until then and on first render, so a screen reader hears where it ended up, not every frame. */
export function useSettledStatus(words: string, ms = 600): string {
  const [said, setSaid] = React.useState("");
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setSaid(words), ms);
    return () => clearTimeout(t);
  }, [words, ms]);
  return said;
}
