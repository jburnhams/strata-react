import * as React from "react";
import { cn } from "../lib/utils";
import { KeysLegend, useHotkeys } from "./hotkeys";
import { RateChoice, SeekBar, TimeReadout, Transport, transportShortcuts } from "./media";
import type { TimelineClock } from "./use-timeline";

// The player's layout for something that is not a media file (strata-react issue #386, from the quake2ts explorer's movement lab and
// demo viewer): a stage the app draws (a `SceneViewport` given `clock.time`, a canvas, a chart) over the same control bar `MediaPlayer`
// has, driven by a `useTimeline` clock, so a 3D replay plays like a 360 video and an app does not wire the parts together itself. The
// bar is `Transport`, `SeekBar`, `TimeReadout` and `RateChoice` unchanged; the keys are `transportShortcuts` under the key-owner
// rule (the clock last used owns them, #147) with `stageKeys`, so the stage keeps the arrow keys and the transport's arrows (a frame back
// and on) count only with focus in the bar (#385). The legend lists what is live now. Checked: React Aria has no player part; the bar is
// the existing parts and the layout is a grid.
//
// Not here yet (named in issue #386): one shared view model and input layer for the panorama and the scene viewport, with look, orbit and
// fly modes and a follow aim.

export type TimelinePlayerProps = {
  /** From `useTimeline`. */
  clock: TimelineClock;
  /** Names the player and its controls: "Movement replay". */
  label: string;
  /** The picture, drawn from `clock.time` (give `SceneViewport` `time={clock.time}`). */
  stage: React.ReactNode;
  /** The speeds offered, with `onRateChange` to change `useTimeline`'s `rate`. Without `onRateChange` the choice is not drawn. */
  rates?: readonly number[];
  onRateChange?: (rate: number) => void;
  /** Show the legend of keys that are live now. Default false (an app usually has its own place for it). */
  legend?: boolean;
  className?: string;
};

/** A stage over a control bar for a timeline the app owns: transport, seek bar, time and speed, with the keys following the clock last used and the stage keeping its arrows. */
export function TimelinePlayer({
  clock,
  label,
  stage,
  rates,
  onRateChange,
  legend = false,
  className,
}: TimelinePlayerProps) {
  const bar = React.useRef<HTMLDivElement>(null);
  const fps = Math.max(1, Math.round(1 / clock.frame));
  const shortcuts = transportShortcuts({
    toggle: clock.toggle,
    seek: clock.seek,
    time: clock.time,
    duration: clock.duration,
    frame: clock.frame,
    stageKeys: true,
  });
  const { live } = useHotkeys(shortcuts, { enabled: clock.ownsKeys, within: bar });
  return (
    <div role="group" aria-label={label} {...clock.regionProps} className={cn("grid min-w-0 gap-2", className)}>
      <div className="min-w-0">{stage}</div>
      <div ref={bar} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Transport
          playing={clock.playing}
          onPlayPause={clock.toggle}
          onToStart={() => clock.seek(0)}
          onToEnd={() => clock.seek(clock.duration)}
          onStepBack={() => clock.step(-1)}
          onStepForward={() => clock.step(1)}
          className="shrink-0"
        />
        <SeekBar
          time={clock.time}
          duration={clock.duration}
          onSeek={clock.seek}
          label={`Seek ${label}`}
          precision="frames"
          fps={fps}
          step={Math.max(clock.frame, clock.duration / 50)}
        />
        <TimeReadout time={clock.time} duration={clock.duration} precision="frames" fps={fps} />
        {rates && onRateChange && <RateChoice rate={clock.rate} onRateChange={onRateChange} rates={rates} />}
      </div>
      {legend && <KeysLegend shortcuts={live} />}
    </div>
  );
}
