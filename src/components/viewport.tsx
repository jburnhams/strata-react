import * as React from "react";
import { cn } from "../lib/utils";
import { FIT, clampViewport, viewportTransform, zoomAt, type ShareBox, type Viewport } from "../lib/viewport";

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
//
// Click to choose (issue #201). A frame that is one side of a judgment can take a click as the
// answer: `pick` says where a click would choose and what (a `PickZone`: a stretch of the frame's
// width, so a swipe's two halves are two zones), and gets called with the zone for a click. Click
// versus pan is decided by the pointer, not by a mode: down and up within 4 px and 500 ms is a click,
// anything that moves is the pan it always was. A click waits out the double-click window (300 ms)
// before it counts, because a double click zooms and must not also answer; a second press cancels
// the first. While the pointer is over a zone the zone is outlined and the words say what a click
// does ("Click to choose A"), and the same words are the frame's description for assistive
// technology (the keys and the vote bar stay the way to answer; this is a pointer convenience).
// React Aria checked: `usePress` would give a press, but not the pan-or-click decision (it ends a
// press when the pointer leaves, it does not know a drag from a click by distance), so the frame
// keeps its own pointer events, as it already does for panning.

/** The caller's zoom and pan, and how to change them. */
export type ViewportState = { viewport: Viewport; setViewport: (next: Viewport) => void };

/** Zoom and pan held in React state, to give to every `ViewportFrame` that should move together. */
export function useViewport(initial: Viewport = FIT): ViewportState {
  const [viewport, setViewport] = React.useState(initial);
  return { viewport, setViewport };
}

const PAN_STEP = 48;
/** A pointer that moves further than this between down and up is a pan, not a click. */
const CLICK_SLOP = 4;
/** A press held longer than this is not a click. */
const CLICK_MAX_MS = 500;
/** A click counts only once this long has passed with no second press: a double click zooms instead. */
const DOUBLE_CLICK_MS = 300;

/** Where a click on a frame would choose: a stretch of the frame's width as shares (0 to 1), what it chooses and what to say about it. */
export type PickZone = { value: string; from: number; to: number; hint: string };

/** How a frame takes a click as a choice. */
export type FramePick = {
  /** The zone under a pointer at `x` (0 to 1 across the frame), or null where a click chooses nothing. */
  zoneAt: (x: number) => PickZone | null;
  /** A click happened in `zone`. */
  onPick: (zone: PickZone) => void;
  /** What the frame is described as for assistive technology: "Click to choose A". */
  describe: string;
};

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
  /** Shift-drag draws a rectangle on the frame and calls this with it when let go (pixels from the frame's top left). Without it Shift-drag does nothing special. */
  onBox?: (rect: { x0: number; y0: number; x1: number; y1: number }) => void;
  /** A box to outline on the whole picture (a region being pointed at), as shares of it. Drawn only while the picture is fitted. */
  outline?: ShareBox | null;
  /** Take a click (not a drag, not a double click) as a choice: see the note at the top of the file. Without it a click does nothing, as before. */
  pick?: FramePick;
  className?: string;
};

/** A clipped frame whose children zoom and pan together; the viewport is the caller's, so frames can share one. */
export const ViewportFrame = React.forwardRef<HTMLDivElement, ViewportFrameProps>(function ViewportFrame(
  { label, aspect, viewport, setViewport, children, cover, overlay, maxHeight, onBox, outline, pick, className },
  forwardedRef,
) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current!);
  const latest = React.useRef(viewport);
  latest.current = viewport;
  const drag = React.useRef<{ x: number; y: number } | null>(null);
  // A rectangle being drawn with Shift held (frame pixels), which asks for a region instead of panning.
  const [band, setBand] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const bandRef = React.useRef(band);
  bandRef.current = band;
  // Click to choose: where a press started, the zone the pointer is over, and the choice waiting out the double-click window.
  const pickRef = React.useRef(pick);
  pickRef.current = pick;
  const press = React.useRef<{ x: number; y: number; at: number } | null>(null);
  const waiting = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hover, setHover] = React.useState<PickZone | null>(null);
  const describeId = React.useId();
  const cancelPick = () => {
    if (waiting.current !== null) clearTimeout(waiting.current);
    waiting.current = null;
  };
  React.useEffect(() => cancelPick, []);
  // 0 to 1 across the frame; the middle of it when it has no size (a test with no layout).
  const shareAcross = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return r.width > 0 ? Math.min(Math.max((clientX - r.left) / r.width, 0), 1) : 0.5;
  };
  const inFrame = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

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
      aria-describedby={pick ? describeId : undefined}
      onPointerDown={(e) => {
        cancelPick();
        press.current = pickRef.current && e.button === 0 && !e.shiftKey ? { x: e.clientX, y: e.clientY, at: e.timeStamp } : null;
        if (e.shiftKey && onBox && e.button === 0) {
          const p = inFrame(e.clientX, e.clientY);
          setBand({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          e.currentTarget.setPointerCapture?.(e.pointerId);
          return;
        }
        if (!zoomed || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (pickRef.current && e.pointerType !== "touch") {
          const zone = pickRef.current.zoneAt(shareAcross(e.clientX));
          setHover((prev) => (prev?.value === zone?.value && prev?.from === zone?.from && prev?.to === zone?.to ? prev : zone));
        }
        if (bandRef.current) {
          const p = inFrame(e.clientX, e.clientY);
          setBand({ ...bandRef.current, x1: p.x, y1: p.y });
          return;
        }
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        setViewport(clampViewport({ ...latest.current, x: latest.current.x + dx, y: latest.current.y + dy }, size()));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        const down = press.current;
        press.current = null;
        if (down && pickRef.current && !bandRef.current && e.timeStamp - down.at <= CLICK_MAX_MS && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= CLICK_SLOP) {
          const zone = pickRef.current.zoneAt(shareAcross(e.clientX));
          if (zone) {
            cancelPick();
            waiting.current = setTimeout(() => {
              waiting.current = null;
              pickRef.current?.onPick(zone);
            }, DOUBLE_CLICK_MS);
          }
        }
        const b = bandRef.current;
        if (b) {
          setBand(null);
          if (Math.abs(b.x1 - b.x0) > 6 && Math.abs(b.y1 - b.y0) > 6) onBox?.(b);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        press.current = null;
        setBand(null);
      }}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={(e) => {
        cancelPick();
        const v = latest.current;
        setViewport(v.scale > 1 ? FIT : zoomAt(v, 2, fromCentre(e.clientX, e.clientY), size()));
      }}
      style={{ aspectRatio: String(aspect), ...(maxHeight ? { maxWidth: `calc(${maxHeight} * ${aspect})`, marginInline: "auto" } : {}), touchAction: zoomed ? "none" : "pan-y" }}
      className={cn(
        "relative w-full overflow-hidden rounded-surface border border-border bg-muted select-none",
        zoomed ? "cursor-grab active:cursor-grabbing" : pick ? "cursor-pointer" : "cursor-zoom-in",
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
      {outline && viewport.scale === 1 && (
        <div aria-hidden className="pointer-events-none absolute border-2 border-foreground ring-1 ring-background" style={{ left: `${outline[0] * 100}%`, top: `${outline[1] * 100}%`, width: `${outline[2] * 100}%`, height: `${outline[3] * 100}%` }} />
      )}
      {pick && hover && !band && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 border-2 border-primary ring-1 ring-background" style={{ left: `${hover.from * 100}%`, width: `${(hover.to - hover.from) * 100}%` }} />
          <p aria-hidden className="pointer-events-none absolute top-2 -translate-x-1/2 whitespace-nowrap rounded-pill border border-border bg-background px-2 py-0.5 type-caption text-foreground" style={{ left: `${((hover.from + hover.to) / 2) * 100}%` }}>
            {hover.hint}
          </p>
        </>
      )}
      {pick && (
        <span id={describeId} className="sr-only">
          {pick.describe}
        </span>
      )}
      {band && <div aria-hidden className="pointer-events-none absolute border-2 border-dashed border-foreground" style={{ left: Math.min(band.x0, band.x1), top: Math.min(band.y0, band.y1), width: Math.abs(band.x1 - band.x0), height: Math.abs(band.y1 - band.y0) }} />}
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
