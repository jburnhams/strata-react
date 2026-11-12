import * as React from "react";
import { Pause, Play, SkipBack, SkipForward, Square, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { IconButton } from "./button";
import { NativeSelect } from "./field";
import type { Shortcut } from "./hotkeys";
import { useSharedCursor, type CursorMapping } from "./cursor";
import { Toolbar } from "./toolbar";
import { Slider } from "./value-controls";
import { VisuallyHidden, mergeProps, useFocusRing, useSlider, useSliderThumb } from "react-aria";
import { useSliderState } from "react-stately";

// The controls around anything that plays (strata issue #78): transport, a time readout, a seek
// bar, volume with mute, a playback rate, and a stage that holds a picture at its aspect ratio.
// Video and audio editors, media viewers, lesson players and replays of recorded data (a kiln
// firing played back) share them. Nothing here is tied to `<video>`: the app owns its player (HTML
// media, Web Audio, a canvas compositor, a data replay) and passes the state in and takes the
// requests out, so a replay with no media element at all uses the same controls.
//
// Transport is used hundreds of times a session, so it changes instantly with no motion and is
// driven from the one shortcut list (`transportShortcuts`, for `useHotkeys` and `KeysLegend`), not
// from key handlers of its own (ux-character.md, by frequency; components.md §3.16). Each control is
// a named `IconButton`, and the play button's NAME follows the state ("Play" / "Pause"). It is not
// also `aria-pressed`: a button whose name flips and whose pressed state flips reads as a toggle of
// a toggle in a screen reader. (The issue asked for both; one is the WAI-ARIA way, so the name.)
// The group is React Aria's toolbar through `Toolbar` (one tab stop, arrows between controls).
//
// The seek bar is React Aria's slider hooks (`useSlider`, `useSliderThumb`, `useSliderState`): the
// pointer, the thumb, the hidden range input and its label come from them. Two things are ours on top,
// each checked in the hooks' source. The value text: `useSliderState` formats through an object with
// `format`, `formatRange` and `resolvedOptions`, so it is given one that says "1:23" instead of an
// `Intl.NumberFormat` (which would read seconds as a bare number). The keys: the state has one
// `step`, and a seek bar needs a fine one so a drag lands on any moment, so arrows (`step` seconds),
// Page keys (`bigStep`) and Home and End are handled in a capture handler on the input and the hooks'
// own arrow handling is stopped. Volume has neither limit, and stays React Aria's component.
//
// Readouts are `tabular-nums` and are padded to the width of the longest value they will show
// (`duration`), so they do not change width as the time runs.

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export type Precision = "seconds" | "ms" | "frames";

type TimeProps = { precision?: Precision; fps?: number };

const timecode = (t: number, { precision, fps }: TimeProps) => format.timecode(t, { precision, fps });

/** The current and total time, in `tabular-nums`, as `<time>` elements. */
export function TimeReadout({ time, duration, precision = "seconds", fps = 30, className }: { time: number; duration: number | null } & TimeProps & { className?: string }) {
  const total = duration === null ? null : timecode(duration, { precision, fps });
  return (
    <span className={cn("inline-flex items-baseline gap-1 type-body-sm tabular-nums", className)}>
      <time dateTime={`PT${Math.floor(time)}S`} aria-label={`Position ${timecode(time, { precision, fps })}`} className="text-foreground" style={total ? { minWidth: `${total.length}ch` } : undefined}>
        {timecode(time, { precision, fps })}
      </time>
      <span aria-hidden className="text-muted-foreground">
        /
      </span>
      <time dateTime={duration === null ? undefined : `PT${Math.floor(duration)}S`} aria-label={`Length ${total ?? format.missing}`} className="text-muted-foreground">
        {total ?? format.missing}
      </time>
    </span>
  );
}

export type SeekBarProps = TimeProps & {
  time: number;
  /** Seconds; null, NaN or 0 while it is not known (a stream before its metadata): the bar is drawn disabled, with no thumb. */
  duration: number | null;
  /** The viewer asked for this time (drag, click or key). */
  onSeek: (time: number) => void;
  /** Named points on the bar (chapters, markers). Pressing one seeks to it. */
  marks?: readonly { time: number; label: string }[];
  /** What pressing a mark does. Default seeks to it; a screen that wants to land on it and pause (a moment to look at) passes its own. */
  onMarkPress?: (mark: { time: number; label: string }) => void;
  /** How far has loaded or been recorded, drawn behind the played part. */
  buffered?: number;
  /** Arrow key step in seconds. Default 5. */
  step?: number;
  /** Page Up and Page Down step in seconds. Default 30. */
  bigStep?: number;
  label?: string;
  disabled?: boolean;
  /** Join the nearest `CursorScope` (strata-react issue #184): a pointer over the bar puts its time in every member, another member's position shows as a faint tick, and the bar's own time is the scope's playback position (`playback: false` to leave that to the app). A mapping when the scope's unit is not seconds (a route's metres). */
  cursor?: boolean | (CursorMapping & { playback?: boolean });
  className?: string;
};

/** A seek bar: dragged, clicked and moved by keys (arrows `step`, Page keys `bigStep`, Home and End), with its time as the accessible value. */
export function SeekBar({ time, duration: known, onSeek, marks = [], onMarkPress, buffered, step = 5, bigStep = 30, label = "Seek", precision = "seconds", fps = 30, disabled: off, cursor: cursorProp, className }: SeekBarProps) {
  const duration = known && Number.isFinite(known) && known > 0 ? known : 0;
  const disabled = off || duration === 0;
  const track = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const frac = duration > 0 ? clamp(time / duration, 0, 1) : 0;
  const seekTo = (t: number) => onSeek(clamp(t, 0, duration));
  // The shared cursor: a pointer over the bar writes its time, the bar's own time is the playback
  // position, and another member's position is a faint tick (never drawn back at its writer).
  const shared = useSharedCursor();
  const joined = Boolean(cursorProp) && shared !== null;
  const mapping = typeof cursorProp === "object" ? cursorProp : undefined;
  const toCursor = mapping?.toCursor ?? ((t: number) => t);
  const setPlayback = shared?.setPlayback;
  const setPointer = shared?.setPointer;
  const playbackAt = joined && mapping?.playback !== false && duration > 0 ? toCursor(time) : null;
  React.useEffect(() => {
    if (!joined) return;
    setPlayback?.(playbackAt);
  }, [joined, setPlayback, playbackAt]);
  React.useEffect(
    () => () => {
      setPlayback?.(null);
      setPointer?.(null);
    },
    [setPlayback, setPointer],
  );
  const otherTime = joined && shared!.other !== null && duration > 0 ? (mapping?.fromCursor ?? ((c: number) => c))(shared!.other) : null;
  // React Aria's state with a formatter that says "1:23" (it only needs `format`, `formatRange` and
  // `resolvedOptions`, which is all `useSliderState` calls) and a fine step, so a drag lands on any
  // moment and not on every 5 s.
  const timeText = React.useMemo(() => {
    const say = (t: number) => timecode(t, { precision, fps });
    return { format: say, formatRange: (a: number, b: number) => `${say(a)} to ${say(b)}`, resolvedOptions: () => ({ locale: "en-US" }) } as unknown as Intl.NumberFormat;
  }, [precision, fps]);
  const fine = precision === "frames" ? 1 / fps : precision === "ms" ? 0.001 : 0.01;
  const state = useSliderState({ minValue: 0, maxValue: Math.max(duration, fine), step: fine, value: [clamp(time, 0, duration)], onChange: ([t]) => seekTo(t), numberFormatter: timeText, isDisabled: disabled });
  const { groupProps, trackProps } = useSlider({ "aria-label": label, isDisabled: disabled }, state, track);
  const { thumbProps, inputProps } = useSliderThumb({ index: 0, trackRef: track, inputRef: input, "aria-label": label, isDisabled: disabled }, state);
  const { focusProps, isFocusVisible } = useFocusRing();
  // The keys are ours, because the hooks step by `state.step` and this one has to be fine for the
  // drag: arrows move `step` seconds, Page keys `bigStep`, Home and End the ends. Captured so the
  // hook's own arrow handling (one fine step) does not also run.
  const keys: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -bigStep, PageUp: bigStep };
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key in keys) seekTo(time + keys[e.key]);
    else if (e.key === "Home") seekTo(0);
    else if (e.key === "End") seekTo(duration);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div {...groupProps} className={cn("relative flex h-(--control-h) min-w-0 flex-1 items-center", disabled && "cursor-not-allowed opacity-50", className)}>
      <div
        {...mergeProps(trackProps, {
          onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
            if (!joined || duration === 0) return;
            const box = e.currentTarget.getBoundingClientRect();
            shared!.setPointer(toCursor(clamp(((e.clientX - box.left) / (box.width || 1)) * duration, 0, duration)));
          },
          onPointerLeave: () => shared?.setPointer(null),
        })}
        ref={track}
        className={cn("relative flex h-full w-full cursor-pointer touch-none items-center", disabled && "cursor-not-allowed")}
      >
        <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-pill bg-muted" />
        {buffered !== undefined && duration > 0 && <span aria-hidden className="absolute left-0 h-1.5 rounded-pill bg-neutral-4" style={{ width: `${clamp(buffered / duration, 0, 1) * 100}%` }} />}
        <span aria-hidden className="absolute left-0 h-1.5 rounded-pill bg-primary" style={{ width: `${frac * 100}%` }} />
        {otherTime !== null && otherTime >= 0 && otherTime <= duration && <span aria-hidden data-cursor="" className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-foreground/60" style={{ left: `${(otherTime / duration) * 100}%` }} />}
        {duration > 0 &&
          marks.map((m) => (
            <button
              key={`${m.time}-${m.label}`}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              title={`${m.label}, ${timecode(m.time, { precision, fps })}`}
              aria-label={`${m.label}, ${timecode(m.time, { precision, fps })}`}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => (onMarkPress ? onMarkPress(m) : seekTo(m.time))}
              className="absolute top-1/2 h-3 w-1 -translate-y-1/2 cursor-pointer rounded-pill bg-foreground"
              style={{ left: `${(m.time / duration) * 100}%` }}
            />
          ))}
        <div {...thumbProps} className={cn("absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-primary bg-background", isFocusVisible && "outline-2 outline-offset-2 outline-ring")} style={{ left: `${frac * 100}%` }}>
          <VisuallyHidden>
            <input ref={input} {...mergeProps(inputProps, focusProps)} aria-labelledby={undefined} onKeyDownCapture={onKeyDownCapture} />
          </VisuallyHidden>
        </div>
      </div>
    </div>
  );
}

export type TransportProps = {
  playing: boolean;
  onPlayPause: () => void;
  onStop?: () => void;
  onToStart?: () => void;
  onToEnd?: () => void;
  onStepBack?: () => void;
  onStepForward?: () => void;
  /** What a step is called in the buttons' names: "frame" (default) or "second". */
  stepUnit?: string;
  /** Anything else on the row: the time readout, a seek bar, volume. */
  children?: React.ReactNode;
  className?: string;
};

/** The transport buttons for a player the app owns. Every control is a named icon button; the play button's name is "Play" or "Pause" from `playing`. Only the buttons whose handler is passed are drawn. */
export function Transport({ playing, onPlayPause, onStop, onToStart, onToEnd, onStepBack, onStepForward, stepUnit = "frame", children, className }: TransportProps) {
  return (
    <Toolbar label="Playback" className={cn("gap-2", className)}>
      {onToStart && <IconButton icon={SkipBack} label="Go to start" hint="Home" onClick={onToStart} />}
      {onStepBack && <IconButton icon={StepBack} label={`Back one ${stepUnit}`} hint="←" onClick={onStepBack} />}
      <IconButton icon={playing ? Pause : Play} label={playing ? "Pause" : "Play"} hint="Space" variant="outline" onClick={onPlayPause} />
      {onStop && <IconButton icon={Square} label="Stop" onClick={onStop} />}
      {onStepForward && <IconButton icon={StepForward} label={`Forward one ${stepUnit}`} hint="→" onClick={onStepForward} />}
      {onToEnd && <IconButton icon={SkipForward} label="Go to end" hint="End" onClick={onToEnd} />}
      {children}
    </Toolbar>
  );
}

export type VolumeControlProps = {
  /** 0 to 100. */
  volume: number;
  onVolumeChange: (volume: number) => void;
  /** Allow over 100 (a boost), up to this. Default 100. */
  max?: number;
  disabled?: boolean;
  className?: string;
};

/** A mute button and a volume slider with its value in percent. Muting sets the volume to 0 and remembers the level; unmuting puts it back. Moving the slider from 0 unmutes. */
export function VolumeControl({ volume, onVolumeChange, max = 100, disabled, className }: VolumeControlProps) {
  const last = React.useRef(volume > 0 ? volume : 100);
  if (volume > 0) last.current = volume;
  const muted = volume === 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <IconButton icon={muted ? VolumeX : Volume2} label={muted ? "Unmute" : "Mute"} hint="M" disabled={disabled} onClick={() => onVolumeChange(muted ? last.current : 0)} />
      <Slider aria-label="Volume" value={volume} onChange={onVolumeChange} min={0} max={max} unit="%" disabled={disabled} className="w-40" />
    </div>
  );
}

/** A choice of playback speed ("0.5×", "1×", "1.5×") on a native select, named "Playback speed". */
export function RateChoice({ rate, onRateChange, rates = [0.5, 1, 1.25, 1.5, 2], className }: { rate: number; onRateChange: (rate: number) => void; rates?: readonly number[]; className?: string }) {
  return (
    <NativeSelect aria-label="Playback speed" value={String(rate)} onChange={(e) => onRateChange(Number(e.target.value))} className={cn("w-auto", className)}>
      {rates.map((r) => (
        <option key={r} value={String(r)}>
          {`${r}×`}
        </option>
      ))}
    </NativeSelect>
  );
}

/**
 * The shortcuts a player takes, as one list for `useHotkeys` and `KeysLegend`: Space and K play
 * or pause, J and L go back or forward `jump` seconds, the arrows by `frame` seconds, Home and End
 * to the ends, M mutes. Pass the player's actions; the labels are the legend's words.
 */
export function transportShortcuts({ toggle, seek, time, duration, frame = 1 / 30, jump = 1, toggleMute }: { toggle: () => void; seek: (time: number) => void; time: number; duration: number; frame?: number; jump?: number; toggleMute?: () => void }): Shortcut[] {
  const to = (t: number) => () => seek(clamp(t, 0, duration));
  return [
    { keys: [" ", "k"], label: "Play or pause", run: toggle },
    { keys: ["j"], label: `Back ${jump} s`, run: to(time - jump), repeat: true },
    { keys: ["l"], label: `Forward ${jump} s`, run: to(time + jump), repeat: true },
    { keys: ["ArrowLeft"], label: "Back one frame", run: to(time - frame), repeat: true },
    { keys: ["ArrowRight"], label: "Forward one frame", run: to(time + frame), repeat: true },
    { keys: ["Home"], label: "Go to start", run: to(0) },
    { keys: ["End"], label: "Go to end", run: to(duration) },
    ...(toggleMute ? [{ keys: ["m"], label: "Mute", run: toggleMute }] : []),
  ];
}

/** A frame that fits content of an aspect ratio into the pane, letterboxed on the sunken surface role (light and dark both), with room for the app's overlays. */
export function MediaStage({ aspect, children, label, className }: { aspect: number | `${number}/${number}`; children: React.ReactNode; label: string; className?: string }) {
  const outer = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const ratio = typeof aspect === "number" ? aspect : (() => { const [w, h] = aspect.split("/").map(Number); return w / h; })();
  React.useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Contain-fit by arithmetic: CSS aspect-ratio with max-width breaks the ratio when the width is clamped.
  const fit = box && box.w > 0 && box.h > 0 ? (box.w / box.h > ratio ? { w: box.h * ratio, h: box.h } : { w: box.w, h: box.w / ratio }) : null;
  return (
    <div ref={outer} role="group" aria-label={label} className={cn("grid min-h-0 min-w-0 place-items-center overflow-hidden bg-surface-sunken", className)}>
      <div className="relative overflow-hidden bg-background" style={fit ? { width: fit.w, height: fit.h } : { width: "100%", aspectRatio: String(ratio) }}>
        {children}
      </div>
    </div>
  );
}

/** Guides over a stage: action-safe and title-safe frames (90% and 80%), a centre cross and a rule-of-thirds grid. Drawn as two strokes (light over dark) so they read on any picture. */
export function StageGuides({ safe, thirds, centre, className }: { safe?: boolean; thirds?: boolean; centre?: boolean; className?: string }) {
  const lines: [number, number, number, number][] = [];
  if (thirds) lines.push([100 / 3, 0, 100 / 3, 100], [200 / 3, 0, 200 / 3, 100], [0, 100 / 3, 100, 100 / 3], [0, 200 / 3, 100, 200 / 3]);
  if (centre) lines.push([50, 46, 50, 54], [46, 50, 54, 50]);
  const rects = safe ? [5, 10] : [];
  const draw = (cls: string, w: number) => (
    <g className={cls} strokeWidth={w} fill="none" vectorEffect="non-scaling-stroke">
      {lines.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} vectorEffect="non-scaling-stroke" />)}
      {rects.map((m) => <rect key={m} x={m} y={m} width={100 - 2 * m} height={100 - 2 * m} vectorEffect="non-scaling-stroke" />)}
    </g>
  );
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className={cn("pointer-events-none absolute inset-0 size-full", className)}>
      {draw("stroke-foreground", 3)}
      {draw("stroke-background", 1)}
    </svg>
  );
}
