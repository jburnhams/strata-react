import * as React from "react";
import { Slider as AriaSlider, SliderThumb, SliderTrack } from "react-aria-components";
import { cn } from "../lib/utils";
import { FullscreenFrame } from "./fullscreen-frame";
import { KeysLegend, useHotkeys, type Shortcut } from "./hotkeys";
import { Skeleton } from "./data-view";
import { Caption, FullscreenButton, ZoomControls, frameCap, makePicker, useFitHeight, useWidth, useZoom, zoomShortcuts, type PickWords } from "./compare-parts";
import type { Candidate, CompareMode, VideoMedia } from "./compare";
import { SLOW_RATES, VideoControls, useVideoClock, type VideoLoop } from "./video-clock";
import { Toolbar, ToolbarSeparator } from "./toolbar";
import { ToggleGroup } from "./toggle";
import { Slider } from "./value-controls";
import { ViewportFrame, useViewport } from "./viewport";
import { RegionChips, useRegions } from "./compare-regions";
import type { Region } from "../lib/viewport";

// Two videos of the same thing on ONE clock, to be judged blind by eye. What the video-enhance eval
// in strata-models needs and two plain <video> elements cannot give: the interesting views (the swipe
// divider over moving picture, blink between A and B on the same frame) only mean something if both
// sides show the same instant, and zoom and pan must stay locked across them while they play.
//
// The clock: play, pause, seek and rate go to both elements; the first video is the leader. While it
// plays, a requestAnimationFrame loop keeps the follower within a frame (`fps`, default 30) of it: a
// follower more than a frame off has its rate nudged by 3% towards the leader, one more than 0.3 s
// off is seeked to it, and when either side has not got its next frames (readyState below 3) BOTH
// are paused until both have, so a stall on one side is never seen as the other side running ahead.
// requestVideoFrameCallback was considered for the loop and not used: it fires only when the leader
// presents a frame, which is the one time a stall cannot be seen; a display-frame loop sees both and
// costs nothing at 25 to 50 fps content. Known limit: a seek is not hidden while the two decoders
// catch up (a video element cannot hold its old frame), it is corrected by the same loop; playback
// after a seek waits for both.
//
// Sizes: candidates may differ in pixels (1440×1080 against 2816×2304). Both are drawn `object-contain`
// in the same box whose shape is the first candidate's `width`/`height`, so neither looks bigger.
// Zoom is the shared `useViewport` of `Compare`; `pixelated` draws nearest-neighbour once the picture
// is shown larger than its own pixels (default), so a judge sees real pixels, not a smoothed guess.
//
// Views: side by side, swipe, fade and blink, the same as pictures. Changing view puts the videos in
// a different place in the tree, so the browser makes new elements; the clock remembers the time and
// whether it was playing and puts the new ones back there when they have their metadata.
//
// Sound: one source, the app's choice (`audio`, default "a"; the outputs normally share it), the
// other muted, so two soundtracks never play at once.
//
// Blind: the same rules as `Compare`. Only `label` names a video on the page; id, note and any
// description are never written. `src` and `poster` reach the DOM, so a blind caller serves them
// under neutral addresses.
//
// Looking at a moment: `,` and `.` step one frame (to the centre of the next frame, so a step cannot
// land on a boundary and show the wrong one; they repeat when held), `i` and `o` set a loop's start
// and end at the playhead and `c` clears it, kept in seconds because both videos show the same
// moments; the app may hold the range (`loop`, `onLoopChange`) so it survives a change of pair.
// Speeds go down to 0.1. `moments` are the app's named points on the seek bar; pressing one goes
// there and pauses. Not done: dragging the loop's ends on the seek bar (the marks show them, the keys
// and buttons set them) and confirming a step with requestVideoFrameCallback's `mediaTime`.
//
// Keys: `1` to `4` views, `x` flips in blink, Space and `k` play, `j` and `l` go back and forward a
// second, `m` mutes, `+` `-` `0` `f` zoom and full screen. `a`, `b`, `t` and `s` are left to a
// `PairVote`; arrows are left to the picture (they pan once zoomed). One list for the keys and the
// legend (`extraShortcuts`).
//
// Click to choose (issue #201): as in `Compare`, `onPick` is called with the side clicked, whether the
// clip plays or is paused (a click never toggles play: that stays on Space and the transport), in
// side by side (the cell), swipe (the side of the divider), blink (the side showing), and on a
// region's crop (the crop is the same frame, so a click on the enlarged face of X picks X). Fade has
// no pick and says so. `CompareVideoGrid` has no vote and no pick.
//
// Judging short clips (issue #203): `autoPlay` starts the pair when it loads (muted, and again for
// each new pair) and `loopWhole` loops the whole clip; both are the clock's (video-clock.tsx), with the
// reasons there. A new pair now starts at 0, paused or autoplaying.
//
// Checked: React Aria has no video player or comparison part; the transport, seek bar and rate
// choice are the media parts built on its slider, toolbar and select, and the swipe divider is its
// slider, as in `Compare`.

/** The views a pair of videos has: pictures' views without the difference, which needs pixels. */
export type VideoMode = Exclude<CompareMode, "difference">;

const MODES: readonly VideoMode[] = ["side", "swipe", "fade", "blink"];
const MODE_LABEL: Record<VideoMode, string> = { side: "Side by side", swipe: "Swipe", fade: "Fade", blink: "Blink" };

export type { VideoLoop };

/** Props for `CompareVideo`. */
export type CompareVideoProps = {
  /** Names the comparison for screen readers. Required. */
  label: string;
  a: Candidate<VideoMedia>;
  b: Candidate<VideoMedia>;
  /** Whether the person must not learn which video is which. Required, no default. */
  blind: boolean;
  /** The words shown when a video cannot be loaded: "Video not found". Required. */
  missing: string;
  mode: VideoMode;
  onModeChange: (mode: VideoMode) => void;
  /** Speeds offered. Default 0.1, 0.25, 0.5, 1, 1.25, 1.5, 2: slow motion for sitting on a moment. */
  rates?: readonly number[];
  /** Moments the app names ("fast motion"), drawn on the seek bar; pressing one goes there and pauses. */
  moments?: readonly { time: number; label: string }[];
  /** The looped range in seconds, `null` for an end not set. Give it (with `onLoopChange`) to keep the range when the pair changes to another of the same item. Without it the component keeps its own. */
  loop?: VideoLoop;
  onLoopChange?: (loop: VideoLoop) => void;
  /** Named boxes to look at enlarged, as in `Compare`, on the same clock; a box drawn by hand (Shift-drag) is for a paused clip. Nearest-neighbour while one is shown. */
  regions?: readonly Region[];
  /** Called with the side clicked or tapped (side by side, swipe by the side of the divider, blink the side showing; not fade), whether the clip plays or not. A click never toggles play. A `PairVote` or `PairJudge` slot sets this. */
  onPick?: (side: "a" | "b") => void;
  /** Whether a click chooses at all when `onPick` is given. Default true; `false` for a screen where a click must only pan. */
  pick?: boolean;
  /** Words for click to choose. Defaults say "Click to choose A". */
  pickWords?: PickWords;
  /** Start playing when the pair has loaded, muted (unless the person has chosen a sound level), and again for each new pair. Off with reduced motion unless `"always"`. If the browser refuses, the pair stays paused with Play showing. Default false. */
  autoPlay?: boolean | "always";
  /** Loop the whole clip, from its end back to 0, until the judge answers. A range set with `i` and `o` wins while both ends are set; `c` goes back to the whole clip. Default false. */
  loopWhole?: boolean;
  /** Which video's sound is heard; the other is muted. Default "a". */
  audio?: "a" | "b" | "none";
  /** Draw nearest-neighbour when shown larger than the video's own pixels (`zoomed`, default), always, or never. */
  pixelated?: "zoomed" | "always" | "never";
  /** How tall a frame may be: a CSS length, `"viewport"` (a fixed guess) or `"fit"` (measured), as in `Compare`; full screen fills what the controls leave. */
  maxHeight?: string;
  /** With `maxHeight="fit"`: pixels of the page below this that it cannot measure, as in `Compare`. Default 0. */
  reserve?: number;
  /** Bind the keys on the window. Default true. */
  keys?: boolean;
  /** Shortcuts of the surrounding screen, bound with these and listed first in the same legend. */
  extraShortcuts?: Shortcut[];
  /** Drawn under the video, above the legend, and kept in full screen: where a vote bar goes. */
  footer?: React.ReactNode;
  className?: string;
};

/** Two videos to judge by eye on one clock: side by side, swipe, fade or blink, zoomed together, with matched sound and full screen. */
export function CompareVideo({ label, a, b, blind, missing, mode, onModeChange, rates = SLOW_RATES, regions, moments = [], loop: loopProp, onLoopChange, audio = "a", onPick, pick = true, pickWords, autoPlay = false, loopWhole = false, pixelated = "zoomed", maxHeight, reserve, keys = true, extraShortcuts = [], footer, className }: CompareVideoProps) {
  const clock = useVideoClock({ fps: a.media.fps ?? 30, loop: loopProp, onLoopChange, audio: audio === "none" ? null : audio === "a" ? 0 : 1, autoPlay, loopWhole, pairKey: `${a.media.src}|${b.media.src}` });
  const picker = pick && onPick ? makePicker(a, b, onPick, pickWords) : null;
  const { viewport, setViewport } = useViewport();
  const [full, setFull] = React.useState(false);
  const [divider, setDivider] = React.useState(50);
  const [blend, setBlend] = React.useState(50);
  const [showing, setShowing] = React.useState<"a" | "b">("a");
  const frameRef = React.useRef<HTMLDivElement>(null);
  const frameWidth = useWidth(frameRef);
  const { wanted, failed } = clock;

  // ---- the picture ----
  const aspect = a.media.width / a.media.height;
  const sectionRef = React.useRef<HTMLElement>(null);
  const fit = useFitHeight(sectionRef, { enabled: maxHeight === "fit" || full, full, reserve });
  const natural = [a.media.width, a.media.height] as const;
  // Each video against its own pixels: the one drawn larger than its pixels is nearest-neighbour, the other not.
  const frameHeight = frameWidth / aspect;
  const sharpFor = (c: Candidate<VideoMedia>) => {
    if (rg.active !== null) return true;
    if (pixelated !== "zoomed") return pixelated === "always";
    const drawn = Math.min(frameWidth, frameHeight * (c.media.width / c.media.height));
    return drawn > 0 && (viewport.scale * drawn) / c.media.width > 1;
  };
  const rg = useRegions({ regions, viewport, setViewport, frame: frameRef, reset: `${a.media.src}|${b.media.src}` });
  const zoom = useZoom({ viewport, setViewport: rg.setViewport, frame: frameRef, natural });
  const flip = () => setShowing((s) => (s === "a" ? "b" : "a"));

  const video = (c: Candidate<VideoMedia>, index: number) => (
    <video
      ref={clock.attach(index)}
      src={c.media.src}
      poster={c.media.poster}
      preload="auto"
      playsInline
      aria-label={`Video ${c.label}`}
      onLoadedMetadata={clock.restore}
      style={sharpFor(c) ? { imageRendering: "pixelated" } : undefined}
      className="absolute inset-0 size-full object-contain"
    />
  );
  const loading = !failed && !clock.loaded;
  const skeleton = loading && <Skeleton aria-hidden className="absolute inset-0 size-full rounded-none" />;
  const frameProps = { viewport, setViewport: rg.setViewport, onBox: wanted ? undefined : rg.add, outline: rg.peek, aspect, maxHeight: frameCap(maxHeight, fit, full) };

  const shortcuts: Shortcut[] = [
    ...extraShortcuts,
    ...MODES.map((m, i): Shortcut => ({ keys: [String(i + 1)], label: MODE_LABEL[m], run: () => onModeChange(m) })),
    { keys: ["x"], label: `Flip ${a.label} and ${b.label}`, run: flip, disabled: mode !== "blink" },
    ...clock.shortcuts(),
    ...rg.shortcuts,
    ...zoomShortcuts(zoom, full, setFull),
  ];
  useHotkeys(shortcuts, { enabled: keys });

  let body: React.ReactNode;
  if (mode === "side") {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {([a, b] as const).map((c, i) => (
          <figure key={i} className="grid gap-1.5">
            <Caption c={c} blind={blind} />
            <ViewportFrame {...frameProps} label={`Frame ${c.label}`} ref={i === 0 ? frameRef : undefined} pick={picker?.one(i === 0 ? "a" : "b")}>
              {i === 0 && skeleton}
              {video(c, i)}
            </ViewportFrame>
          </figure>
        ))}
      </div>
    );
  } else {
    // One frame, both videos in it. Swipe clips A at the divider; fade lays A over B at an opacity; blink shows one at a time. Both always play.
    body = (
      <figure className="grid gap-1.5">
        <div className="flex justify-between gap-4">
          {mode === "blink" ? <Caption c={showing === "a" ? a : b} blind={blind} /> : <Caption c={a} blind={blind} />}
          {mode !== "blink" && <Caption c={b} blind={blind} />}
        </div>
        <ViewportFrame
          {...frameProps}
          ref={frameRef}
          cover={mode === "swipe" ? { content: video(a, 0), shown: divider } : undefined}
          pick={mode === "swipe" ? picker?.split(divider) : mode === "blink" ? picker?.one(showing) : undefined}
          label={mode === "blink" ? `Frame ${(showing === "a" ? a : b).label}` : `${a.label} over ${b.label}`}
          overlay={
            mode === "swipe" && (
              <AriaSlider aria-label={`Divider between ${a.label} and ${b.label}`} value={divider} onChange={(v) => setDivider(v as number)} minValue={0} maxValue={100} step={1} className="absolute inset-0">
                <SliderTrack className="pointer-events-none h-full w-full">
                  <SliderThumb className="pointer-events-auto grid h-full w-8 cursor-ew-resize place-items-center focus-visible:outline-2 focus-visible:outline-ring" style={{ top: "50%" }}>
                    <span aria-hidden className="col-start-1 row-start-1 h-full w-1 border-x border-background bg-foreground" />
                    <span aria-hidden className="col-start-1 row-start-1 size-6 rounded-pill border-2 border-foreground bg-background" />
                  </SliderThumb>
                </SliderTrack>
              </AriaSlider>
            )
          }
        >
          {skeleton}
          {video(b, 1)}
          {mode !== "swipe" && <div className="absolute inset-0" style={mode === "fade" ? { opacity: 1 - blend / 100 } : mode === "blink" ? { opacity: showing === "a" ? 1 : 0 } : undefined}>{video(a, 0)}</div>}
        </ViewportFrame>
      </figure>
    );
  }

  return (
    <FullscreenFrame label={label} active={full} onActiveChange={setFull} className={className}>
      <section ref={sectionRef} aria-label={label} className={cn("grid gap-3", full && "min-h-0 flex-1 content-start overflow-auto")}>
        <Toolbar label="Comparison view" className="items-center gap-2">
          <ToggleGroup label="View" options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={(v) => onModeChange(v as VideoMode)} size="sm" />
          <ToolbarSeparator />
          <ZoomControls viewport={viewport} zoom={zoom} natural={natural} />
          <ToolbarSeparator />
          <FullscreenButton full={full} setFull={setFull} />
        </Toolbar>
        <RegionChips state={rg} />
        {picker && mode === "fade" && <p className="type-caption text-muted-foreground">{picker.unavailable(MODE_LABEL.fade)}</p>}
        {mode === "fade" && (
          <div className="flex items-center gap-3">
            <span className="type-caption text-muted-foreground">{a.label}</span>
            <Slider aria-label={`Blend from ${a.label} to ${b.label}`} value={blend} onChange={setBlend} min={0} max={100} unit="%" hideValue className="flex-1" />
            <span className="type-caption text-muted-foreground">{b.label}</span>
          </div>
        )}
        {mode === "blink" && <ToggleGroup label="Showing" options={[{ value: "a", label: a.label }, { value: "b", label: b.label }]} value={showing} onChange={(v) => setShowing(v as "a" | "b")} size="sm" className="justify-self-start" />}
        {failed && (
          <p role="alert" className="type-body-sm text-danger">
            {missing}
          </p>
        )}
        {body}
        <VideoControls clock={clock} rates={rates} moments={moments} />
        {footer}
        {keys && <KeysLegend shortcuts={shortcuts} />}
      </section>
    </FullscreenFrame>
  );
}
