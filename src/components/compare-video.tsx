import * as React from "react";
import { Slider as AriaSlider, SliderThumb, SliderTrack } from "react-aria-components";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { Button } from "./button";
import { FullscreenFrame } from "./fullscreen-frame";
import { KeysLegend, useHotkeys, type Shortcut } from "./hotkeys";
import { Skeleton } from "./data-view";
import { Caption, FullscreenButton, VIEWPORT_HEIGHT, ZoomControls, useZoom, zoomShortcuts } from "./compare-parts";
import type { Candidate, CompareMode, VideoMedia } from "./compare";
import { RateChoice, SeekBar, TimeReadout, Transport, VolumeControl } from "./media";
import { useMediaElement } from "./media-player";
import { Toolbar, ToolbarSeparator } from "./toolbar";
import { ToggleGroup } from "./toggle";
import { Slider } from "./value-controls";
import { ViewportFrame, useViewport } from "./viewport";

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
// Checked: React Aria has no video player or comparison part; the transport, seek bar and rate
// choice are the media parts built on its slider, toolbar and select, and the swipe divider is its
// slider, as in `Compare`.

/** The views a pair of videos has: pictures' views without the difference, which needs pixels. */
export type VideoMode = Exclude<CompareMode, "difference">;

const MODES: readonly VideoMode[] = ["side", "swipe", "fade", "blink"];
const MODE_LABEL: Record<VideoMode, string> = { side: "Side by side", swipe: "Swipe", fade: "Fade", blink: "Blink" };

/** A range to loop, in seconds of the clip; the same seconds in both videos. */
export type VideoLoop = { start: number | null; end: number | null };

const SLOW_RATES = [0.1, 0.25, 0.5, 1, 1.25, 1.5, 2] as const;

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
  /** Which video's sound is heard; the other is muted. Default "a". */
  audio?: "a" | "b" | "none";
  /** Draw nearest-neighbour when shown larger than the video's own pixels (`zoomed`, default), always, or never. */
  pixelated?: "zoomed" | "always" | "never";
  /** How tall a frame may be: a CSS length or `"viewport"`, as in `Compare`. */
  maxHeight?: string;
  /** Bind the keys on the window. Default true. */
  keys?: boolean;
  /** Shortcuts of the surrounding screen, bound with these and listed first in the same legend. */
  extraShortcuts?: Shortcut[];
  /** Drawn under the video, above the legend, and kept in full screen: where a vote bar goes. */
  footer?: React.ReactNode;
  className?: string;
};

// Width of an element, kept current, for "is this shown larger than its pixels".
function useWidth(ref: React.RefObject<HTMLElement | null>) {
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

/** Two videos to judge by eye on one clock: side by side, swipe, fade or blink, zoomed together, with matched sound and full screen. */
export function CompareVideo({ label, a, b, blind, missing, mode, onModeChange, rates = SLOW_RATES, moments = [], loop: loopProp, onLoopChange, audio = "a", pixelated = "zoomed", maxHeight, keys = true, extraShortcuts = [], footer, className }: CompareVideoProps) {
  const refA = React.useRef<HTMLVideoElement>(null);
  const refB = React.useRef<HTMLVideoElement>(null);
  const sa = useMediaElement(refA);
  const sb = useMediaElement(refB);
  const { viewport, setViewport } = useViewport();
  const [full, setFull] = React.useState(false);
  const [divider, setDivider] = React.useState(50);
  const [blend, setBlend] = React.useState(50);
  const [showing, setShowing] = React.useState<"a" | "b">("a");
  const [volume, setVolume] = React.useState(100);
  const [muted, setMuted] = React.useState(false);
  // What the person asked for, which can differ from what the elements are doing while one waits for the other.
  const [wanted, setWanted] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const frameWidth = useWidth(frameRef);

  const fps = a.media.fps ?? 30;
  const known = [sa.duration, sb.duration].filter((d): d is number => d !== null);
  const duration = known.length ? Math.min(...known) : null;
  const failed = sa.error || sb.error;

  // ---- the clock ----
  const play = () => {
    setWanted(true);
    void sa.play();
    void sb.play();
  };
  const pause = () => {
    setWanted(false);
    sa.pause();
    sb.pause();
  };
  const toggle = () => (wanted ? pause() : play());
  const seek = (time: number) => {
    const t = Math.max(0, duration === null ? time : Math.min(time, duration));
    sa.seek(t);
    sb.seek(t);
  };
  // Frame by frame: the centre of the next or previous frame, so a step cannot land on a boundary and show the wrong one.
  const step = (direction: 1 | -1) => {
    pause();
    const frame = Math.floor(sa.time * fps + 1e-6);
    seek(Math.max(0, (frame + direction + 0.5) / fps));
  };
  // The loop is the app's when it gives one, so it survives a change of pair; otherwise ours.
  const [ownLoop, setOwnLoop] = React.useState<VideoLoop>({ start: null, end: null });
  const loop = loopProp ?? ownLoop;
  const setLoop = (next: VideoLoop) => {
    setOwnLoop(next);
    onLoopChange?.(next);
  };
  const loopRef = React.useRef(loop);
  loopRef.current = loop;
  const setPoint = (point: "start" | "end") => {
    const t = sa.time;
    const other = point === "start" ? loop.end : loop.start;
    // A start after the end (or an end before the start) replaces the other point.
    const clash = other !== null && (point === "start" ? t >= other : t <= other);
    setLoop(clash ? { start: point === "start" ? t : null, end: point === "end" ? t : null } : { ...loop, [point]: t });
  };
  const clearLoop = () => setLoop({ start: null, end: null });
  const looping = loop.start !== null && loop.end !== null;
  // Kept here, not read back from an element, so a view change's new elements get it too.
  const chosenRate = React.useRef(1);
  const setRate = (rate: number) => {
    chosenRate.current = rate;
    sa.setRate(rate);
    sb.setRate(rate);
  };

  // Either video reaching its end ends the play for both: the clock runs to the shorter one's end, which is the length shown.
  React.useEffect(() => {
    if (sa.ended || sb.ended) {
      setWanted(false);
      refA.current?.pause();
      refB.current?.pause();
    }
  }, [sa.ended, sb.ended]);

  React.useEffect(() => {
    if (!wanted) return;
    let held = false;
    let frame = requestAnimationFrame(function tick() {
      const A = refA.current;
      const B = refB.current;
      if (A && B && !A.ended && !B.ended) {
        const ready = A.readyState >= 3 && B.readyState >= 3;
        if (!ready) {
          if (!held) {
            held = true;
            A.pause();
            B.pause();
          }
        } else if (held) {
          held = false;
          void A.play();
          void B.play();
        } else if (!A.paused) {
          const { start, end } = loopRef.current;
          if (start !== null && end !== null && A.currentTime >= end) {
            A.currentTime = start;
            B.currentTime = start;
            frame = requestAnimationFrame(tick);
            return;
          }
          const drift = B.currentTime - A.currentTime;
          const one = 1 / fps;
          if (Math.abs(drift) > 0.3) B.currentTime = A.currentTime;
          else if (Math.abs(drift) > one) B.playbackRate = A.playbackRate * (drift > 0 ? 0.97 : 1.03);
          else if (Math.abs(drift) < one / 2 && B.playbackRate !== A.playbackRate) B.playbackRate = A.playbackRate;
        }
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [wanted, fps]);

  // New elements (a view change) come back to where the old ones were.
  const resume = React.useRef({ time: 0, playing: false });
  if (sa.duration !== null) resume.current = { time: sa.time, playing: wanted };
  const restore = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.defaultPlaybackRate = chosenRate.current;
    el.playbackRate = chosenRate.current;
    if (resume.current.time > 0) el.currentTime = resume.current.time;
    if (resume.current.playing) void el.play();
  };

  // One sound: the chosen video at the volume, the rest muted.
  React.useEffect(() => {
    [[refA.current, "a"], [refB.current, "b"]].forEach(([el, side]) => {
      if (!(el instanceof HTMLVideoElement)) return;
      el.muted = audio !== side || muted || volume === 0;
      el.volume = volume / 100;
    });
  });

  // ---- the picture ----
  const aspect = a.media.width / a.media.height;
  const natural = [a.media.width, a.media.height] as const;
  // Each video against its own pixels: the one drawn larger than its pixels is nearest-neighbour, the other not.
  const frameHeight = frameWidth / aspect;
  const sharpFor = (c: Candidate<VideoMedia>) => {
    if (pixelated !== "zoomed") return pixelated === "always";
    const drawn = Math.min(frameWidth, frameHeight * (c.media.width / c.media.height));
    return drawn > 0 && (viewport.scale * drawn) / c.media.width > 1;
  };
  const zoom = useZoom({ viewport, setViewport, frame: frameRef, natural });
  const flip = () => setShowing((s) => (s === "a" ? "b" : "a"));

  const video = (c: Candidate<VideoMedia>, ref: React.RefObject<HTMLVideoElement | null>) => (
    <video
      ref={ref}
      src={c.media.src}
      poster={c.media.poster}
      preload="auto"
      playsInline
      aria-label={`Video ${c.label}`}
      onLoadedMetadata={restore}
      style={sharpFor(c) ? { imageRendering: "pixelated" } : undefined}
      className="absolute inset-0 size-full object-contain"
    />
  );
  const loading = !failed && (sa.duration === null || sb.duration === null);
  const skeleton = loading && <Skeleton aria-hidden className="absolute inset-0 size-full rounded-none" />;
  const frameProps = { viewport, setViewport, aspect, maxHeight: maxHeight === "viewport" ? VIEWPORT_HEIGHT : maxHeight };

  const shortcuts: Shortcut[] = [
    ...extraShortcuts,
    ...MODES.map((m, i): Shortcut => ({ keys: [String(i + 1)], label: MODE_LABEL[m], run: () => onModeChange(m) })),
    { keys: ["x"], label: `Flip ${a.label} and ${b.label}`, run: flip, disabled: mode !== "blink" },
    { keys: [" ", "k"], label: "Play or pause", run: toggle },
    { keys: ["j"], label: "Back 1 s", run: () => seek(sa.time - 1), repeat: true },
    { keys: ["l"], label: "Forward 1 s", run: () => seek(sa.time + 1), repeat: true },
    { keys: [","], label: "Back one frame", run: () => step(-1), repeat: true },
    { keys: ["."], label: "Forward one frame", run: () => step(1), repeat: true },
    { keys: ["i"], label: "Loop starts here", run: () => setPoint("start") },
    { keys: ["o"], label: "Loop ends here", run: () => setPoint("end") },
    { keys: ["c"], label: "Clear the loop", run: clearLoop, disabled: loop.start === null && loop.end === null },
    ...(audio === "none" ? [] : [{ keys: ["m"], label: "Mute", run: () => setMuted((m) => !m) }]),
    ...zoomShortcuts(zoom, full, setFull),
  ];
  useHotkeys(shortcuts, { enabled: keys });

  const at = (t: number | null) => (t === null ? format.missing : format.timecode(t, { precision: "frames", fps }));
  const marks = [
    ...moments,
    ...(loop.start !== null ? [{ time: loop.start, label: "Loop start" }] : []),
    ...(loop.end !== null ? [{ time: loop.end, label: "Loop end" }] : []),
  ];

  let body: React.ReactNode;
  if (mode === "side") {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {([[a, refA], [b, refB]] as const).map(([c, ref], i) => (
          <figure key={i} className="grid gap-1.5">
            <Caption c={c} blind={blind} />
            <ViewportFrame {...frameProps} label={`Frame ${c.label}`} ref={i === 0 ? frameRef : undefined}>
              {i === 0 && skeleton}
              {video(c, ref)}
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
          cover={mode === "swipe" ? { content: video(a, refA), shown: divider } : undefined}
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
          {video(b, refB)}
          {mode !== "swipe" && <div className="absolute inset-0" style={mode === "fade" ? { opacity: 1 - blend / 100 } : mode === "blink" ? { opacity: showing === "a" ? 1 : 0 } : undefined}>{video(a, refA)}</div>}
        </ViewportFrame>
      </figure>
    );
  }

  return (
    <FullscreenFrame label={label} active={full} onActiveChange={setFull} className={className}>
      <section aria-label={label} className={cn("grid gap-3", full && "min-h-0 flex-1 content-start overflow-auto")}>
        <Toolbar label="Comparison view" className="items-center gap-2">
          <ToggleGroup label="View" options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={mode} onChange={(v) => onModeChange(v as VideoMode)} size="sm" />
          <ToolbarSeparator />
          <ZoomControls viewport={viewport} zoom={zoom} natural={natural} />
          <ToolbarSeparator />
          <FullscreenButton full={full} setFull={setFull} />
        </Toolbar>
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
        <Transport playing={wanted} onPlayPause={toggle} onStepBack={() => step(-1)} onStepForward={() => step(1)}>
          <TimeReadout time={sa.time} duration={duration} precision="frames" fps={fps} />
          <SeekBar time={sa.time} duration={duration} onSeek={seek} marks={marks} onMarkPress={(m) => (pause(), seek(m.time))} buffered={sa.buffered} label="Position" step={1} precision="frames" fps={fps} />
          <RateChoice rate={sa.rate} onRateChange={setRate} rates={rates} />
          {audio !== "none" && <VolumeControl volume={muted ? 0 : volume} onVolumeChange={(v) => (setMuted(false), setVolume(v))} />}
        </Transport>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onPress={() => setPoint("start")} disabled={duration === null}>
            Loop starts here
          </Button>
          <Button size="sm" onPress={() => setPoint("end")} disabled={duration === null}>
            Loop ends here
          </Button>
          <Button size="sm" variant="ghost" onPress={clearLoop} disabled={loop.start === null && loop.end === null}>
            Clear the loop
          </Button>
          <span role="status" className="type-caption tabular-nums text-muted-foreground">
            {looping ? `Looping ${at(loop.start)} to ${at(loop.end)}` : loop.start !== null ? `Loop starts at ${at(loop.start)}` : loop.end !== null ? `Loop ends at ${at(loop.end)}` : "No loop"}
          </span>
        </div>
        {footer}
        {keys && <KeysLegend shortcuts={shortcuts} />}
      </section>
    </FullscreenFrame>
  );
}
