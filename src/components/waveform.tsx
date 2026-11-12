import * as React from "react";
import { VisuallyHidden, mergeProps, useFocusRing, useSlider, useSliderThumb } from "react-aria";
import { useSliderState } from "react-stately";
import { format } from "../lib/format";
import { useClientWork } from "../lib/client-work";
import { clampView, peaksBetween, peaksFromAudio, timeAt, toPeakPair, type DecodedAudio, type PeakPair, type WaveformPeaks } from "../lib/waveform";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { JobStatus } from "./job-status";

// An audio waveform to see where things are and to seek by (strata-react issue #185, from
// strata-360's music panel: the track's waveform from server peaks, a spectrogram beneath, bar lines,
// the first downbeat, sung spans, click to seek). `SeekBar` shows a line; this shows the sound, so a
// person can put the playhead on the beat or the start of the voice instead of guessing.
//
// - **Peaks in, or a file in.** `peaks` (a magnitude per slice, or lowest and highest per slice, any
//   length) are resampled to the width on every draw, so a window resize or a zoom never needs the
//   server. A `source` (URL or Blob) is fetched and decoded here as `useClientWork`, so the plot says
//   "Reading the waveform" with progress and Cancel (`JobStatus`), a failure says why and offers Try
//   again, and a long file does not freeze the page (the reduction runs in chunks that yield).
// - **One slider**, like `SeekBar` and for the same reasons: React Aria's `useSlider`/`useSliderThumb`
//   own the pointer, the hidden range input and its name, and the value text is the time ("1:23"), not
//   a number. Checked in the hooks: the track maps its width onto `minValue`..`maxValue`, so when the
//   view is zoomed the slider's range is the *visible* range and a click lands where it is drawn; the
//   keys are ours (the hooks have one `step`), as in `SeekBar`: arrows `step` seconds, Shift or Page
//   keys `bigStep`, Home and End the ends of the file.
// - **Zoom** with `+`, `-` and `0` on the slider, Ctrl or Cmd and the wheel (a trackpad pinch is
//   that), and a sideways swipe to pan. The view follows the playhead when it leaves it.
// - **A range** (loops, windows, a stretch to keep): Shift and drag, or `[` and `]` to set its ends at
//   the playhead, Escape to clear it. It is `range`/`onRangeChange`, held by the app when it wants
//   (otherwise by the component). The range is what `MediaPlayer`'s `window` takes.
// - **Marks and spans are named**, not only drawn: each kind of mark has its own line (thin, medium,
//   heavy, dashed), spans are tinted bands with a bar along the top, and a list for screen readers
//   names every span and every labelled mark with its time. Beats are drawn but not listed
//   (`listed` turns that around): 400 of them is not a list.
// - **No hue of its own**: the played part is the primary role, the rest the muted foreground; spans
//   take a tone's subtle role. The height is a multiple of `--control-h`, so `Density` scales it.
//   Nothing animates, so reduced motion has nothing to turn off.
// - **Underlay**: a node (a spectrogram `<img>`) laid under the plot and stretched to the same x axis,
//   so it zooms and pans with it.
//
// Checked: React Aria has no waveform, and its slider hooks do the rest, as above.

/** What a mark is, which sets how its line is drawn. */
export type WaveformMarkKind = "beat" | "bar" | "downbeat" | "chapter";

/** A moment on the waveform: a beat, a bar line, the first downbeat, a chapter. */
export type WaveformMark = { time: number; label?: string; kind?: WaveformMarkKind; /** In the list for screen readers. Default: yes, except beats. */ listed?: boolean };

/** Shading tones for spans. */
export type WaveformTone = "neutral" | "info" | "success" | "warning" | "danger";

/** A stretch of the file: voice, silence, a chosen part. */
export type WaveformSpan = { from: number; to: number; label: string; tone?: WaveformTone };

const TONE: Record<WaveformTone, { fill: string; edge: string }> = {
  neutral: { fill: "var(--muted)", edge: "var(--muted-foreground)" },
  info: { fill: "var(--info-subtle)", edge: "var(--info)" },
  success: { fill: "var(--success-subtle)", edge: "var(--success)" },
  warning: { fill: "var(--warning-subtle)", edge: "var(--warning)" },
  danger: { fill: "var(--danger-subtle)", edge: "var(--danger)" },
};

const MARK_LINE: Record<WaveformMarkKind, { width: number; opacity: number; dash?: string }> = {
  beat: { width: 1, opacity: 0.3 },
  bar: { width: 1.5, opacity: 0.55 },
  downbeat: { width: 2.5, opacity: 1 },
  chapter: { width: 1.5, opacity: 0.9, dash: "4 3" },
};

type Common = {
  /** Names the waveform: "Waveform of the interview". */
  label: string;
  /** Seconds. Needed with `peaks`; with `source` it defaults to the decoded file's. */
  duration?: number;
  /** The playhead, seconds. */
  time: number;
  /** A click, a drag or a key moved the playhead. */
  onSeek: (time: number) => void;
  marks?: readonly WaveformMark[];
  spans?: readonly WaveformSpan[];
  /** A picture under the plot on the same x axis (a spectrogram `<img>`): it is stretched to the file's length and follows the zoom. */
  underlay?: React.ReactNode;
  /** The chosen range, seconds, or null. Leave out to let the component hold it. */
  range?: readonly [number, number] | null;
  onRangeChange?: (range: [number, number] | null) => void;
  /** Seconds an arrow key moves. Default 5. */
  step?: number;
  /** Seconds Shift or a Page key moves. Default 30. */
  bigStep?: number;
  /** How many peaks a decoded file is reduced to. Default 2000. */
  buckets?: number;
  /** Turns a decoded file into samples. Default: the browser's `AudioContext.decodeAudioData`. */
  decode?: (data: ArrayBuffer) => Promise<DecodedAudio>;
  /** The words of the reading state; defaults say "Reading the waveform". */
  words?: { running: string; finished: string; failed: string };
  disabled?: boolean;
  className?: string;
};

/** `peaks` or a `source` to decode: one of them, so a waveform with nothing to draw cannot be written. */
export type WaveformProps = Common & ({ peaks: WaveformPeaks; source?: never } | { source: string | Blob; peaks?: never });

const WORDS = { running: "Reading the waveform", finished: "Waveform ready", failed: "Could not read the waveform" };

async function defaultDecode(data: ArrayBuffer): Promise<DecodedAudio> {
  const Context: typeof AudioContext | undefined = typeof AudioContext !== "undefined" ? AudioContext : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("This browser cannot decode audio.");
  const ctx = new Context();
  try {
    return await ctx.decodeAudioData(data);
  } finally {
    void ctx.close?.();
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const clock = (t: number) => format.runningTime(t);

/** An audio waveform with marks, spans and a playhead: one slider you click, drag or key to seek, zoom, and a range to select. */
export function Waveform({ label, peaks, source, duration: given, time, onSeek, marks = [], spans = [], underlay, range: controlledRange, onRangeChange, step = 5, bigStep = 30, buckets = 2000, decode = defaultDecode, words = WORDS, disabled, className }: WaveformProps) {
  // Peaks: given, or read from the file.
  const work = useClientWork<{ pair: PeakPair; duration: number }>(async ({ signal, progress }) => {
    const data = typeof source === "string" ? await (await fetch(source, { signal })).arrayBuffer() : await (source as Blob).arrayBuffer();
    progress(0, buckets + 2);
    const audio = await decode(data);
    if (signal.aborted) throw new DOMException("The waveform was cancelled.", "AbortError");
    progress(1, buckets + 2);
    const pair = await peaksFromAudio(audio, buckets, { signal, progress: (done) => progress(done + 1, buckets + 2) });
    return { pair, duration: audio.duration };
  });
  const startWork = work.start;
  const cancelWork = work.cancel;
  React.useEffect(() => {
    if (source === undefined) return;
    void startWork();
    return cancelWork;
  }, [source, startWork, cancelWork]);

  const given_ = React.useMemo(() => (peaks === undefined ? null : toPeakPair(peaks)), [peaks]);
  const pair = given_ ?? (work.phase === "finished" ? work.result!.pair : null);
  const duration = given ?? (work.phase === "finished" ? work.result!.duration : 0);
  const ready = pair !== null && duration > 0;

  // The view: the part of the file in the plot.
  const [view, setView] = React.useState<[number, number] | null>(null);
  const [v0, v1] = view ? clampView(view[0], view[1] - view[0], duration || 1) : [0, duration];
  const zoomed = ready && v1 - v0 < duration - 1e-6;
  const span = Math.max(v1 - v0, 1e-6);
  const zoomBy = (factor: number, about?: number) => {
    const centre = about ?? (time >= v0 && time <= v1 ? time : (v0 + v1) / 2);
    const next = clamp(span * factor, Math.min(duration, 0.5), duration);
    const from = centre - ((centre - v0) / span) * next;
    setView(next >= duration - 1e-6 ? null : clampView(from, next, duration));
  };
  const lastPan = React.useRef(0);
  React.useEffect(() => {
    // Follow the playhead out of the view (not for a few seconds after the person moved the view).
    if (!zoomed || time >= v0 && time <= v1 || Date.now() - lastPan.current < 3000) return;
    setView(clampView(time - span * 0.2, span, duration));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  // The range.
  const [ownRange, setOwnRange] = React.useState<readonly [number, number] | null>(null);
  const range = controlledRange === undefined ? ownRange : controlledRange;
  const setRange = (next: [number, number] | null) => {
    if (controlledRange === undefined) setOwnRange(next);
    onRangeChange?.(next);
  };
  const [drag, setDrag] = React.useState<[number, number] | null>(null);
  const shown = drag ?? range;
  const [said, setSaid] = React.useState("");

  const box = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ctrl or Cmd and the wheel zooms about the pointer; a sideways swipe pans. Native, because React's wheel is passive.
  const gesture = React.useRef({ zoomed, v0, span, duration, zoomBy });
  gesture.current = { zoomed, v0, span, duration, zoomBy };
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const g = gesture.current;
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        lastPan.current = Date.now();
        g.zoomBy(e.deltaY < 0 ? 0.8 : 1.25, timeAt(e.clientX - rect.left, rect.width, g.v0, g.v0 + g.span));
      } else if (g.zoomed && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        lastPan.current = Date.now();
        setView(clampView(g.v0 + (e.deltaX / (rect.width || 1)) * g.span, g.span, g.duration));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // The one slider.
  const track = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const off = disabled || !ready;
  const timeText = React.useMemo(() => ({ format: clock, formatRange: (a: number, b: number) => `${clock(a)} to ${clock(b)}`, resolvedOptions: () => ({ locale: "en-US" }) }) as unknown as Intl.NumberFormat, []);
  const state = useSliderState({ minValue: v0, maxValue: Math.max(v1, v0 + 0.01), step: 0.01, value: [clamp(time, v0, Math.max(v1, v0 + 0.01))], onChange: ([t]) => onSeek(clamp(t, 0, duration)), numberFormatter: timeText, isDisabled: off });
  const { groupProps, trackProps } = useSlider({ "aria-label": label, isDisabled: off }, state, track);
  const { thumbProps, inputProps } = useSliderThumb({ index: 0, trackRef: track, inputRef: input, "aria-label": label, isDisabled: off }, state);
  const { focusProps, isFocusVisible } = useFocusRing();
  const seekTo = (t: number) => onSeek(clamp(t, 0, duration));
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (off) return;
    const big = e.shiftKey ? bigStep : step;
    const moves: Record<string, number> = { ArrowLeft: -big, ArrowDown: -big, ArrowRight: big, ArrowUp: big, PageDown: -bigStep, PageUp: bigStep };
    if (e.key in moves) seekTo(time + moves[e.key]);
    else if (e.key === "Home") seekTo(0);
    else if (e.key === "End") seekTo(duration);
    else if (e.key === "+" || e.key === "=") {
      zoomBy(0.5);
      setSaid("Zoomed in");
    } else if (e.key === "-" || e.key === "_") {
      zoomBy(2);
      setSaid("Zoomed out");
    } else if (e.key === "0") {
      setView(null);
      setSaid("Showing the whole file");
    } else if (e.key === "[") {
      const to = range ? Math.max(range[1], time) : duration;
      setRange([time, to]);
      setSaid(`Range starts at ${clock(time)}`);
    } else if (e.key === "]") {
      const from = range ? Math.min(range[0], time) : 0;
      setRange([from, time]);
      setSaid(`Range ends at ${clock(time)}`);
    } else if (e.key === "Escape" && range) {
      setRange(null);
      setSaid("Range cleared");
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Shift and drag selects a range, ahead of the slider's own press.
  const startRange = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.shiftKey || off) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const at = (x: number) => timeAt(x - rect.left, rect.width, v0, v1);
    const from = at(e.clientX);
    setDrag([from, from]);
    el.setPointerCapture?.(e.pointerId);
    const move = (m: PointerEvent) => setDrag([Math.min(from, at(m.clientX)), Math.max(from, at(m.clientX))]);
    const up = (u: PointerEvent) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      const a = Math.min(from, at(u.clientX));
      const b = Math.max(from, at(u.clientX));
      setDrag(null);
      if (b - a > 0.05) {
        setRange([a, b]);
        setSaid(`Range ${clock(a)} to ${clock(b)}`);
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // What is drawn: bars in whole columns, so the path has about one entry per two pixels.
  const column = 2;
  const bars = React.useMemo(() => {
    if (!pair || width === 0 || duration <= 0) return "";
    let d = "";
    for (let x = 0; x < width; x += column) {
      const [lo, hi] = peaksBetween(pair, (v0 + (x / width) * (v1 - v0)) / duration, (v0 + ((x + column) / width) * (v1 - v0)) / duration);
      if (!Number.isFinite(lo)) continue;
      const top = 50 - clamp(hi, -1, 1) * 48;
      const bottom = 50 - clamp(lo, -1, 1) * 48;
      d += `M${x + 0.5} ${top.toFixed(1)}V${Math.max(bottom, top + 1).toFixed(1)}`;
    }
    return d;
  }, [pair, width, v0, v1, duration]);
  const clipId = React.useId();
  const px = (t: number) => ((t - v0) / span) * width;
  const visibleMarks = marks.filter((m) => m.time >= v0 && m.time <= v1);
  // Past one line per three pixels, beats are noise: draw the bars and the rest.
  const thin = visibleMarks.length > width / 3;
  const listedMarks = marks.filter((m) => m.label && (m.listed ?? m.kind !== "beat"));
  const counts = marks.reduce<Record<string, number>>((c, m) => ((c[m.kind ?? "mark"] = (c[m.kind ?? "mark"] ?? 0) + 1), c), {});
  const summary = ready
    ? `${clock(duration)} long${Object.keys(counts).length ? `, ${Object.entries(counts).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`).join(", ")}` : ""}${spans.length ? `, ${spans.length} span${spans.length === 1 ? "" : "s"}` : ""}${zoomed ? `, showing ${clock(v0)} to ${clock(v1)}` : ""}${range ? `, range ${clock(range[0])} to ${clock(range[1])}` : ""}`
    : "";
  const summaryId = React.useId();

  return (
    <div role="group" aria-label={label} className={cn("grid min-w-0 gap-2", className)}>
      {source !== undefined && work.phase !== "finished" && work.phase !== "idle" && (
        <JobStatus
          label={`${label}: reading`}
          running={work.phase === "running"}
          words={words}
          summary={work.phase === "failed" ? (work.error instanceof Error ? work.error.message : "The file could not be read.") : work.phase === "cancelled" ? "Stopped." : "Reducing the sound to a picture."}
          current={work.current}
          total={work.total}
          failed={work.phase === "failed"}
          cancelled={work.phase === "cancelled"}
          onCancel={work.cancel}
        />
      )}
      {source !== undefined && (work.phase === "failed" || work.phase === "cancelled") && (
        <div>
          <Button size="sm" onPress={() => void work.start()}>
            Try again
          </Button>
        </div>
      )}
      <div ref={box} className={cn("relative w-full overflow-hidden rounded-surface border border-border bg-surface-sunken", off && "opacity-60")} style={{ height: "calc(var(--control-h) * 2.5)" }} onPointerDownCapture={startRange} onMouseDownCapture={(e) => e.shiftKey && e.stopPropagation()}>
        {underlay && ready && (
          <div aria-hidden className="absolute inset-y-0 [&>*]:size-full [&>img]:object-fill" style={{ left: `${(-v0 / span) * 100}%`, width: `${(duration / span) * 100}%` }}>
            {underlay}
          </div>
        )}
        {ready && width > 0 && (
          <svg aria-hidden className="absolute inset-0 size-full" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={Math.max(0, Math.min(px(time), width))} height={100} />
              </clipPath>
            </defs>
            {spans.map((s) => {
              const a = clamp(px(s.from), 0, width);
              const b = clamp(px(s.to), 0, width);
              const tone = TONE[s.tone ?? "neutral"];
              return b > a ? (
                <g key={`${s.from}-${s.to}-${s.label}`}>
                  <rect x={a} y={0} width={b - a} height={100} fill={tone.fill} opacity={0.7} />
                  <rect x={a} y={0} width={b - a} height={4} fill={tone.edge} />
                </g>
              ) : null;
            })}
            {shown && <rect x={clamp(px(shown[0]), 0, width)} y={0} width={Math.max(clamp(px(shown[1]), 0, width) - clamp(px(shown[0]), 0, width), 1)} height={100} fill="var(--primary-5)" opacity={0.45} />}
            <path d={bars} stroke="var(--muted-foreground)" strokeWidth={column - 0.5} vectorEffect="non-scaling-stroke" fill="none" />
            <path d={bars} stroke="var(--primary)" strokeWidth={column - 0.5} vectorEffect="non-scaling-stroke" fill="none" clipPath={`url(#${clipId})`} />
            {visibleMarks.map((m) => {
              const kind = m.kind ?? "bar";
              if (thin && kind === "beat") return null;
              const line = MARK_LINE[kind];
              return <line key={`${m.time}-${kind}`} x1={px(m.time)} x2={px(m.time)} y1={0} y2={100} stroke="var(--foreground)" strokeWidth={line.width} strokeDasharray={line.dash} opacity={line.opacity} vectorEffect="non-scaling-stroke" />;
            })}
            {shown && (
              <>
                <line x1={px(shown[0])} x2={px(shown[0])} y1={0} y2={100} stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                <line x1={px(shown[1])} x2={px(shown[1])} y1={0} y2={100} stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </>
            )}
            {time >= v0 && time <= v1 && <line x1={px(time)} x2={px(time)} y1={0} y2={100} stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          </svg>
        )}
        <div {...groupProps} className="absolute inset-0">
          <div {...trackProps} ref={track} className={cn("relative size-full touch-none", off ? "cursor-not-allowed" : "cursor-pointer", isFocusVisible && "outline-2 -outline-offset-2 outline-ring")}>
            <div {...thumbProps} className="absolute inset-y-0 w-0" style={{ left: `${clamp((time - v0) / span, 0, 1) * 100}%` }}>
              <VisuallyHidden>
                <input ref={input} {...mergeProps(inputProps, focusProps, { "aria-describedby": summaryId })} aria-labelledby={undefined} onKeyDownCapture={onKeyDownCapture} />
              </VisuallyHidden>
            </div>
          </div>
        </div>
      </div>
      <VisuallyHidden>
        <p id={summaryId}>{summary}</p>
        <span role="status">{said}</span>
        {spans.length > 0 && (
          <ul aria-label="Spans">
            {spans.map((s) => (
              <li key={`${s.from}-${s.to}-${s.label}`}>
                {s.label}: {clock(s.from)} to {clock(s.to)}
              </li>
            ))}
          </ul>
        )}
        {listedMarks.length > 0 && (
          <ul aria-label="Marks">
            {listedMarks.map((m) => (
              <li key={`${m.time}-${m.label}`}>
                {m.label}, {clock(m.time)}
              </li>
            ))}
          </ul>
        )}
      </VisuallyHidden>
      {spans.length > 0 && ready && (
        <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 type-caption text-muted-foreground">
          {[...new Map(spans.map((s) => [`${s.tone ?? "neutral"}:${s.label}`, s])).values()].map((s) => (
            <li key={`${s.tone}${s.label}`} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3.5 rounded-sm border border-border" style={{ background: TONE[s.tone ?? "neutral"].fill, borderTopColor: TONE[s.tone ?? "neutral"].edge, borderTopWidth: 3 }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
