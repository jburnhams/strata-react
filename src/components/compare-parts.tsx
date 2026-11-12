import * as React from "react";
import { ImageOff, Maximize, Minimize, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { FIT, actualPixelsScale, zoomAt, type Viewport } from "../lib/viewport";
import { Button, IconButton } from "./button";
import { Skeleton } from "./data-view";
import type { Shortcut } from "./hotkeys";
import type { Candidate } from "./compare";

// The pieces `Compare` and `CompareGrid` share, not exported from the package: a picture in its
// loading, ready and failed states, the caption under it, and the zoom controls and keys, so the
// two views behave the same way and cannot drift apart.

// 100svh less the toolbar (about 3rem), captions (2rem), a vote bar (4rem), the legend (4rem) and gaps.
export const VIEWPORT_HEIGHT = "max(16rem, calc(100svh - 14rem))";

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
          onNatural?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
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

