import * as React from "react";
import { Slider as AriaSlider, SliderThumb, SliderTrack } from "react-aria-components";
import { ImageOff, Maximize, Minimize, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "../lib/utils";
import { FIT, actualPixelsScale, zoomAt } from "../lib/viewport";
import { Button, IconButton } from "./button";
import { FullscreenFrame } from "./fullscreen-frame";
import { KeysLegend, useHotkeys, type Shortcut } from "./hotkeys";
import { Skeleton } from "./data-view";
import { Toolbar, ToolbarSeparator } from "./toolbar";
import { ToggleGroup } from "./toggle";
import { Slider } from "./value-controls";
import { ViewportFrame, useViewport } from "./viewport";

// Two renderings of the same thing, to be looked at closely and judged. It exists because four
// apps draw this by hand (the stills arena, the models judge, the listory match queue, the
// Bright Horizons review) and none of them can zoom both sides together, lay one over the other or
// look at it full screen. The design and the survey are in the project's design.md; this file is the
// first piece, for pictures. Text, audio, video and data kinds, a difference view and voting come
// in later changes and join the same `Candidate` and `CompareMode` types.
//
// Four views, because each answers a different question: side by side (which do I prefer),
// swipe (where exactly do they differ, along this edge), fade (the same, softly) and blink (flip
// between them in place, the most sensitive way to see a small change). Zoom and pan are one state
// for both sides, so the same detail is in view in both. Full screen keeps everything.
//
// Blind by type: `blind` is required with no default, because showing a judge which variant is which
// is a validity bug, not a style choice. When it is true the picture's name is its `label` (the
// caller passes "A" and "B"), the caller's `alt` and `note` are never put on the page, and the
// real `id` is never rendered at all. Mind the URL: `src` reaches the DOM, so a blind caller serves
// the pictures under neutral addresses (the arena's `img/{token}/left`).
//
// Failure is a state: a picture that does not load says so in `missing` (required, in the product's
// words) in its own place, and the other side is still usable. One filled button rule: this
// component draws none, a vote bar will be the view's filled control.

/** A picture to compare. */
export type ImageMedia = {
  kind: "image";
  src: string;
  /** What it shows. Ignored when the comparison is `blind`: the label names it then. */
  alt: string;
  /** Its natural size in pixels, if known, so the frame has its shape and "1:1" is exact before the picture loads. */
  size?: readonly [number, number];
};

/** One side of a comparison. */
export type Candidate<M = ImageMedia> = {
  /** Who it is: a variant name, a model. Never put on the page when `blind`, and never needed by it. */
  id: string;
  /** What the person sees it called: "Original", or "A" when blind. */
  label: string;
  media: M;
  /** A line under the label ("auto2, 14 s"). Not shown when `blind`. */
  note?: string;
};

/** How two pictures are laid out. */
export type CompareMode = "side" | "swipe" | "fade" | "blink";

const MODE_LABEL: Record<CompareMode, string> = { side: "Side by side", swipe: "Swipe", fade: "Fade", blink: "Blink" };
const ALL_MODES: readonly CompareMode[] = ["side", "swipe", "fade", "blink"];

/** Props for `Compare`. */
export type CompareProps = {
  /** Names the comparison for screen readers: "Photo 1 of 12, two versions". Required. */
  label: string;
  a: Candidate;
  b: Candidate;
  /** Whether the person must not learn which variant is which. Required, no default. */
  blind: boolean;
  /** The words shown where a picture could not be loaded: "Picture not found". Required. */
  missing: string;
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
  /** Which views are offered. Default all four. Must include `mode`. */
  modes?: readonly CompareMode[];
  /** Bind the view, zoom and full-screen keys on the window. Default true; turn off when a surrounding screen binds the same keys. */
  keys?: boolean;
  className?: string;
};

/** A word for a picture's name on the page: its label, with its note unless blind. */
function Caption({ c, blind }: { c: Candidate; blind: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="type-label">{c.label}</span>
      {!blind && c.note && <span className="type-caption text-muted-foreground">{c.note}</span>}
    </div>
  );
}

/** One picture inside a frame: a skeleton while it loads, the product's words if it fails. */
function Picture({ c, blind, missing, onNatural, imgRef }: { c: Candidate; blind: boolean; missing: string; onNatural?: (w: number, h: number) => void; imgRef?: React.Ref<HTMLImageElement> }) {
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

/** Two pictures to judge, side by side or laid over each other, zoomed and panned together, and full screen. */
export function Compare({ label, a, b, blind, missing, mode, onModeChange, modes = ALL_MODES, keys = true, className }: CompareProps) {
  const { viewport, setViewport } = useViewport();
  const [full, setFull] = React.useState(false);
  // Learned from the picture once it loads, and only for the pair it was learned from: a new pair starts again.
  const pairKey = `${a.media.src}|${b.media.src}`;
  const [learned, setLearned] = React.useState<{ key: string; size: readonly [number, number] } | null>(null);
  const natural = a.media.size ?? (learned?.key === pairKey ? learned.size : null);
  const [divider, setDivider] = React.useState(50);
  const [blend, setBlend] = React.useState(50);
  const [showing, setShowing] = React.useState<"a" | "b">("a");
  const frameRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const aspect = natural ? natural[0] / natural[1] : 3 / 2;

  const frameSize = () => {
    const r = frameRef.current?.getBoundingClientRect();
    return { width: r?.width ?? 0, height: r?.height ?? 0 };
  };
  const zoomBy = (k: number) => setViewport(zoomAt(viewport, viewport.scale * k, { x: 0, y: 0 }, frameSize()));
  const actual = () => {
    const f = frameSize();
    // The width the picture is drawn at when fitted: the frame's, unless the picture is taller than it is wide for the frame.
    const fitted = natural ? Math.min(f.width, f.height * (natural[0] / natural[1])) : f.width;
    setViewport(zoomAt(viewport, actualPixelsScale(natural?.[0] ?? 0, fitted), { x: 0, y: 0 }, f));
  };
  const flip = () => setShowing((s) => (s === "a" ? "b" : "a"));

  const offered = modes.includes(mode) ? modes : [mode, ...modes];
  const shortcuts: Shortcut[] = [
    ...offered.map((m, i): Shortcut => ({ keys: [String(i + 1)], label: MODE_LABEL[m], run: () => onModeChange(m) })),
    { keys: ["x"], label: "Flip A and B", run: flip, disabled: mode !== "blink" },
    { keys: ["+", "="], label: "Zoom in", run: () => zoomBy(1.5), repeat: true },
    { keys: ["-"], label: "Zoom out", run: () => zoomBy(1 / 1.5), repeat: true },
    { keys: ["0"], label: "Fit", run: () => setViewport(FIT) },
    { keys: ["f"], label: full ? "Leave full screen" : "Full screen", run: () => setFull((f) => !f) },
  ];
  useHotkeys(shortcuts, { enabled: keys });

  const pane = (c: Candidate, ref?: React.Ref<HTMLImageElement>, onNatural?: (w: number, h: number) => void) => (
    <Picture c={c} blind={blind} missing={missing} imgRef={ref} onNatural={onNatural} />
  );
  const learn = (w: number, h: number) => setLearned({ key: pairKey, size: [w, h] });
  const frameProps = { viewport, setViewport, aspect };

  let body: React.ReactNode;
  if (mode === "side") {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {[a, b].map((c, i) => (
          <figure key={i} className="grid gap-1.5">
            <Caption c={c} blind={blind} />
            <ViewportFrame {...frameProps} label={blind ? `Picture ${c.label}` : `${c.label}`} ref={i === 0 ? frameRef : undefined}>
              {pane(c, i === 0 ? imgRef : undefined, i === 0 ? learn : undefined)}
            </ViewportFrame>
          </figure>
        ))}
      </div>
    );
  } else {
    // One frame, both pictures in it. Swipe clips the top one at the divider; fade lays it over at an opacity; blink shows one.
    const top = mode === "blink" ? (showing === "a" ? a : b) : a;
    const bottom = b;
    body = (
      <figure className="grid gap-1.5">
        <div className="flex justify-between gap-4">
          {mode === "blink" ? <Caption c={top} blind={blind} /> : <Caption c={a} blind={blind} />}
          {mode !== "blink" && <Caption c={b} blind={blind} />}
        </div>
        <ViewportFrame
          {...frameProps}
          ref={frameRef}
          cover={mode === "swipe" ? { content: pane(a, imgRef, learn), shown: divider } : undefined}
          label={mode === "blink" ? `Picture ${top.label}` : `${a.label} over ${b.label}`}
          overlay={
            mode === "swipe" && (
              <AriaSlider
                aria-label={`Divider between ${a.label} and ${b.label}`}
                value={divider}
                onChange={(v) => setDivider(v as number)}
                minValue={0}
                maxValue={100}
                step={1}
                className="absolute inset-0"
              >
                <SliderTrack className="pointer-events-none h-full w-full">
                  <SliderThumb
                    className="pointer-events-auto grid h-full w-8 cursor-ew-resize place-items-center focus-visible:outline-2 focus-visible:outline-ring"
                    style={{ top: "50%" }}
                  >
                    <span aria-hidden className="col-start-1 row-start-1 h-full w-1 border-x border-background bg-foreground" />
                    <span aria-hidden className="col-start-1 row-start-1 size-6 rounded-pill border-2 border-foreground bg-background" />
                  </SliderThumb>
                </SliderTrack>
              </AriaSlider>
            )
          }
        >
          {pane(bottom)}
          {mode !== "swipe" && (
            <div className="absolute inset-0" style={mode === "fade" ? { opacity: 1 - blend / 100 } : undefined}>
              {pane(top, imgRef, learn)}
            </div>
          )}
        </ViewportFrame>
      </figure>
    );
  }

  return (
    <FullscreenFrame label={label} active={full} onActiveChange={setFull} className={className}>
      <section aria-label={label} className={cn("grid gap-3", full && "min-h-0 flex-1 content-start overflow-auto")}>
        <Toolbar label="Comparison view" className="items-center gap-2">
          <ToggleGroup label="View" options={offered.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={(v) => onModeChange(v as CompareMode)} size="sm" />
          <ToolbarSeparator />
          <IconButton icon={ZoomOut} label="Zoom out" onPress={() => zoomBy(1 / 1.5)} disabled={viewport.scale <= 1} />
          <IconButton icon={ZoomIn} label="Zoom in" onPress={() => zoomBy(1.5)} />
          <IconButton icon={Scan} label="Fit" onPress={() => setViewport(FIT)} disabled={viewport.scale === 1} />
          <Button size="sm" variant="ghost" onPress={actual} disabled={!natural}>1:1</Button>
          <span aria-live="off" className="type-caption tabular-nums text-muted-foreground">{viewport.scale === 1 ? "Fit" : `${viewport.scale.toFixed(1)}×`}</span>
          <ToolbarSeparator />
          <IconButton icon={full ? Minimize : Maximize} label={full ? "Leave full screen" : "Full screen"} onPress={() => setFull(!full)} />
        </Toolbar>
        {mode === "fade" && (
          <div className="flex items-center gap-3">
            <span className="type-caption text-muted-foreground">{a.label}</span>
            <Slider aria-label={`Blend from ${a.label} to ${b.label}`} value={blend} onChange={setBlend} min={0} max={100} unit="%" hideValue className="flex-1" />
            <span className="type-caption text-muted-foreground">{b.label}</span>
          </div>
        )}
        {mode === "blink" && (
          <div>
            <ToggleGroup label="Showing" options={[{ value: "a", label: a.label }, { value: "b", label: b.label }]} value={showing} onChange={(v) => setShowing(v as "a" | "b")} size="sm" />
          </div>
        )}
        {body}
        {keys && <KeysLegend shortcuts={shortcuts} />}
      </section>
    </FullscreenFrame>
  );
}
