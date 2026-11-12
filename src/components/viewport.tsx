import * as React from "react";
import { cn } from "../lib/utils";
import { FIT, clampViewport, viewportTransform, zoomAt, type Viewport } from "../lib/viewport";

// One picture's frame, with zoom and pan that other frames can share (strata-react issue: shared
// comparison and voting components). Judging two renderings of a photo is mostly looking at the same
// detail in both, so the viewport is state the caller holds and gives to every frame: zoom one, the
// other follows. `ViewportFrame` is only the frame; `Compare` holds the state and draws the controls.
//
// React Aria checked: Aria Components has no zoom or pan part, and its `useMove` (in the
// `react-aria` package, which is not a dependency here) only reports deltas that a pointer capture
// gives us as well, so the gestures are pointer events on the frame. Keyboard, which is not
// optional: the frame is focusable, `+` `-` `0` zoom and the arrow keys pan once zoomed in.
// Plain wheel scrolls the page (a frame in the middle of a page must not trap it); Ctrl or Cmd with
// the wheel zooms, which is also what a trackpad pinch sends. Touch pinch is not handled yet.

/** The caller's zoom and pan, and how to change them. */
export type ViewportState = { viewport: Viewport; setViewport: (next: Viewport) => void };

/** Zoom and pan held in React state, to give to every `ViewportFrame` that should move together. */
export function useViewport(initial: Viewport = FIT): ViewportState {
  const [viewport, setViewport] = React.useState(initial);
  return { viewport, setViewport };
}

const PAN_STEP = 48;

/** Props for `ViewportFrame`. */
export type ViewportFrameProps = ViewportState & {
  /** Names the frame for screen readers: "Picture A". Required. */
  label: string;
  /** Width over height of the frame before anything inside it has loaded. */
  aspect: number;
  children: React.ReactNode;
  /** A second picture layer above `children`, zoomed and panned with them but cut at `shown` percent of the *frame's* width from the left, so a swipe divider in `overlay` stays where the cut is at any zoom. */
  cover?: { content: React.ReactNode; shown: number };
  /** Drawn over the frame, not zoomed with it: a divider to drag, a corner label. Its pointer, key and double-click events do not reach the frame, so using it never pans the picture. */
  overlay?: React.ReactNode;
  /** The tallest the frame may be, as a CSS length (`"60svh"`). The width follows, narrower than the space it has and centred, so the picture keeps its shape. Default: no limit, the frame is as tall as its width and aspect make it. */
  maxHeight?: string;
  className?: string;
};

/** A clipped frame whose children zoom and pan together; the viewport is the caller's, so frames can share one. */
export const ViewportFrame = React.forwardRef<HTMLDivElement, ViewportFrameProps>(function ViewportFrame(
  { label, aspect, viewport, setViewport, children, cover, overlay, maxHeight, className },
  forwardedRef,
) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current!);
  const latest = React.useRef(viewport);
  latest.current = viewport;
  const drag = React.useRef<{ x: number; y: number } | null>(null);

  const size = () => {
    const r = ref.current!.getBoundingClientRect();
    return { width: r.width, height: r.height };
  };
  const fromCentre = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  // React attaches wheel listeners as passive, so preventing the browser's page zoom needs a native one.
  const setViewportRef = React.useRef(setViewport);
  setViewportRef.current = setViewport;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const at = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
      setViewportRef.current(zoomAt(latest.current, latest.current.scale * Math.exp(-e.deltaY / 200), at, { width: r.width, height: r.height }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = latest.current;
    const centre = { x: 0, y: 0 };
    if (e.key === "+" || e.key === "=") setViewport(zoomAt(v, v.scale * 1.5, centre, size()));
    else if (e.key === "-") setViewport(zoomAt(v, v.scale / 1.5, centre, size()));
    else if (e.key === "0") setViewport(FIT);
    else if (v.scale > 1 && e.key.startsWith("Arrow")) {
      // Arrow right looks right: the picture moves left.
      const dx = e.key === "ArrowRight" ? -PAN_STEP : e.key === "ArrowLeft" ? PAN_STEP : 0;
      const dy = e.key === "ArrowDown" ? -PAN_STEP : e.key === "ArrowUp" ? PAN_STEP : 0;
      setViewport(clampViewport({ ...v, x: v.x + dx, y: v.y + dy }, size()));
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const zoomed = viewport.scale > 1;
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      aria-roledescription="zoomable picture"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (!zoomed || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        setViewport(clampViewport({ ...latest.current, x: latest.current.x + dx, y: latest.current.y + dy }, size()));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={(e) => {
        const v = latest.current;
        setViewport(v.scale > 1 ? FIT : zoomAt(v, 2, fromCentre(e.clientX, e.clientY), size()));
      }}
      style={{ aspectRatio: String(aspect), ...(maxHeight ? { maxWidth: `calc(${maxHeight} * ${aspect})`, marginInline: "auto" } : {}), touchAction: zoomed ? "none" : "pan-y" }}
      className={cn(
        "relative w-full overflow-hidden rounded-surface border border-border bg-muted select-none",
        zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <div className="absolute inset-0" style={{ transform: viewportTransform(viewport), transformOrigin: "center" }}>
        {children}
      </div>
      {cover && (
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - cover.shown}% 0 0)` }}>
          <div className="absolute inset-0" style={{ transform: viewportTransform(viewport), transformOrigin: "center" }}>
            {cover.content}
          </div>
        </div>
      )}
      {overlay != null && (
        <div
          className="pointer-events-none absolute inset-0"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {overlay}
        </div>
      )}
    </div>
  );
});
