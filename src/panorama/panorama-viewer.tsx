import * as React from "react";
import { VisuallyHidden } from "react-aria";
import { useInView } from "../lib/in-view";
import { cn } from "../lib/utils";
import { Slider } from "../components/value-controls";
import { createRenderer, type PanoramaPicture, type PanoramaRenderer } from "./gl";
import { clampView, degreesPerPixel, describeView, project, projectFlat, unproject, unprojectFlat, type PanoramaPoint, type PanoramaSize, type PanoramaView } from "./projection";

// A 360 picture or video as a window you pan and zoom (strata-react issue #178, from strata-360, which
// drew equirectangular footage with a hand-written WebGL2 shader and its own pointer, transport and
// frame stepping). This is its own entry (`strata-react/panorama`) so an app that never shows 360 ships
// no GL code. Nothing else in the package is as far from React Aria's world, so the choices:
//
// - **The picture is a canvas, the controls are keys and pointers on a group.** React Aria has no 360
//   view, so the viewer is ours; what it can give, it gives: the field-of-view slider is Strata's
//   `Slider` (React Aria's), and the pointer handling is plain pointer events (React Aria's `usePress`
//   is for a press, not a drag that turns a sphere; checked in its props: it reports a press and its
//   start and end, with no movement).
// - **It does not own the video.** `video` is a ref to an element the app owns (`useMediaElement`,
//   `Transport`, `SeekBar` and `transportShortcuts` drive it as they drive any video, frame stepping
//   included). The viewer reads each new frame (`requestVideoFrameCallback`, else the element's events
//   and a frame loop while it plays) and uploads it: one texture upload per drawn frame, none for a
//   still picture, and no drawing at all while the viewer is off screen.
// - **The view is controlled from outside** (`view`/`onViewChange`: yaw, pitch and field of view, in
//   degrees; `defaultView` to let it hold its own). It never animates: a view set from outside is
//   drawn at once, so an app's aim modes (follow a heading, a person, a point) are the app's own
//   function of time, and its pan on top is just another view.
// - **From the keyboard and by touch, as well as the mouse**: arrow keys pan (Shift for more), `+` and
//   `-` zoom, `0` goes home; a drag pans (the picture follows the pointer), a wheel and a pinch zoom,
//   and a click that did not drag is `onPick` with the direction under it. A field-of-view slider is
//   an option. `maxPitch` stops the view short of the poles, where "up" stops meaning anything.
// - **An overlay in the picture's coordinates**: `overlay` gets `project(yaw, pitch)` (the place in the
//   box, or null behind the camera), `unproject(x, y)` (the direction under a place) and the view, so
//   an app draws markers, aim dots and frame outlines in DOM, where they are text and buttons and take
//   focus. The same maths (projection.ts, with no GL) drives the shader.
// - **Said in words.** The canvas is an image named by `label` and where it looks ("Looking 40° right,
//   5° up"), always current; a polite status says it once the view has been still for a moment, never
//   per frame.
// - **No WebGL2, no blank box**: the flat picture is drawn instead, cropped to the same window with the
//   same controls, and a line says so. `project` and `unproject` follow the flat drawing there, so
//   overlay markers still sit on what they mark.
//
// A GL context that is lost (a GPU reset, a tab in the background on a phone) is restored without the
// app doing anything: the picture is sent again and the view redrawn.

export type PanoramaPictureSource = { image: string; video?: never } | { video: React.RefObject<HTMLVideoElement | null>; image?: never };

/** What an overlay is given. */
export type PanoramaOverlayApi = {
  view: PanoramaView;
  size: PanoramaSize;
  /** Where the direction is in the box, or null behind the camera. */
  project: (yaw: number, pitch: number) => PanoramaPoint | null;
  /** The direction under a place in the box. */
  unproject: (x: number, y: number) => { yaw: number; pitch: number };
  /** The flat picture is being drawn (no WebGL2). */
  flat: boolean;
};

export type PanoramaViewerProps = PanoramaPictureSource & {
  /** Names the viewer: "360 view of the kitchen". Required; the current direction is added to it. */
  label: string;
  /** The view, when the app holds it. */
  view?: PanoramaView;
  /** The view the viewer starts with, when it holds its own. Default straight ahead at 90°. */
  defaultView?: PanoramaView;
  /** The view changed (a drag, a key, a wheel, the slider). Not called for a view the app set. */
  onViewChange?: (view: PanoramaView) => void;
  /** A click that did not drag: the direction under it. */
  onPick?: (direction: { yaw: number; pitch: number }) => void;
  /** Highest and lowest look, degrees from the horizon. Default 85. */
  maxPitch?: number;
  /** Narrowest and widest field of view, degrees. Default 20 and 120. */
  minFov?: number;
  maxFov?: number;
  /** Zoom with the wheel. Default true. */
  wheelZoom?: boolean;
  /** Show a field-of-view slider under the picture. */
  fovSlider?: boolean;
  /** Markers and outlines drawn over the picture in its own coordinates. */
  overlay?: (api: PanoramaOverlayApi) => React.ReactNode;
  /** `"flat"` draws the flat picture even where WebGL2 is available (a low-power mode, or to see what a browser without it shows). Default `"auto"`. */
  mode?: "auto" | "flat";
  /** The shape of the box. Default 16/9. */
  aspect?: number | `${number}/${number}`;
  className?: string;
};

const HOME: PanoramaView = { yaw: 0, pitch: 0, fov: 90 };
const STILL_MS = 600;

/** A 360 picture or video as a window you pan and zoom, controlled from outside, with an overlay in the picture's coordinates. */
export function PanoramaViewer({ label, image, video, view: controlled, defaultView = HOME, onViewChange, onPick, maxPitch = 85, minFov = 20, maxFov = 120, wheelZoom = true, fovSlider = false, overlay, mode = "auto", aspect = "16/9", className }: PanoramaViewerProps) {
  const limits = React.useMemo(() => ({ maxPitch, minFov, maxFov }), [maxPitch, minFov, maxFov]);
  const [own, setOwn] = React.useState(() => clampView(defaultView, limits));
  const view = React.useMemo(() => clampView(controlled ?? own, limits), [controlled, own, limits]);
  const live = React.useRef({ view, controlled: controlled !== undefined, onViewChange, onPick, limits });
  live.current = { view, controlled: controlled !== undefined, onViewChange, onPick, limits };
  const change = React.useCallback((next: PanoramaView) => {
    const l = live.current;
    const clamped = clampView(next, l.limits);
    if (!l.controlled) setOwn(clamped);
    l.onViewChange?.(clamped);
  }, []);

  // The box, and the canvas in it.
  const box = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const [size, setSize] = React.useState<PanoramaSize>({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The picture: a still is loaded once; a video is the app's element.
  const [still, setStill] = React.useState<HTMLImageElement | null>(null);
  React.useEffect(() => {
    if (image === undefined) {
      setStill(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    let cancelled = false;
    img.onload = () => !cancelled && setStill(img);
    img.src = image;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [image]);

  // Drawing: only when something changed, and only while on screen.
  const { ref: visibleRef, inView } = useInView({ unsupported: true });
  // One stable callback: an inline one is called with null and the element on every render, and `useInView` would watch it come and go.
  const boxRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el;
      visibleRef(el);
    },
    [visibleRef],
  );
  const renderer = React.useRef<PanoramaRenderer | null>(null);
  const [flat, setFlat] = React.useState(false);
  const frame = React.useRef(0);
  const dirtyPicture = React.useRef(true);
  const current = React.useRef({ size, inView, flat });
  current.current = { size, inView, flat };

  const pictureNow = React.useCallback((): PanoramaPicture | null => {
    const v = video?.current;
    if (v) return v.readyState >= 2 && v.videoWidth > 0 ? v : null;
    return still;
  }, [video, still]);

  const paint = React.useCallback(() => {
    frame.current = 0;
    const c = canvas.current;
    const { size: s, inView: visible } = current.current;
    if (!c || !visible || s.width === 0 || s.height === 0) return;
    const picture = pictureNow();
    const dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 2);
    const w = Math.max(1, Math.round(s.width * dpr));
    const h = Math.max(1, Math.round(s.height * dpr));
    if (current.current.flat) {
      const ctx = c.getContext("2d");
      if (!ctx) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      if (!picture) return;
      const sw = (picture as HTMLImageElement).naturalWidth || (picture as HTMLVideoElement).videoWidth || c.width;
      const sh = (picture as HTMLImageElement).naturalHeight || (picture as HTMLVideoElement).videoHeight || c.height;
      const v = live.current.view;
      const wide = (v.fov / 360) * sw;
      const tall = ((v.fov * (s.height / s.width)) / 180) * sh;
      const left = ((v.yaw - v.fov / 2 + 180) / 360) * sw;
      const top = ((90 - v.pitch) / 180) * sh - tall / 2;
      // Across the seam the window is two pieces of the picture side by side.
      for (const shift of [-sw, 0, sw]) {
        const a = Math.max(left + shift, 0);
        const b = Math.min(left + shift + wide, sw);
        if (b > a) ctx.drawImage(picture as CanvasImageSource, a, Math.max(top, 0), b - a, Math.min(tall, sh), ((a - (left + shift)) / wide) * w, 0, ((b - a) / wide) * w, h);
      }
      return;
    }
    const r = renderer.current;
    if (!r) return;
    if (picture && dirtyPicture.current) {
      r.upload(picture);
      dirtyPicture.current = false;
    }
    r.draw(live.current.view, w, h);
  }, [pictureNow]);
  const schedule = React.useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(paint);
  }, [paint]);

  // The renderer: made once, restored if the context is lost, and the flat picture if there is none.
  React.useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const make = () => {
      renderer.current?.dispose();
      renderer.current = mode === "flat" ? null : createRenderer(c);
      setFlat(renderer.current === null);
      dirtyPicture.current = true;
      schedule();
    };
    make();
    const lost = (e: Event) => {
      e.preventDefault();
      renderer.current = null;
    };
    c.addEventListener("webglcontextlost", lost);
    c.addEventListener("webglcontextrestored", make);
    return () => {
      c.removeEventListener("webglcontextlost", lost);
      c.removeEventListener("webglcontextrestored", make);
      renderer.current?.dispose();
      renderer.current = null;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [schedule, mode]);

  // A new still, a new size, a new view, or coming into view: draw.
  React.useEffect(() => {
    dirtyPicture.current = true;
  }, [still]);
  React.useEffect(() => {
    schedule();
  }, [schedule, view.yaw, view.pitch, view.fov, size.width, size.height, still, inView, flat]);

  // A video: each new frame is one upload and one draw.
  React.useEffect(() => {
    const v = video?.current;
    if (!v || !inView) return;
    let stopped = false;
    let handle = 0;
    const onFrame = () => {
      if (stopped) return;
      dirtyPicture.current = true;
      schedule();
      handle = v.requestVideoFrameCallback(onFrame);
    };
    if (typeof v.requestVideoFrameCallback === "function") {
      handle = v.requestVideoFrameCallback(onFrame);
      return () => {
        stopped = true;
        v.cancelVideoFrameCallback?.(handle);
      };
    }
    // No frame callback: the element's own events, and a frame loop while it plays.
    const touch = () => {
      dirtyPicture.current = true;
      schedule();
    };
    const events = ["loadeddata", "seeked", "timeupdate", "play", "pause"] as const;
    for (const e of events) v.addEventListener(e, touch);
    let loop = 0;
    const tick = () => {
      if (!v.paused) touch();
      loop = requestAnimationFrame(tick);
    };
    loop = requestAnimationFrame(tick);
    return () => {
      for (const e of events) v.removeEventListener(e, touch);
      cancelAnimationFrame(loop);
    };
  }, [video, inView, schedule]);

  // Pointer: drag turns the view with the pointer, two pointers pinch, a click that did not drag picks.
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const gesture = React.useRef<{ moved: boolean; pinch: number | null; start: { x: number; y: number } } | null>(null);
  const hostRect = () => box.current!.getBoundingClientRect();
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [first, second] = [...pointers.current.values()];
    const distance = second ? Math.hypot(first.x - second.x, first.y - second.y) : null;
    gesture.current = { moved: false, pinch: distance, start: { x: e.clientX, y: e.clientY } };
    e.currentTarget.focus({ preventScroll: true });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId);
    if (!last || !gesture.current) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    const v = live.current.view;
    const s = { width: hostRect().width, height: hostRect().height };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinch && d > 0) change({ ...v, fov: v.fov * (gesture.current.pinch / d) });
      gesture.current.pinch = d;
      gesture.current.moved = true;
      return;
    }
    if (Math.hypot(now.x - gesture.current.start.x, now.y - gesture.current.start.y) > 4) gesture.current.moved = true;
    if (!gesture.current.moved) return;
    // The picture follows the pointer: dragging right turns the view left.
    const per = degreesPerPixel(v, s);
    change({ ...v, yaw: v.yaw - (now.x - last.x) * per, pitch: v.pitch + (now.y - last.y) * per });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      if (g && !g.moved && live.current.onPick) {
        const r = hostRect();
        const s = { width: r.width, height: r.height };
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        live.current.onPick(current.current.flat ? unprojectFlat(live.current.view, s, x, y) : unproject(live.current.view, s, x, y));
      }
    } else if (g) g.pinch = null;
  };

  // The wheel zooms; native, because React's wheel listener is passive and the page must not scroll too.
  React.useEffect(() => {
    const el = box.current;
    if (!el || !wheelZoom) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = live.current.view;
      change({ ...v, fov: v.fov * Math.exp(e.deltaY * 0.0015) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wheelZoom, change]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = live.current.view;
    const turn = (v.fov / 12) * (e.shiftKey ? 3 : 1);
    if (e.key === "ArrowLeft") change({ ...v, yaw: v.yaw - turn });
    else if (e.key === "ArrowRight") change({ ...v, yaw: v.yaw + turn });
    else if (e.key === "ArrowUp") change({ ...v, pitch: v.pitch + turn });
    else if (e.key === "ArrowDown") change({ ...v, pitch: v.pitch - turn });
    else if (e.key === "+" || e.key === "=") change({ ...v, fov: v.fov * 0.8 });
    else if (e.key === "-" || e.key === "_") change({ ...v, fov: v.fov * 1.25 });
    else if (e.key === "0") change(defaultView);
    else return;
    e.preventDefault();
  };

  // Said in words: always on the picture; politely once the view has been still for a moment.
  const direction = describeView(view);
  const [said, setSaid] = React.useState("");
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => setSaid(`${direction}, field of view ${Math.round(view.fov)}°`), STILL_MS);
    return () => clearTimeout(t);
  }, [direction, view.fov]);

  const api: PanoramaOverlayApi = {
    view,
    size,
    flat,
    project: (yaw, pitch) => (flat ? projectFlat(view, size, yaw, pitch) : project(view, size, yaw, pitch)),
    unproject: (x, y) => (flat ? unprojectFlat(view, size, x, y) : unproject(view, size, x, y)),
  };
  const slider = fovSlider ? <Slider aria-label="Field of view" value={Math.round(view.fov)} onChange={(fov) => change({ ...view, fov })} min={minFov} max={maxFov} step={1} unit="degree" /> : null;

  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <div
        ref={boxRef}
        role="group"
        aria-label={label}
        aria-describedby={undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-surface bg-surface-sunken select-none active:cursor-grabbing"
        style={{ aspectRatio: aspect }}
      >
        <canvas key={mode === "flat" ? "2d" : "gl"} ref={canvas} role="img" aria-label={`${label}. ${direction}, field of view ${Math.round(view.fov)}°`} className="absolute inset-0 size-full" />
        {overlay && size.width > 0 && <div className="pointer-events-none absolute inset-0">{overlay(api)}</div>}
      </div>
      {flat && <p className="type-body-sm text-muted-foreground">This browser cannot draw the 360 view, so the flat picture is shown. The controls work the same.</p>}
      {slider}
      <VisuallyHidden>
        <span role="status">{said}</span>
      </VisuallyHidden>
    </div>
  );
}
