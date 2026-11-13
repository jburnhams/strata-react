import * as React from "react";
import { ImageOff, Maximize, Minimize, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { FIT, actualPixelsScale, zoomAt, type Viewport } from "../lib/viewport";
import { Button, IconButton } from "./button";
import { Skeleton } from "./data-view";
import type { Shortcut } from "./hotkeys";
import type { Candidate } from "./compare";
import type { FramePick } from "./viewport";

// The pieces `Compare` and `CompareGrid` share, not exported from the package: a picture in its
// loading, ready and failed states, the caption under it, and the zoom controls and keys, so the
// two views behave the same way and cannot drift apart.

// 100svh less the toolbar (about 3rem), captions (2rem), a vote bar (4rem), the legend (4rem) and gaps.
// A guess at the rest of the page: `maxHeight="fit"` measures it instead (issue #229).
export const VIEWPORT_HEIGHT = "max(16rem, calc(100svh - 14rem))";

/** The least a frame is made, however little room is left: a pair this small can still be told apart. */
export const MIN_FIT = 120;

/** The tallest each row of frames may be so that all of `chrome` and `rows` rows fit in `space` pixels. Pure, so it is tested without a layout. */
export function fitFrames({ space, chrome, rows, min = MIN_FIT }: { space: number; chrome: number; rows: number; min?: number }): number {
  return Math.max(min, Math.floor((space - chrome) / Math.max(1, rows)));
}

/** Frame cap for what the caller asked for: a measured height for `"fit"` and in full screen (whatever the caller passed, so the frame fills what the controls leave), the guess for `"viewport"`, the caller's own length otherwise. */
export function frameCap(maxHeight: string | undefined, fit: number | null, full: boolean): string | undefined {
  if ((maxHeight === "fit" || full) && fit !== null) return `${fit}px`;
  return maxHeight === "viewport" || maxHeight === "fit" ? VIEWPORT_HEIGHT : maxHeight;
}

/**
 * How tall each frame may be for the pair and everything around it to fit the window (issue #229), measured, not
 * guessed. In the page: the window's height from the top of `root` (as the page is at its top), less what `root` draws
 * besides its frames (toolbar, captions, footer, legend: the bottom of its last child, not its height, which a stretched
 * full-screen section would inflate), less what follows it (later siblings of it and of its ancestors, then `reserve` for
 * padding and gaps the caller knows). In full screen: the window from the top of `root`, nothing after. Divided by the
 * rows of frames (side by side is one row; below `sm` it is two) and floored at `MIN_FIT`. Frames are found by
 * `data-viewport-frame`, so an app never queries for them. Null until measured, or when `enabled` is false.
 */
export function useFitHeight(root: React.RefObject<HTMLElement | null>, { enabled, full, reserve = 0 }: { enabled: boolean; full: boolean; reserve?: number }): number | null {
  const [fit, setFit] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!enabled) {
      setFit(null);
      return;
    }
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const frames = [...el.querySelectorAll<HTMLElement>("[data-viewport-frame]")].map((f) => f.getBoundingClientRect());
      if (!frames.length) return;
      const top = el.getBoundingClientRect().top;
      const rows: { top: number; height: number }[] = [];
      for (const r of frames) {
        const row = rows.find((x) => Math.abs(x.top - r.top) < 2);
        if (row) row.height = Math.max(row.height, r.height);
        else rows.push({ top: r.top, height: r.height });
      }
      const bottom = Math.max(el.lastElementChild?.getBoundingClientRect().bottom ?? 0, ...frames.map((r) => r.bottom));
      const chrome = bottom - top - rows.reduce((sum, r) => sum + r.height, 0);
      const windowHeight = document.documentElement.clientHeight;
      let space: number;
      if (full) {
        const pad = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).paddingBottom) || 0 : 0;
        space = windowHeight - top - pad;
      } else {
        let after = 0;
        for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
          for (let sib = n.nextElementSibling; sib; sib = sib.nextElementSibling) {
            const position = getComputedStyle(sib).position;
            if (position !== "fixed" && position !== "absolute") after += sib.getBoundingClientRect().height;
          }
        }
        space = windowHeight - (top + window.scrollY) - after - reserve;
      }
      const next = fitFrames({ space, chrome, rows: rows.length });
      setFit((was) => (was !== null && Math.abs(was - next) <= 1 ? was : next));
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(el);
    observer?.observe(document.body);
    window.addEventListener("resize", schedule);
    document.addEventListener("fullscreenchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("fullscreenchange", schedule);
    };
  }, [root, enabled, full, reserve]);
  return fit;
}

/** Words for click to choose, in the product's voice. */
export type PickWords = {
  /** What hovering a side says, and what the frame is described as: `(label) => "Click to choose " + label`. */
  choose?: (label: string) => string;
  /** Said under the view's controls in a view where a click cannot choose (fade, difference): `(view) => ...`. */
  unavailable?: (view: string) => string;
};

/** What a pair's frames do with a click (issue #201): the same answer as the keys, only where a click is unambiguous. Blind: only a candidate's `label` is ever said. */
export function makePicker(a: Candidate<unknown>, b: Candidate<unknown>, onPick: (side: "a" | "b") => void, words?: PickWords) {
  const choose = words?.choose ?? ((label: string) => `Click to choose ${label}`);
  const unavailable = words?.unavailable ?? ((view: string) => `A click does not choose in ${view}: use the keys or the buttons.`);
  const answer = (zone: { value: string }) => onPick(zone.value === "a" ? "a" : "b");
  // The pair on screen: a click still waiting for a double click is dropped if another pair has come up (ids are never drawn).
  const token = `${a.id}|${b.id}`;
  return {
    /** A frame that is one whole side. */
    one(side: "a" | "b"): FramePick {
      const text = choose((side === "a" ? a : b).label);
      return { zoneAt: () => ({ value: side, from: 0, to: 1, hint: text }), onPick: answer, describe: text, token };
    },
    /** A frame cut by a swipe divider at `divider` percent: the left is A, the right is B. */
    split(divider: number): FramePick {
      const cut = divider / 100;
      return {
        zoneAt: (x) => (x < cut ? { value: "a", from: 0, to: cut, hint: choose(a.label) } : { value: "b", from: cut, to: 1, hint: choose(b.label) }),
        onPick: answer,
        token,
        describe: `${choose(a.label)} on the left, ${choose(b.label)} on the right`,
      };
    },
    unavailable,
  };
}

/** A word for a picture's name on the page: its label, with its note unless blind. */
export function Caption({ c, blind }: { c: Candidate<unknown>; blind: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="type-label">{c.label}</span>
      {!blind && c.note && <span className="type-caption text-muted-foreground">{c.note}</span>}
    </div>
  );
}

/** One picture inside a frame: a skeleton while it loads, the product's words if it fails. */
export function Picture({ c, blind, missing, onNatural, imgRef, pixelated }: { c: Candidate; blind: boolean; missing: string; onNatural?: (w: number, h: number) => void; imgRef?: React.Ref<HTMLImageElement>; pixelated?: boolean }) {
  const [state, setState] = React.useState<"loading" | "ready" | "failed">("loading");
  React.useEffect(() => setState("loading"), [c.media.src]);
  const alt = blind ? c.label : c.media.alt;
  if (state === "failed")
    return (
      <div role="img" aria-label={`${alt}: ${missing}`} className="absolute inset-0 grid place-content-center justify-items-center gap-2 text-muted-foreground">
        <ImageOff aria-hidden className="size-6" />
        <span className="type-body-sm">{missing}</span>
      </div>
    );
  return (
    <>
      {state === "loading" && <Skeleton aria-hidden className="absolute inset-0 size-full rounded-none" />}
      <img
        ref={imgRef}
        src={c.media.src}
        alt={alt}
        draggable={false}
        style={pixelated ? { imageRendering: "pixelated" } : undefined}
        onLoad={(e) => {
          setState("ready");
          // A picture that loads with no size (an SVG without one, jsdom) says nothing: 0 would make the frame's aspect NaN.
          if (e.currentTarget.naturalWidth && e.currentTarget.naturalHeight) onNatural?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
        }}
        onError={() => setState("failed")}
        className="absolute inset-0 size-full object-contain"
      />
    </>
  );
}


type ZoomProps = {
  viewport: Viewport;
  setViewport: (next: Viewport) => void;
  /** The frame whose size zoom is measured against. */
  frame: React.RefObject<HTMLElement | null>;
  /** The picture's natural size, if known, for 1:1. */
  natural: readonly [number, number] | null;
};

const frameSize = (frame: React.RefObject<HTMLElement | null>) => {
  const r = frame.current?.getBoundingClientRect();
  return { width: r?.width ?? 0, height: r?.height ?? 0 };
};

/** Zoom steps about the frame's centre, and 1:1. */
export function useZoom({ viewport, setViewport, frame, natural }: ZoomProps) {
  const by = (k: number) => setViewport(zoomAt(viewport, viewport.scale * k, { x: 0, y: 0 }, frameSize(frame)));
  const actual = () => {
    const f = frameSize(frame);
    // The width the picture is drawn at when fitted: the frame's, unless the picture is taller than it is wide for the frame.
    const fitted = natural ? Math.min(f.width, f.height * (natural[0] / natural[1])) : f.width;
    setViewport(zoomAt(viewport, actualPixelsScale(natural?.[0] ?? 0, fitted), { x: 0, y: 0 }, f));
  };
  return { by, actual, fit: () => setViewport(FIT) };
}

/** The shortcuts for zoom and full screen, to join a screen's own list. */
export function zoomShortcuts(zoom: ReturnType<typeof useZoom>, full: boolean, setFull: (f: boolean) => void): Shortcut[] {
  return [
    { keys: ["+", "="], label: "Zoom in", run: () => zoom.by(1.5), repeat: true },
    { keys: ["-"], label: "Zoom out", run: () => zoom.by(1 / 1.5), repeat: true },
    { keys: ["0"], label: "Fit", run: zoom.fit },
    { keys: ["f"], label: full ? "Leave full screen" : "Full screen", run: () => setFull(!full) },
  ];
}

/** Zoom out, in, fit, 1:1 and the zoom now, for inside a `Toolbar`. */
export function ZoomControls({ viewport, zoom, natural }: { viewport: Viewport; zoom: ReturnType<typeof useZoom>; natural: readonly [number, number] | null }) {
  return (
    <>
      <IconButton icon={ZoomOut} label="Zoom out" onPress={() => zoom.by(1 / 1.5)} disabled={viewport.scale <= 1} />
      <IconButton icon={ZoomIn} label="Zoom in" onPress={() => zoom.by(1.5)} />
      <IconButton icon={Scan} label="Fit" onPress={zoom.fit} disabled={viewport.scale === 1} />
      <Button size="sm" variant="ghost" onPress={zoom.actual} disabled={!natural}>1:1</Button>
      <span aria-live="off" className="type-caption tabular-nums text-muted-foreground">{viewport.scale === 1 ? "Fit" : `${viewport.scale.toFixed(1)}×`}</span>
    </>
  );
}

/** The full-screen button, for inside a `Toolbar`. */
export function FullscreenButton({ full, setFull }: { full: boolean; setFull: (f: boolean) => void }) {
  return <IconButton icon={full ? Minimize : Maximize} label={full ? "Leave full screen" : "Full screen"} onPress={() => setFull(!full)} />;
}

// Width of an element, kept current, for "is this shown larger than its pixels".
/** The width of an element, kept current: for "is this shown larger than its own pixels". */
export function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return width;
}

