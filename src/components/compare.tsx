import * as React from "react";
import { Slider as AriaSlider, SliderThumb, SliderTrack } from "react-aria-components";
import { cn } from "../lib/utils";
import { FullscreenFrame } from "./fullscreen-frame";
import { KeysLegend, useHotkeys, type Shortcut } from "./hotkeys";
import { Skeleton } from "./data-view";
import { Caption, FullscreenButton, Picture, ZoomControls, frameCap, makePicker, useFitHeight, useZoom, zoomShortcuts, type PickWords } from "./compare-parts";
import { Toolbar, ToolbarSeparator } from "./toolbar";
import { ToggleGroup } from "./toggle";
import { Slider } from "./value-controls";
import { DifferenceMarks, useDifference, type ReadPixels } from "./difference";
import { format } from "../lib/format";
import { ViewportFrame, useViewport } from "./viewport";
import { RegionChips, useRegions } from "./compare-regions";
import type { Region } from "../lib/viewport";

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
// Click to choose (issue #201, from the models judge, where a click on the picture used to answer and
// became a pan inside `Compare`): `onPick` is called with "a" or "b" when a side is clicked, in the
// views where that is unambiguous: side by side (the side clicked), swipe (the side of the divider
// clicked) and blink (the side showing). Fade and difference have no pick and say so under the
// view's controls. `ViewportFrame` decides click versus pan and waits out the double-click window
// (see viewport.tsx); this file only says what each view's click means. The keys and the vote bar
// stay the way to answer (a `PairVote` passes `onPick` through, with `pending` respected); `pick={false}`
// is for a screen where a click must only pan. Blind: the hover words use the `label` only.
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

/** A clip to compare by listening (`CompareAudio`). Serve it under a neutral address when the comparison is blind. */
export type AudioMedia = {
  kind: "audio";
  src: string;
};

/** A text to compare by reading (`CompareText`). */
export type TextMedia = {
  kind: "text";
  text: string;
};

/** A video to compare (`CompareVideo`). Serve it under a neutral address when the comparison is blind: `src` reaches the page. */
export type VideoMedia = {
  kind: "video";
  src: string;
  /** A still shown before the first frame. */
  poster?: string;
  /** Its size in pixels, for the shape of the frame, "1:1" and drawing candidates of different sizes in one box. */
  width: number;
  height: number;
  /** Frames per second, if known: the unit of the sync tolerance and of the frame readout. Default 30. */
  fps?: number;
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
export type CompareMode = "side" | "swipe" | "fade" | "blink" | "difference";

const MODE_LABEL: Record<CompareMode, string> = { side: "Side by side", swipe: "Swipe", fade: "Fade", blink: "Blink", difference: "Difference" };
const ALL_MODES: readonly CompareMode[] = ["side", "swipe", "fade", "blink", "difference"];

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
  /** Words for when the difference view cannot read the pictures' pixels (a picture from another site without CORS headers). Default says so plainly. */
  cannotCompare?: string;
  /** Which difference the difference view opens on: `brightness` (live, any picture) or `pixels` (the changed pixels marked, with a tolerance and the share that differ). Default `brightness`. */
  defaultDifference?: "brightness" | "pixels";
  /** How pictures become pixels for the difference view. Default draws them on a canvas. */
  readPixels?: ReadPixels;
  /** Which views are offered. Default all five. Must include `mode`. */
  modes?: readonly CompareMode[];
  /** How tall a frame may be, so the pair and the answer fit on one screen: a CSS length (`"60svh"`), `"viewport"` (the window's height less a fixed 14rem for the toolbar, captions, a vote bar and the key legend: a guess), or `"fit"` (measured: the window from the top of this component, less what it draws besides its frames and what follows it in the page, shared between the rows of frames, never under 120 px; re-measured as the page changes; see `reserve`). The frame narrows to keep the picture's shape. In full screen the frame fills what the controls leave, whatever this is. Default: as tall as the width makes it. */
  maxHeight?: string;
  /** With `maxHeight="fit"`: pixels of the page below this component that it cannot measure (padding and gaps of the screen around it); later siblings are measured. Default 0. */
  reserve?: number;
  /** Named boxes in the source's coordinates to look at enlarged: a strip of chips, keys `q` `w` `e` `r` `y` `u`, nearest-neighbour drawing while one is shown, and Shift-drag to make another. They work in every view. The same share of each side is shown, whatever its pixel size. Label them by content ("Face"), never by candidate. */
  regions?: readonly Region[];
  /** Called with the side clicked or tapped, in the views where a click is unambiguous: side by side, swipe (by the side of the divider) and blink (the side showing). A pointer convenience: the keys and the vote bar stay the way to answer. A `PairVote` sets this for you. */
  onPick?: (side: "a" | "b") => void;
  /** Whether a click chooses at all when `onPick` is given. Default true; `false` for a screen where a click must only pan. */
  pick?: boolean;
  /** Words for click to choose. Defaults say "Click to choose A". */
  pickWords?: PickWords;
  /** Bind the view, zoom and full-screen keys on the window. Default true; turn off when a surrounding screen binds the same keys. */
  keys?: boolean;
  /** Shortcuts of the surrounding screen (the answer keys of a `PairVote`), bound with Compare's own and drawn in the same legend, so there is one list and the two cannot clash unseen. Listed first. */
  extraShortcuts?: Shortcut[];
  /** Drawn under the picture, above the legend, and kept in full screen: where a vote bar goes so the answer is never out of reach of the pictures. */
  footer?: React.ReactNode;
  className?: string;
};

/** Two pictures to judge, side by side or laid over each other, zoomed and panned together, and full screen. */
export function Compare({ label, a, b, blind, missing, mode, onModeChange, modes = ALL_MODES, regions, onPick, pick = true, pickWords, keys = true, extraShortcuts = [], footer, maxHeight, reserve, cannotCompare = "Could not read these pictures to compare their pixels.", readPixels, defaultDifference = "brightness", className }: CompareProps) {
  const { viewport, setViewport } = useViewport();
  const [full, setFull] = React.useState(false);
  // Learned from the picture once it loads, and only for the pair it was learned from: a new pair starts again.
  const pairKey = `${a.media.src}|${b.media.src}`;
  const [learned, setLearned] = React.useState<{ key: string; size: readonly [number, number] } | null>(null);
  const natural = a.media.size ?? (learned?.key === pairKey ? learned.size : null);
  const [divider, setDivider] = React.useState(50);
  const [blend, setBlend] = React.useState(50);
  const [showing, setShowing] = React.useState<"a" | "b">("a");
  const [style, setStyle] = React.useState<"brightness" | "pixels">(defaultDifference);
  const [amplify, setAmplify] = React.useState(4);
  const [tolerance, setTolerance] = React.useState(10); // percent; pixelmatch's threshold is this over 100
  const diff = useDifference(a.media.src, b.media.src, tolerance / 100, mode === "difference" && style === "pixels", readPixels);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const aspect = natural ? natural[0] / natural[1] : 3 / 2;
  const sectionRef = React.useRef<HTMLElement>(null);
  const fit = useFitHeight(sectionRef, { enabled: maxHeight === "fit" || full, full, reserve });

  const rg = useRegions({ regions, viewport, setViewport, frame: frameRef, reset: pairKey });
  const zoom = useZoom({ viewport, setViewport: rg.setViewport, frame: frameRef, natural });
  const flip = () => setShowing((s) => (s === "a" ? "b" : "a"));

  const offered = modes.includes(mode) ? modes : [mode, ...modes];
  const shortcuts: Shortcut[] = [
    ...extraShortcuts,
    ...offered.map((m, i): Shortcut => ({ keys: [String(i + 1)], label: MODE_LABEL[m], run: () => onModeChange(m) })),
    { keys: ["x"], label: `Flip ${a.label} and ${b.label}`, run: flip, disabled: mode !== "blink" },
    ...rg.shortcuts,
    ...zoomShortcuts(zoom, full, setFull),
  ];
  useHotkeys(shortcuts, { enabled: keys });

  const pane = (c: Candidate, ref?: React.Ref<HTMLImageElement>, onNatural?: (w: number, h: number) => void) => (
    <Picture c={c} blind={blind} missing={missing} imgRef={ref} onNatural={onNatural} pixelated={rg.active !== null} />
  );
  const learn = (w: number, h: number) => setLearned({ key: pairKey, size: [w, h] });
  const picker = pick && onPick ? makePicker(a, b, onPick, pickWords) : null;
  const frameProps = { viewport, setViewport: rg.setViewport, onBox: rg.add, outline: rg.peek, aspect, maxHeight: frameCap(maxHeight, fit, full) };

  let body: React.ReactNode;
  if (mode === "side") {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {[a, b].map((c, i) => (
          <figure key={i} className="grid gap-1.5">
            <Caption c={c} blind={blind} />
            <ViewportFrame {...frameProps} label={blind ? `Picture ${c.label}` : `${c.label}`} ref={i === 0 ? frameRef : undefined} pick={picker?.one(i === 0 ? "a" : "b")}>
              {pane(c, i === 0 ? imgRef : undefined, i === 0 ? learn : undefined)}
            </ViewportFrame>
          </figure>
        ))}
      </div>
    );
  } else if (mode === "difference") {
    body = (
      <figure className="grid gap-1.5">
        <div className="flex justify-between gap-4">
          <Caption c={a} blind={blind} />
          <span className="type-caption text-muted-foreground">against</span>
          <Caption c={b} blind={blind} />
        </div>
        <ViewportFrame {...frameProps} ref={frameRef} label={`Difference between ${a.label} and ${b.label}`}>
          {style === "brightness" ? (
            <div className="absolute inset-0 isolate" style={{ filter: `brightness(${amplify})` }}>
              <div className="absolute inset-0 bg-background">{pane(a, imgRef, learn)}</div>
              <div className="absolute inset-0 bg-background mix-blend-difference">{pane(b)}</div>
            </div>
          ) : (
            <>
              <div className="absolute inset-0 opacity-35">{pane(a, imgRef, learn)}</div>
              {diff.status === "ready" && <DifferenceMarks difference={diff.difference} />}
              {diff.status === "loading" && <Skeleton aria-hidden className="absolute inset-0 size-full rounded-none opacity-40" />}
              {diff.status === "failed" && <p role="alert" className="absolute inset-x-0 bottom-0 bg-background/90 p-2 type-body-sm text-danger">{cannotCompare}</p>}
            </>
          )}
        </ViewportFrame>
      </figure>
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
          pick={mode === "swipe" ? picker?.split(divider) : mode === "blink" ? picker?.one(showing) : undefined}
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
      <section ref={sectionRef} aria-label={label} className={cn("grid gap-3", full && "min-h-0 flex-1 content-start overflow-auto")}>
        <Toolbar label="Comparison view" className="items-center gap-2">
          <ToggleGroup label="View" options={offered.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={(v) => onModeChange(v as CompareMode)} size="sm" />
          <ToolbarSeparator />
          <ZoomControls viewport={viewport} zoom={zoom} natural={natural} />
          <ToolbarSeparator />
          <FullscreenButton full={full} setFull={setFull} />
        </Toolbar>
        <RegionChips state={rg} />
        {picker && (mode === "fade" || mode === "difference") && <p className="type-caption text-muted-foreground">{picker.unavailable(MODE_LABEL[mode])}</p>}
        {mode === "fade" && (
          <div className="flex items-center gap-3">
            <span className="type-caption text-muted-foreground">{a.label}</span>
            <Slider aria-label={`Blend from ${a.label} to ${b.label}`} value={blend} onChange={setBlend} min={0} max={100} unit="%" hideValue className="flex-1" />
            <span className="type-caption text-muted-foreground">{b.label}</span>
          </div>
        )}
        {mode === "difference" && (
          <div className="grid gap-2">
            <ToggleGroup label="Difference style" options={[{ value: "brightness", label: "Brightness" }, { value: "pixels", label: "Changed pixels" }]} value={style} onChange={(v) => setStyle(v as "brightness" | "pixels")} size="sm" className="justify-self-start" />
            {style === "brightness" ? (
              <div className="flex items-center gap-3">
                <span className="type-caption text-muted-foreground">Amplify</span>
                <Slider aria-label="Amplify differences" value={amplify} onChange={setAmplify} min={1} max={8} hideValue className="flex-1" />
                <span className="w-8 type-caption tabular-nums text-muted-foreground">{amplify}×</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="type-caption text-muted-foreground">Tolerance</span>
                  <Slider aria-label="Tolerance for a changed pixel" value={tolerance} onChange={setTolerance} min={0} max={50} unit="%" hideValue className="flex-1" />
                  <span className="w-10 type-caption tabular-nums text-muted-foreground">{tolerance}%</span>
                </div>
                <p role="status" className="type-body-sm text-muted-foreground">
                  {diff.status === "ready"
                    ? diff.difference.differing === 0
                      ? "No pixels differ at this tolerance."
                      : `${format.share(diff.difference.differing / diff.difference.total)} of pixels differ at this tolerance.`
                    : diff.status === "loading"
                      ? "Comparing pixels…"
                      : ""}
                </p>
              </>
            )}
          </div>
        )}
        {mode === "blink" && (
          <div>
            <ToggleGroup label="Showing" options={[{ value: "a", label: a.label }, { value: "b", label: b.label }]} value={showing} onChange={(v) => setShowing(v as "a" | "b")} size="sm" />
          </div>
        )}
        {body}
        {footer}
        {keys && <KeysLegend shortcuts={shortcuts} />}
      </section>
    </FullscreenFrame>
  );
}
