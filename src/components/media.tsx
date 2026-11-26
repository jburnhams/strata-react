import type { SpanTone } from "./line-chart";
import * as React from "react";
import {
  Check,
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { controlHeight } from "../lib/control";
import { format } from "../lib/format";
import { overlaySurface } from "../lib/overlay";
import { cn } from "../lib/utils";
import { IconButton } from "./button";
import type { Shortcut } from "./hotkeys";
import { useSharedCursor, type CursorMapping } from "./cursor";
import { Toolbar } from "./toolbar";
import { Tooltip } from "./tooltip";
import type { MediaMark } from "./media-skip";
import { Slider } from "./value-controls";
import {
  Button as AriaButton,
  ListBox,
  ListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue,
} from "react-aria-components";
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
export function TimeReadout({
  time,
  duration,
  precision = "seconds",
  fps = 30,
  className,
}: { time: number; duration: number | null } & TimeProps & { className?: string }) {
  const total = duration === null ? null : timecode(duration, { precision, fps });
  return (
    <span className={cn("inline-flex items-baseline gap-1 type-body-sm tabular-nums", className)}>
      <time
        dateTime={`PT${Math.floor(time)}S`}
        aria-label={`Position ${timecode(time, { precision, fps })}`}
        className="text-foreground"
        style={total ? { minWidth: `${total.length}ch` } : undefined}
      >
        {timecode(time, { precision, fps })}
      </time>
      <span aria-hidden className="text-muted-foreground">
        /
      </span>
      <time
        dateTime={duration === null ? undefined : `PT${Math.floor(duration)}S`}
        aria-label={`Length ${total ?? format.missing}`}
        className="text-muted-foreground"
      >
        {total ?? format.missing}
      </time>
    </span>
  );
}

// A stretch is coloured by a status role the product already sets (the same tones as a chart's spans), never a fixed colour.
const SPAN_TONE: Record<SpanTone, string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-neutral-8",
};

/** A stretch of the bar, drawn as a range: an intro, a recap, an advert break. */
export type SeekBarSpan = {
  /** Seconds. */
  start: number;
  end: number;
  /** Its name for a screen reader and the tooltip: "Intro". The bar adds its times: "Intro, 0:00 to 0:12". */
  label: string;
  /** Default "info". */
  tone?: SpanTone;
  /** What kind of stretch it is ("sponsor"). Drawn as `data-kind` on the range, so an app can colour kinds from its own theme (`[data-kind="sponsor"]`). */
  kind?: string;
  /** A colour of the app's theme, named by its custom property (`"--seg-sponsor"`), for a kind whose colour the app's people know, instead of one of the five tones. Only a name starting with `--` is used; the library never picks a colour. */
  colour?: string;
};

const COLOUR_NAME = /^--[\w-]+$/;

/** One stretch drawn as a range of a bar of `duration` seconds, named with its times. Shared by the seek bar and the strip under the browser's own controls. */
function SpanRange({
  span,
  duration,
  thin,
  ...time
}: { span: SeekBarSpan; duration: number; thin?: boolean } & TimeProps) {
  const name = `${span.label}, ${timecode(span.start, time)} to ${timecode(span.end, time)}`;
  const colour = span.colour && COLOUR_NAME.test(span.colour) ? span.colour : null;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      data-span=""
      data-kind={span.kind}
      className={cn(
        "absolute min-w-1 rounded-pill opacity-70",
        thin ? "h-1" : "h-1.5",
        !colour && SPAN_TONE[span.tone ?? "info"],
      )}
      style={{
        left: `${(span.start / duration) * 100}%`,
        width: `${((span.end - span.start) / duration) * 100}%`,
        ...(colour ? { backgroundColor: `var(${colour})` } : undefined),
      }}
    />
  );
}

/**
 * The marked stretches as a thin strip, for under a picture played with the browser's own controls, whose seek bar cannot draw them
 * (strata-react issue #270): the same ranges, names and colours as `SeekBar spans`, not a control. Draws nothing until `duration` is known.
 */
export function SpanStrip({
  spans,
  duration,
  label = "Marked parts",
  precision = "seconds",
  fps = 30,
  className,
}: { spans: readonly SeekBarSpan[]; duration: number | null; label?: string; className?: string } & TimeProps) {
  const drawn = duration ? drawableSpans(spans, duration) : [];
  if (!duration || !drawn.length) return null;
  return (
    <div role="group" aria-label={label} className={cn("relative h-1 w-full rounded-pill bg-muted", className)}>
      {drawn.map((s) => (
        <SpanRange
          key={`${s.start}-${s.end}-${s.label}`}
          span={s}
          duration={duration}
          precision={precision}
          fps={fps}
          thin
        />
      ))}
    </div>
  );
}

/** The spans a bar of `duration` seconds can draw: in order, cut to the bar, and none that are empty or backwards. */
function drawableSpans(spans: readonly SeekBarSpan[], duration: number) {
  return spans
    .map((s) => ({ ...s, start: clamp(s.start, 0, duration), end: clamp(s.end, 0, duration) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

export type SeekBarProps = TimeProps & {
  time: number;
  /** Seconds; null, NaN or 0 while it is not known (a stream before its metadata): the bar is drawn disabled, with no thumb. */
  duration: number | null;
  /** The viewer asked for this time (drag, click or key). */
  onSeek: (time: number) => void;
  /** Named points on the bar (chapters, scenes, markers), each with its name and time in a tooltip on hover. Pressing one seeks to it. A `kind: "scene"` mark is drawn shorter and fainter than a chapter, so the parts read inside the whole. */
  marks?: readonly MediaMark[];
  /** Stretches drawn along the bar as ranges (strata-react issue #207): each named for a screen reader and in a tooltip, in a status role's colour, and never thinner than a few pixels so a one-second span still shows. They only draw; `MediaPlayer`'s `spans` is what acts on them. */
  spans?: readonly SeekBarSpan[];
  /** What pressing a mark does. Default seeks to it; a screen that wants to land on it and pause (a moment to look at) passes its own. */
  onMarkPress?: (mark: MediaMark) => void;
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
export function SeekBar({
  time,
  duration: known,
  onSeek,
  marks = [],
  spans = [],
  onMarkPress,
  buffered,
  step = 5,
  bigStep = 30,
  label = "Seek",
  precision = "seconds",
  fps = 30,
  disabled: off,
  cursor: cursorProp,
  className,
}: SeekBarProps) {
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
  const otherTime =
    joined && shared!.other !== null && duration > 0
      ? (mapping?.fromCursor ?? ((c: number) => c))(shared!.other)
      : null;
  // React Aria's state with a formatter that says "1:23" (it only needs `format`, `formatRange` and
  // `resolvedOptions`, which is all `useSliderState` calls) and a fine step, so a drag lands on any
  // moment and not on every 5 s.
  const timeText = React.useMemo(() => {
    const say = (t: number) => timecode(t, { precision, fps });
    return {
      format: say,
      formatRange: (a: number, b: number) => `${say(a)} to ${say(b)}`,
      resolvedOptions: () => ({ locale: "en-US" }),
    } as unknown as Intl.NumberFormat;
  }, [precision, fps]);
  const fine = precision === "frames" ? 1 / fps : precision === "ms" ? 0.001 : 0.01;
  const state = useSliderState({
    minValue: 0,
    maxValue: Math.max(duration, fine),
    step: fine,
    value: [clamp(time, 0, duration)],
    onChange: ([t]) => seekTo(t),
    numberFormatter: timeText,
    isDisabled: disabled,
  });
  const { groupProps, trackProps } = useSlider({ "aria-label": label, isDisabled: disabled }, state, track);
  const { thumbProps, inputProps } = useSliderThumb(
    { index: 0, trackRef: track, inputRef: input, "aria-label": label, isDisabled: disabled },
    state,
  );
  const { focusProps, isFocusVisible } = useFocusRing();
  // The keys are ours, because the hooks step by `state.step` and this one has to be fine for the
  // drag: arrows move `step` seconds, Page keys `bigStep`, Home and End the ends. Captured so the
  // hook's own arrow handling (one fine step) does not also run.
  const keys: Record<string, number> = {
    ArrowLeft: -step,
    ArrowDown: -step,
    ArrowRight: step,
    ArrowUp: step,
    PageDown: -bigStep,
    PageUp: bigStep,
  };
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
    <div
      {...groupProps}
      className={cn(
        "relative flex h-(--control-h) min-w-0 flex-1 items-center",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
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
        className={cn(
          "relative flex h-full w-full cursor-pointer touch-none items-center",
          disabled && "cursor-not-allowed",
        )}
      >
        <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-pill bg-muted" />
        {buffered !== undefined && duration > 0 && (
          <span
            aria-hidden
            className="absolute left-0 h-1.5 rounded-pill bg-neutral-4"
            style={{ width: `${clamp(buffered / duration, 0, 1) * 100}%` }}
          />
        )}
        <span
          aria-hidden
          className="absolute left-0 h-1.5 rounded-pill bg-primary"
          style={{ width: `${frac * 100}%` }}
        />
        {duration > 0 &&
          drawableSpans(spans, duration).map((s) => (
            <SpanRange
              key={`${s.start}-${s.end}-${s.label}`}
              span={s}
              duration={duration}
              precision={precision}
              fps={fps}
            />
          ))}
        {otherTime !== null && otherTime >= 0 && otherTime <= duration && (
          <span
            aria-hidden
            data-cursor=""
            className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-foreground/60"
            style={{ left: `${(otherTime / duration) * 100}%` }}
          />
        )}
        {duration > 0 &&
          // A mark past the end (a chapter list longer than the file that loaded) would sit thousands of widths to the right and widen the page.
          marks
            .filter((m) => m.time >= 0 && m.time <= duration)
            .map((m) => {
              const at = timecode(m.time, { precision, fps });
              const scene = m.kind === "scene";
              // React Aria's press stops the pointer reaching the track, so pressing a mark does not also start a drag. Out of the tab
              // order: the bar is one stop, and the player's skip buttons step through the marks from the keyboard.
              return (
                <Tooltip
                  key={`${m.time}-${m.kind ?? "chapter"}-${m.label}`}
                  label={m.label}
                  hint={<span className="tabular-nums">{at}</span>}
                  delay={150}
                >
                  <AriaButton
                    excludeFromTabOrder
                    isDisabled={disabled}
                    aria-label={`${m.label}, ${at}`}
                    data-kind={m.kind ?? "chapter"}
                    onPress={() => (onMarkPress ? onMarkPress(m) : seekTo(m.time))}
                    className={cn(
                      "group/mark absolute inset-y-0 flex -translate-x-1/2 cursor-pointer items-center justify-center",
                      scene ? "w-2" : "z-10 w-3",
                    )}
                    style={{ left: `${(m.time / duration) * 100}%` }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "rounded-pill transition-state group-hover/mark:bg-primary",
                        scene ? "h-2 w-0.5 bg-foreground/50" : "h-3.5 w-1 bg-foreground",
                      )}
                    />
                  </AriaButton>
                </Tooltip>
              );
            })}
        <div
          {...thumbProps}
          className={cn(
            "absolute top-1/2 z-20 size-4 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-primary bg-background",
            isFocusVisible && "outline-2 outline-offset-2 outline-ring",
          )}
          style={{ left: `${frac * 100}%` }}
        >
          <VisuallyHidden>
            <input
              ref={input}
              {...mergeProps(inputProps, focusProps)}
              aria-labelledby={undefined}
              onKeyDownCapture={onKeyDownCapture}
            />
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
export function Transport({
  playing,
  onPlayPause,
  onStop,
  onToStart,
  onToEnd,
  onStepBack,
  onStepForward,
  stepUnit = "frame",
  children,
  className,
}: TransportProps) {
  return (
    <Toolbar label="Playback" className={cn("gap-2", className)}>
      {onToStart && <IconButton icon={SkipBack} label="Go to start" hint="Home" onClick={onToStart} />}
      {onStepBack && <IconButton icon={StepBack} label={`Back one ${stepUnit}`} hint="←" onClick={onStepBack} />}
      <IconButton
        icon={playing ? Pause : Play}
        label={playing ? "Pause" : "Play"}
        hint="Space"
        variant="outline"
        onClick={onPlayPause}
      />
      {onStop && <IconButton icon={Square} label="Stop" onClick={onStop} />}
      {onStepForward && (
        <IconButton icon={StepForward} label={`Forward one ${stepUnit}`} hint="→" onClick={onStepForward} />
      )}
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
    // `min-w-0` all the way down and a slider that shrinks, so a player a phone wide (320 px with a side rail) does not
    // run its "100%" past its edge (issue #213): the button and the readout keep their size, the track gives way.
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <IconButton
        icon={muted ? VolumeX : Volume2}
        label={muted ? "Unmute" : "Mute"}
        hint="M"
        disabled={disabled}
        onClick={() => onVolumeChange(muted ? last.current : 0)}
      />
      <Slider
        aria-label="Volume"
        value={volume}
        onChange={onVolumeChange}
        min={0}
        max={max}
        unit="%"
        disabled={disabled}
        className="w-40 min-w-24 shrink"
      />
    </div>
  );
}

// The speed is React Aria's `Select`, not `NativeSelect` (strata-react #324): Chromium lays out a native select's text
// with `line-height: normal` whatever the page asks, and centres it in the control, so with the bundled faces the "1×"
// sat on a fractional offset that rounded a pixel up or down between Chromium builds and, on a loaded runner, between
// two runs of the same build: every player's screenshot was unstable there. React Aria's Select gives the same
// behaviour (a button named by its value, a listbox popover, arrows and type-ahead, a hidden native select for forms)
// with a text box the theme lays out on whole pixels. Its trigger is a `button` with the select's name and value.
/** A choice of playback speed ("0.5×", "1×", "1.5×"), named "Playback speed": React Aria's Select. */
export function RateChoice({
  rate,
  onRateChange,
  rates = [0.5, 1, 1.25, 1.5, 2],
  className,
}: {
  rate: number;
  onRateChange: (rate: number) => void;
  rates?: readonly number[];
  className?: string;
}) {
  return (
    <AriaSelect
      aria-label="Playback speed"
      selectedKey={String(rate)}
      onSelectionChange={(key) => key !== null && onRateChange(Number(key))}
      className={cn("w-auto", className)}
    >
      <AriaButton
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-control border border-input bg-background pr-2 pl-3 type-body text-foreground transition-state",
          controlHeight.default,
        )}
      >
        <SelectValue className="tabular-nums" />
        <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
      </AriaButton>
      <AriaPopover
        placement="bottom start"
        offset={4}
        className={cn("layer-overlay min-w-(--trigger-width) p-1", overlaySurface)}
      >
        <ListBox className="outline-none">
          {rates.map((r) => (
            <ListBoxItem
              key={r}
              id={String(r)}
              textValue={`${r}×`}
              className="flex min-h-(--control-h-sm) cursor-pointer items-center justify-between gap-3 rounded-control px-2 type-body-sm tabular-nums outline-none focus:bg-muted selected:font-medium"
            >
              {({ isSelected }) => (
                <>
                  {`${r}×`}
                  {isSelected && <Check aria-hidden className="size-4" />}
                </>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </AriaPopover>
    </AriaSelect>
  );
}

/**
 * The shortcuts a player takes, as one list for `useHotkeys` and `KeysLegend`: Space and K play
 * or pause, J and L go back or forward `jump` seconds, the arrows by `frame` seconds, Home and End
 * to the ends, M mutes. Pass the player's actions; the labels are the legend's words. `stageKeys` is for a transport beside a stage that uses the arrows (see `TimelinePlayer`).
 */
export function transportShortcuts({
  toggle,
  seek,
  time,
  duration,
  frame = 1 / 30,
  jump = 1,
  toggleMute,
  stageKeys,
}: {
  toggle: () => void;
  seek: (time: number) => void;
  time: number;
  duration: number;
  frame?: number;
  jump?: number;
  toggleMute?: () => void;
  stageKeys?: boolean;
}): Shortcut[] {
  const to = (t: number) => () => seek(clamp(t, 0, duration));
  // A stage beside the transport takes the arrows (a 3D view turns with them), so with `stageKeys` the arrows count only with focus
  // inside `useHotkeys`' `within` region and every other key stays page-wide (issue #385).
  const anywhere = stageKeys || undefined;
  return [
    { keys: [" ", "k"], label: "Play or pause", run: toggle, anywhere },
    { keys: ["j"], label: `Back ${jump} s`, run: to(time - jump), repeat: true, anywhere },
    { keys: ["l"], label: `Forward ${jump} s`, run: to(time + jump), repeat: true, anywhere },
    { keys: ["ArrowLeft"], label: "Back one frame", run: to(time - frame), repeat: true },
    { keys: ["ArrowRight"], label: "Forward one frame", run: to(time + frame), repeat: true },
    { keys: ["Home"], label: "Go to start", run: to(0), anywhere },
    { keys: ["End"], label: "Go to end", run: to(duration), anywhere },
    ...(toggleMute ? [{ keys: ["m"], label: "Mute", run: toggleMute, anywhere }] : []),
  ];
}

/** A frame that fits content of an aspect ratio into the pane, letterboxed on the sunken surface role (light and dark both), with room for the app's overlays. */
export function MediaStage({
  aspect,
  children,
  label,
  className,
}: {
  aspect: number | `${number}/${number}`;
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  const outer = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const ratio =
    typeof aspect === "number"
      ? aspect
      : (() => {
          const [w, h] = aspect.split("/").map(Number);
          return w / h;
        })();
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
  const fit =
    box && box.w > 0 && box.h > 0
      ? box.w / box.h > ratio
        ? { w: box.h * ratio, h: box.h }
        : { w: box.w, h: box.w / ratio }
      : null;
  return (
    <div
      ref={outer}
      role="group"
      aria-label={label}
      className={cn("grid min-h-0 min-w-0 place-items-center overflow-hidden bg-surface-sunken", className)}
    >
      <div
        className="relative overflow-hidden bg-background"
        style={fit ? { width: fit.w, height: fit.h } : { width: "100%", aspectRatio: String(ratio) }}
      >
        {children}
      </div>
    </div>
  );
}

/** Guides over a stage: action-safe and title-safe frames (90% and 80%), a centre cross and a rule-of-thirds grid. Drawn as two strokes (light over dark) so they read on any picture. */
export function StageGuides({
  safe,
  thirds,
  centre,
  className,
}: {
  safe?: boolean;
  thirds?: boolean;
  centre?: boolean;
  className?: string;
}) {
  const lines: [number, number, number, number][] = [];
  if (thirds)
    lines.push(
      [100 / 3, 0, 100 / 3, 100],
      [200 / 3, 0, 200 / 3, 100],
      [0, 100 / 3, 100, 100 / 3],
      [0, 200 / 3, 100, 200 / 3],
    );
  if (centre) lines.push([50, 46, 50, 54], [46, 50, 54, 50]);
  const rects = safe ? [5, 10] : [];
  const draw = (cls: string, w: number) => (
    <g className={cls} strokeWidth={w} fill="none" vectorEffect="non-scaling-stroke">
      {lines.map((l, i) => (
        <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} vectorEffect="non-scaling-stroke" />
      ))}
      {rects.map((m) => (
        <rect key={m} x={m} y={m} width={100 - 2 * m} height={100 - 2 * m} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    >
      {draw("stroke-foreground", 3)}
      {draw("stroke-background", 1)}
    </svg>
  );
}
