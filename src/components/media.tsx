import * as React from "react";
import { Pause, Play, SkipBack, SkipForward, Square, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { IconButton } from "./button";
import { NativeSelect } from "./field";
import type { Shortcut } from "./hotkeys";
import { Toolbar } from "./toolbar";
import { Slider } from "./value-controls";

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
// The seek bar is our own `role="slider"`, not React Aria's `Slider`. Checked in `useSliderThumb`
// and `useSliderState`: the thumb's `aria-valuetext` is the formatted number from `Intl.NumberFormat`
// options, which cannot say "1:23", so a screen reader would hear seconds as a bare number; and
// the input is a native range input whose Page Up and Page Down steps belong to the browser, so a
// larger step cannot be set. The hooks would allow a formatter, but `react-stately` is not a direct
// dependency here (CLAUDE.md: that is Jonathan's call). So the keys, the pointer and the ARIA are
// ours, the same set React Aria's slider has. Volume has neither limit, and stays React Aria's.
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
  duration: number;
  /** The viewer asked for this time (drag, click or key). */
  onSeek: (time: number) => void;
  /** Named points on the bar (chapters, markers). Pressing one seeks to it. */
  marks?: readonly { time: number; label: string }[];
  /** How far has loaded or been recorded, drawn behind the played part. */
  buffered?: number;
  /** Arrow key step in seconds. Default 5. */
  step?: number;
  /** Page Up and Page Down step in seconds. Default 30. */
  bigStep?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
};

/** A seek bar: dragged, clicked and moved by keys (arrows `step`, Page keys `bigStep`, Home and End), with its time as the accessible value. */
export function SeekBar({ time, duration, onSeek, marks = [], buffered, step = 5, bigStep = 30, label = "Seek", precision = "seconds", fps = 30, disabled, className }: SeekBarProps) {
  const track = React.useRef<HTMLDivElement>(null);
  const frac = duration > 0 ? clamp(time / duration, 0, 1) : 0;
  const seekTo = (t: number) => onSeek(clamp(t, 0, duration));
  const at = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r && r.width > 0) seekTo(((clientX - r.left) / r.width) * duration);
  };
  const keys: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -bigStep, PageUp: bigStep };
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={time}
      aria-valuetext={timecode(time, { precision, fps })}
      aria-disabled={disabled || undefined}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key in keys) seekTo(time + keys[e.key]);
        else if (e.key === "Home") seekTo(0);
        else if (e.key === "End") seekTo(duration);
        else return;
        e.preventDefault();
      }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        at(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!disabled && e.buttons === 1) at(e.clientX);
      }}
      className={cn("relative flex h-(--control-h) min-w-0 flex-1 cursor-pointer items-center aria-disabled:cursor-not-allowed aria-disabled:opacity-50", className)}
    >
      <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-pill bg-muted" />
      {buffered !== undefined && duration > 0 && <span aria-hidden className="absolute left-0 h-1.5 rounded-pill bg-neutral-4" style={{ width: `${clamp(buffered / duration, 0, 1) * 100}%` }} />}
      <span aria-hidden className="absolute left-0 h-1.5 rounded-pill bg-primary" style={{ width: `${frac * 100}%` }} />
      {duration > 0 &&
        marks.map((m) => (
          <button
            key={`${m.time}-${m.label}`}
            type="button"
            tabIndex={-1}
            title={`${m.label}, ${timecode(m.time, { precision, fps })}`}
            aria-label={`${m.label}, ${timecode(m.time, { precision, fps })}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => seekTo(m.time)}
            className="absolute top-1/2 h-3 w-1 -translate-y-1/2 cursor-pointer rounded-pill bg-foreground"
            style={{ left: `${(m.time / duration) * 100}%` }}
          />
        ))}
      <span aria-hidden className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-primary bg-background" style={{ left: `${frac * 100}%` }} />
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
