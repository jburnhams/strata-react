import * as React from "react";
import { cn } from "../lib/utils";
import { useInView } from "../lib/in-view";
import type { Region } from "../lib/viewport";
import type { Candidate, VideoMedia } from "./compare";
import { Caption, FullscreenButton, VIEWPORT_HEIGHT, ZoomControls, useWidth, useZoom, zoomShortcuts } from "./compare-parts";
import { RegionChips, useRegions } from "./compare-regions";
import { Skeleton } from "./data-view";
import { FullscreenFrame } from "./fullscreen-frame";
import { KeysLegend, useHotkeys, type Shortcut } from "./hotkeys";
import { Toolbar, ToolbarSeparator } from "./toolbar";
import { SLOW_RATES, VideoControls, useVideoClock, type VideoClock, type VideoLoop } from "./video-clock";
import { ViewportFrame, useViewport } from "./viewport";

// Every candidate's video for one item at once, playing in step: the models app's Outputs tab for a
// video eval (a baseline, several upscalers), where four to eight cells show at a glance which
// flicker, smear or over-sharpen. `CompareGrid` is the same thing for pictures and this shares its
// shape, its captions and its keys; what is different is the clock.
//
// One clock for all cells (`useVideoClock`, the same as `CompareVideo`'s): one transport, frame
// stepping, a loop range, speeds down to 0.1, and a cell that falls behind is marked "Catching up"
// rather than drifting silently. Zoom and pan are one viewport for every cell and `regions` work as
// in `Compare`, so a grid can show the same face in every candidate at once.
//
// Light on the browser, because eight 1440×1080 50p videos at once are heavy: cells load only their
// metadata until the first play; a cell scrolled out of sight (`useInView`, with a screen's own
// scroll region honoured) is paused and left out of the sync, and brought back to the clock when it
// is visible again; and the sound is off unless the screen names a cell (`audio`), since eight
// soundtracks are noise. The first cell leads the clock and is always kept. Not done: a "play one at
// a time" fallback that steps through the cells on a paused frame when decoding cannot keep up; the
// "Catching up" mark says when that is needed.
//
// A `reference` is the source clip, first, never blind (it is not a candidate, so its note shows
// whatever `blind` is) and drawn nearest-neighbour so its own pixels are seen.
//
// Blind: as in `Compare`. Only `label` names a cell when `blind`; id and note are never written
// (and `src` reaches the page, so a blind caller serves videos under neutral addresses).
//
// Checked: React Aria has no media clock or video grid; the controls are the media parts, the
// region chips its toggle group.

/** Props for `CompareVideoGrid`. */
export type CompareVideoGridProps = {
  /** Names the grid for screen readers: "Five upscales of this clip". Required. */
  label: string;
  items: readonly Candidate<VideoMedia>[];
  /** The source clip, drawn first and never blind, scaled up nearest-neighbour. Give its `label` ("Source"); its `note` shows. */
  reference?: Candidate<VideoMedia>;
  /** Whether the person must not learn which variant is which: cells are named by label only. Required, no default. */
  blind: boolean;
  /** The words shown where a video could not be loaded. Required. */
  missing: string;
  /** The words under a cell that has fallen behind the clock. Default "Catching up". */
  catchingUp?: string;
  /** What goes under a cell's caption: a button to compare it, a choice, a flag. */
  actions?: (item: Candidate<VideoMedia>) => React.ReactNode;
  /** Cells per row at full width. Default 3. A narrow screen uses fewer. */
  columns?: 2 | 3 | 4;
  /** Named boxes to look at enlarged in every cell at once, as in `Compare`. */
  regions?: readonly Region[];
  /** Speeds offered. Default 0.1 to 2. */
  rates?: readonly number[];
  /** Moments the app names, drawn on the seek bar; pressing one goes there and pauses. */
  moments?: readonly { time: number; label: string }[];
  /** The looped range in seconds; give it with `onLoopChange` to keep it when the item changes. */
  loop?: VideoLoop;
  onLoopChange?: (loop: VideoLoop) => void;
  /** The `id` of the cell whose sound is heard. Default none: eight soundtracks at once are noise. */
  audio?: string | null;
  /** Draw nearest-neighbour when a video is shown larger than its own pixels (`zoomed`, default), always, or never. */
  pixelated?: "zoomed" | "always" | "never";
  /** Bind the keys on the window. Default true. */
  keys?: boolean;
  /** Shortcuts of the surrounding screen, bound with these and listed first in the same legend. */
  extraShortcuts?: Shortcut[];
  /** Drawn under the transport, above the legend. */
  footer?: React.ReactNode;
  className?: string;
};

const COLUMNS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

function Cell({ c, index, clock, blind, isReference, children }: { c: Candidate<VideoMedia>; index: number; clock: VideoClock; blind: boolean; isReference: boolean; children: (loading: boolean) => React.ReactNode }) {
  const view = useInView({ rootMargin: "200px", unsupported: true });
  const { setVisible } = clock;
  // The clock keeps the cell out of the sync while it is out of sight. (`setVisible` is new each render; only the visibility is a dependency.)
  const latest = React.useRef(setVisible);
  latest.current = setVisible;
  React.useEffect(() => latest.current(index, view.inView), [index, view.inView]);
  return (
    <figure ref={view.ref} className="grid content-start gap-1.5">
      <Caption c={c} blind={blind && !isReference} />
      {children(!clock.loaded)}
    </figure>
  );
}

/** Many videos in a grid on one clock, zoomed and panned together, with regions, a loop, stepping and full screen. */
export function CompareVideoGrid({ label, items, reference, blind, missing, catchingUp = "Catching up", actions, columns = 3, regions, rates = SLOW_RATES, moments = [], loop, onLoopChange, audio = null, pixelated = "zoomed", keys = true, extraShortcuts = [], footer, className }: CompareVideoGridProps) {
  const cells = reference ? [reference, ...items] : [...items];
  const first = cells[0];
  const fps = first?.media.fps ?? 30;
  const audioIndex = audio === null ? null : cells.findIndex((c) => c.id === audio);
  const clock = useVideoClock({ fps, loop, onLoopChange, audio: audioIndex === null || audioIndex < 0 ? null : audioIndex });
  const { viewport, setViewport } = useViewport();
  const [full, setFull] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const frameWidth = useWidth(frameRef);
  const key = cells.map((c) => c.media.src).join("|");
  const aspect = first ? first.media.width / first.media.height : 4 / 3;
  const natural = first ? ([first.media.width, first.media.height] as const) : null;
  const rg = useRegions({ regions, viewport, setViewport, frame: frameRef, reset: key });
  const zoom = useZoom({ viewport, setViewport: rg.setViewport, frame: frameRef, natural });
  const shortcuts: Shortcut[] = [...extraShortcuts, ...clock.shortcuts(), ...rg.shortcuts, ...zoomShortcuts(zoom, full, setFull)];
  useHotkeys(shortcuts, { enabled: keys });

  const frameHeight = frameWidth / aspect;
  const sharp = (c: Candidate<VideoMedia>, isReference: boolean) => {
    if (isReference || rg.active !== null) return true;
    if (pixelated !== "zoomed") return pixelated === "always";
    const drawn = Math.min(frameWidth, frameHeight * (c.media.width / c.media.height));
    return drawn > 0 && (viewport.scale * drawn) / c.media.width > 1;
  };

  return (
    <FullscreenFrame label={label} active={full} onActiveChange={setFull} className={className}>
      <section aria-label={label} className={cn("grid gap-3", full && "min-h-0 flex-1 content-start overflow-auto")}>
        <Toolbar label="Zoom" className="items-center gap-2">
          <ZoomControls viewport={viewport} zoom={zoom} natural={natural} />
          <ToolbarSeparator />
          <FullscreenButton full={full} setFull={setFull} />
        </Toolbar>
        <RegionChips state={rg} />
        {clock.failed && (
          <p role="alert" className="type-body-sm text-danger">
            {missing}
          </p>
        )}
        <div className={cn("grid gap-3", COLUMNS[columns])}>
          {cells.map((c, i) => {
            const isReference = reference !== undefined && i === 0;
            return (
              <Cell key={c.id} c={c} index={i} clock={clock} blind={blind} isReference={isReference}>
                {(loading) => (
                  <>
                    <ViewportFrame viewport={viewport} setViewport={rg.setViewport} onBox={clock.wanted ? undefined : rg.add} outline={rg.peek} aspect={aspect} maxHeight={VIEWPORT_HEIGHT} label={`Frame ${c.label}`} ref={i === 0 ? frameRef : undefined}>
                      {loading && <Skeleton aria-hidden className="absolute inset-0 size-full rounded-none" />}
                      <video
                        ref={clock.attach(i)}
                        src={c.media.src}
                        poster={c.media.poster}
                        preload={clock.started ? "auto" : "metadata"}
                        playsInline
                        aria-label={`Video ${c.label}`}
                        onLoadedMetadata={(e) => {
                          clock.restore(e);
                          // With only the metadata loaded a browser may draw no frame, so a cell would sit blank until the first play: a seek into the first frame makes it decode that one.
                          const v = e.currentTarget;
                          if (v.currentTime === 0 && v.readyState < 2) v.currentTime = 0.001;
                        }}
                        style={sharp(c, isReference) ? { imageRendering: "pixelated" } : undefined}
                        className="absolute inset-0 size-full object-contain"
                      />
                    </ViewportFrame>
                    {clock.behind.has(i) && (
                      <p role="status" className="type-caption text-muted-foreground">
                        {catchingUp}
                      </p>
                    )}
                    {actions && !isReference && <div className="flex flex-wrap gap-2">{actions(c)}</div>}
                  </>
                )}
              </Cell>
            );
          })}
        </div>
        <VideoControls clock={clock} rates={rates} moments={moments} />
        {footer}
        {keys && <KeysLegend shortcuts={shortcuts} />}
      </section>
    </FullscreenFrame>
  );
}
