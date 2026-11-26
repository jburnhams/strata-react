import * as React from "react";
import { RotateCcw } from "lucide-react";
import { VisuallyHidden } from "react-aria";
import { Button } from "../components/button";
import { useInView } from "../lib/in-view";
import { useSettledStatus, useViewPointers, useWheelZoom } from "../lib/viewer-input";
import { cn } from "../lib/utils";
import { clampCamera, describeCamera, dolly, frameFor, pan, turn, walk, type CameraLimits, type OrbitCamera, type SceneFrame } from "./camera";

// A frame for a 3D scene the app draws itself, that a person orbits, pans and zooms (issue #370, from the
// Quake 2 explorer, which drew maps and models with its own camera code and controls). `PanoramaViewer`
// is a WebGL view you look around from *inside*; this is the other kind: the app owns the drawing, Strata
// owns the frame and the input, and everything Strata owns is what each app otherwise rewrites: pointer
// capture, wheel zoom, keyboard control, a reset, a resize observer, a lost context, and what a screen
// reader hears. Its own entry (`strata-react/scene`), like `strata-react/panorama`, so an app without 3D
// ships none of it. No dependency: the camera maths is in `camera.ts`, and the context is the browser's.
//
// - **The app draws.** `render(gl, frame)` is called when the camera, the size or `invalidate()` changes
//   something, never on a timer (unless `continuous`, for a scene that moves by itself). `frame` has the
//   matrices and the eye, and the viewport is already set. A context made again after a loss bumps
//   `frame.context`, so the app knows to recreate what lived on the old one.
// - **The camera is the app's to hold** (`useOrbitCamera`, or `camera` and `onCameraChange` of its own),
//   so a link, a saved view or a "focus on this" button just sets it, and the viewport never animates a
//   change it did not make. The one move it animates is Reset (300 ms ease), and not at all under reduced
//   motion.
// - **Input.** Orbit by drag; pan by right drag, middle drag or Shift+drag; zoom by Ctrl or Cmd with the
//   wheel (which is also what a trackpad pinch sends) and by a two-finger pinch. A plain wheel scrolls the
//   page, as `ViewportFrame` does, since a 3D view in the middle of a page must not trap it. Keyboard, with
//   the frame focused: arrows orbit (Shift pans), `+` and `-` zoom, `0` resets. Touch is one finger to
//   orbit, two to pinch.
// - **Fly mode** (`mode="fly"`, for a map walkthrough): the same camera with `distance` 0, so it is the eye.
//   Drag looks (the picture follows the pointer), W A S D and the arrows walk and strafe, Q and E go down and
//   up, Shift is faster; keys held move on every frame, and under reduced motion each press is one step.
// - **Said in words.** The canvas is an `img` named by `label` and the camera ("Looking at 0, 2, 0 from 5
//   away, turned 45° right"), always current, and a polite status says it once the camera has been still a
//   moment, never per frame. A Reset button is always there: a keyboard or touch person has no `0` key
//   to find, and a lost camera needs one visible way home.
// - **No WebGL, no blank box**: a line says so, and the controls are not drawn.
// React Aria first: there is no 3D part, so the frame is ours; the Reset button is Strata's `Button`
// (React Aria's), and the camera maths is plain functions with tests.

/** What a `SceneViewport` hands the app to hold: the camera, and ways to move it that obey the limits. */
export type OrbitCameraState = {
  camera: OrbitCamera;
  setCamera: (next: OrbitCamera) => void;
  /** Back to the camera the hook started with (the viewport's Reset button does this, animated). */
  home: OrbitCamera;
};

/** A camera the app holds: `{ target, distance, yaw, pitch }` to start from, and the limits it is kept inside. Give `camera` and `setCamera` to `SceneViewport`. */
export function useOrbitCamera(initial: Partial<OrbitCamera> = {}, limits: Partial<CameraLimits> = {}): OrbitCameraState {
  const home = React.useMemo<OrbitCamera>(
    () => clampCamera({ target: initial.target ?? [0, 0, 0], distance: initial.distance ?? 5, yaw: initial.yaw ?? 0, pitch: initial.pitch ?? 20 }, limits),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [camera, set] = React.useState<OrbitCamera>(home);
  const bounds = React.useRef(limits);
  bounds.current = limits;
  const setCamera = React.useCallback((next: OrbitCamera) => set(clampCamera(next, bounds.current)), []);
  return { camera, setCamera, home };
}

export type SceneViewportProps = {
  /** Names the view: "Map e1m1". The camera in words is added to it. Required. */
  label: string;
  /** The camera, from `useOrbitCamera`. */
  camera: OrbitCamera;
  onCameraChange: (camera: OrbitCamera) => void;
  /** Where Reset goes. Default: the camera the viewport first had. */
  home?: OrbitCamera;
  /** Draws the scene. Called when the camera or size changed, or after `invalidate()`; the viewport is set. */
  render: (gl: WebGL2RenderingContext, frame: SceneFrame) => void;
  /** `"orbit"` (default) circles a target; `"fly"` is the eye itself, for a walkthrough. */
  mode?: "orbit" | "fly";
  /** The vertical field of view in degrees. Default 60. */
  fov?: number;
  near?: number;
  far?: number;
  /** Closest and furthest an orbit camera may be, and the highest and lowest look in degrees. Defaults 0, none, 89. */
  limits?: Partial<CameraLimits>;
  /** World units a second of fly walking covers. Default 5. */
  flySpeed?: number;
  /** The scene's time in seconds, from a `useTimeline` clock (issue #386): the scene is drawn again when it changes, with `frame.time` set, so a recorded run or a replay scrubs and plays like a video under `TimelinePlayer`. Default: no time. */
  time?: number;
  /** Redraw every frame while on screen, for a scene that moves by itself. Default false: draw on change. */
  continuous?: boolean;
  /** The shape of the box. Default 16/9. */
  aspect?: number | `${number}/${number}`;
  /** A handle for `invalidate()` (a texture finished loading) and the canvas. */
  handle?: React.Ref<SceneViewportHandle>;
  className?: string;
};

/** What `handle` gives: ask for a redraw, and the canvas. */
export type SceneViewportHandle = { invalidate: () => void; canvas: HTMLCanvasElement | null };

const STILL_MS = 600;
const RESET_MS = 300;
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A sized, focusable canvas for a 3D scene the app draws: orbit by drag, pan by right drag or Shift, zoom by Ctrl/Cmd+wheel or pinch, keys, a Reset button, a fly mode, a lost context restored, and the camera in words. */
export function SceneViewport({ label, camera, onCameraChange, home, render, mode = "orbit", fov = 60, near = 0.1, far = 10_000, limits, flySpeed = 5, time = 0, continuous = false, aspect = "16/9", handle, className }: SceneViewportProps) {
  const first = React.useRef(camera);
  const target = home ?? first.current;
  const live = React.useRef({ camera, onCameraChange, render, mode, fov, near, far, limits, flySpeed, home: target, time });
  live.current = { camera, onCameraChange, render, mode, fov, near, far, limits, flySpeed, home: target, time };
  const change = React.useCallback((next: OrbitCamera) => {
    live.current.onCameraChange(clampCamera(next, live.current.limits));
  }, []);

  const box = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
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

  // Drawing: only when something changed, and only while on screen.
  const { ref: visibleRef, inView } = useInView({ unsupported: true });
  const boxRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el;
      visibleRef(el);
    },
    [visibleRef],
  );
  const gl = React.useRef<WebGL2RenderingContext | null>(null);
  const context = React.useRef(0);
  const [unavailable, setUnavailable] = React.useState(false);
  const frameHandle = React.useRef(0);
  const current = React.useRef({ size, inView, continuous });
  current.current = { size, inView, continuous };

  const paint = React.useCallback(() => {
    frameHandle.current = 0;
    const c = canvas.current;
    const ctx = gl.current;
    const { size: s, inView: visible, continuous: again } = current.current;
    if (!c || !ctx || !visible || s.width === 0 || s.height === 0) return;
    const dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 2);
    const w = Math.max(1, Math.round(s.width * dpr));
    const h = Math.max(1, Math.round(s.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    ctx.viewport(0, 0, w, h);
    const l = live.current;
    l.render(ctx, frameFor(l.camera, w, h, { fov: l.fov, near: l.near, far: l.far, context: context.current, time: l.time }));
    if (again) frameHandle.current = requestAnimationFrame(paint);
  }, []);
  const schedule = React.useCallback(() => {
    if (frameHandle.current === 0) frameHandle.current = requestAnimationFrame(paint);
  }, [paint]);
  React.useImperativeHandle(handle, () => ({ invalidate: schedule, canvas: canvas.current }), [schedule]);

  // The context: made once, made again when restored after a loss (the app sees `frame.context` change).
  React.useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const make = () => {
      gl.current = c.getContext("webgl2") as WebGL2RenderingContext | null;
      setUnavailable(gl.current === null);
      if (gl.current) context.current += 1;
      schedule();
    };
    make();
    const lost = (e: Event) => {
      e.preventDefault();
      gl.current = null;
    };
    c.addEventListener("webglcontextlost", lost);
    c.addEventListener("webglcontextrestored", make);
    return () => {
      c.removeEventListener("webglcontextlost", lost);
      c.removeEventListener("webglcontextrestored", make);
      if (frameHandle.current) cancelAnimationFrame(frameHandle.current);
      frameHandle.current = 0;
    };
  }, [schedule]);
  React.useEffect(() => {
    schedule();
  }, [schedule, camera, size.width, size.height, inView, fov, near, far, continuous, time]);

  // Reset: animated unless the person asked for less motion.
  const animation = React.useRef(0);
  const reset = () => {
    cancelAnimationFrame(animation.current);
    const from = live.current.camera;
    const to = live.current.home;
    if (reducedMotion()) return change(to);
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / RESET_MS);
      const e = 1 - (1 - t) ** 3;
      const mix = (a: number, b: number) => a + (b - a) * e;
      // The short way round in yaw.
      const dyaw = ((((to.yaw - from.yaw + 180) % 360) + 360) % 360) - 180;
      change({
        target: [mix(from.target[0], to.target[0]), mix(from.target[1], to.target[1]), mix(from.target[2], to.target[2])],
        distance: mix(from.distance, to.distance),
        yaw: from.yaw + dyaw * e,
        pitch: mix(from.pitch, to.pitch),
      });
      if (t < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  };
  React.useEffect(() => () => cancelAnimationFrame(animation.current), []);

  // Pointer: drag orbits (or looks), a right drag or Shift pans, two pointers pinch (`useViewPointers`).
  const pointers = useViewPointers({
    threshold: 0,
    ignore: (e) => e.target instanceof HTMLButtonElement,
    onDown: () => cancelAnimationFrame(animation.current),
    onPinch: (ratio) => {
      const l = live.current;
      if (l.mode === "orbit") change(dolly(l.camera, ratio));
    },
    onDrag: (dx, dy, e) => {
      const l = live.current;
      const panning = e.shiftKey || (e.buttons & 6) !== 0; // Shift, or the right or middle button
      change(panning ? pan(l.camera, dx, dy, size.height, l.fov) : turn(l.camera, dx, dy, l.mode));
    },
  });

  // The wheel zooms only with Ctrl or Cmd (a trackpad pinch sends Ctrl); a plain wheel scrolls the page.
  useWheelZoom(
    box,
    (factor, e) => {
      const l = live.current;
      if (l.mode === "orbit") change(dolly(l.camera, factor));
      else change(walk(l.camera, -e.deltaY * 0.01 * l.flySpeed, 0, 0));
    },
    { when: (e) => e.ctrlKey || e.metaKey },
  );

  // Keys. Orbit: arrows turn (Shift pans), + and - zoom, 0 resets. Fly: W A S D and arrows walk, Q and E go
  // down and up, held keys move every frame (one step each press under reduced motion).
  const held = React.useRef(new Set<string>());
  const flyLoop = React.useRef(0);
  const flyKeys = ["w", "a", "s", "d", "q", "e", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  const walkFrom = (keys: Iterable<string>, seconds: number, fast: boolean) => {
    const l = live.current;
    const k = new Set(keys);
    const stride = l.flySpeed * seconds * (fast ? 3 : 1);
    const axis = (plus: string[], minus: string[]) => (plus.some((x) => k.has(x)) ? 1 : 0) - (minus.some((x) => k.has(x)) ? 1 : 0);
    change(walk(l.camera, axis(["w", "ArrowUp"], ["s", "ArrowDown"]) * stride, axis(["d", "ArrowRight"], ["a", "ArrowLeft"]) * stride, axis(["e"], ["q"]) * stride));
  };
  const startFly = (shift: boolean) => {
    if (flyLoop.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      walkFrom(held.current, (now - last) / 1000, shift);
      last = now;
      flyLoop.current = held.current.size ? requestAnimationFrame(tick) : 0;
    };
    flyLoop.current = requestAnimationFrame(tick);
  };
  React.useEffect(() => () => cancelAnimationFrame(flyLoop.current), []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const l = live.current;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === "0") reset();
    else if (l.mode === "fly" && flyKeys.includes(key)) {
      if (reducedMotion()) walkFrom([key], 0.2, e.shiftKey);
      else {
        held.current.add(key);
        startFly(e.shiftKey);
      }
    } else if (key === "+" || key === "=") change(l.mode === "orbit" ? dolly(l.camera, 0.8) : walk(l.camera, l.flySpeed * 0.5, 0, 0));
    else if (key === "-" || key === "_") change(l.mode === "orbit" ? dolly(l.camera, 1.25) : walk(l.camera, -l.flySpeed * 0.5, 0, 0));
    else if (l.mode === "orbit" && key.startsWith("Arrow")) {
      const step = e.shiftKey ? 30 : 10; // pixels' worth, so keys and the pointer agree
      const dx = key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0;
      const dy = key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0;
      change(e.shiftKey ? pan(l.camera, -dx, -dy, size.height, l.fov) : turn(l.camera, dx, dy, "orbit"));
    } else return;
    e.preventDefault();
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    held.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };

  // Said in words, politely once the camera has been still for a moment.
  const words = describeCamera(camera);
  const said = useSettledStatus(words, STILL_MS);

  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <div
        ref={boxRef}
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => held.current.clear()}
        onPointerDown={pointers.onPointerDown}
        onPointerMove={pointers.onPointerMove}
        onPointerUp={pointers.onPointerUp}
        onPointerCancel={pointers.onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-surface bg-surface-sunken select-none active:cursor-grabbing"
        style={{ aspectRatio: aspect }}
      >
        <canvas ref={canvas} role="img" aria-label={`${label}. ${words}`} className="absolute inset-0 size-full" />
        {!unavailable && (
          <Button size="sm" variant="outline" onPress={reset} className="absolute top-2 right-2">
            <RotateCcw /> Reset view
          </Button>
        )}
      </div>
      {unavailable && <p className="type-body-sm text-muted-foreground">This browser cannot draw the 3D view.</p>}
      <VisuallyHidden>
        <span role="status">{said}</span>
      </VisuallyHidden>
    </div>
  );
}
