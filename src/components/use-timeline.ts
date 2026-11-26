import * as React from "react";
import { joinMediaGroup, useMediaGroupName, type GroupMember } from "./media-group";
import { useKeyOwner, type KeyOwner } from "./key-owner";

// A playhead for something that is not a media file (strata-react issue #384, from the quake2ts explorer's movement lab, which
// played a recorded run with `Transport` and `SeekBar` and wrote the clock by hand): a simulation recorded frame by frame, a demo
// replay, an animation drawn to a canvas or a WebGL stage. It gives back the names `useMediaElement` does (`time`, `duration`,
// `playing`, `play`, `pause`, `toggle`, `seek`, `rate`), so `Transport`, `SeekBar`, `TimeReadout`, `RateChoice` and
// `transportShortcuts` plug in unchanged and the run works like a video. The rules a video has are kept, each written once here
// so a screen does not rewrite them: it runs on requestAnimationFrame and multiplies elapsed time by `rate`; it stops at the end or
// loops; pressing play at the end starts from 0; any seek pauses (dragging a seek bar should); `step` moves by one `frame`.
// It joins a `MediaGroup` (starting it pauses a real player on the page, and the reverse needs nothing from the player: the group
// listens for this clock's `play`), and it takes part in "the player last played, focused or pressed owns the keys" (`useKeyOwner`,
// the rule `MediaPlayer` uses from #147), so a stage beside it keeps its arrow keys unless the transport was used last (#385).
// Checked: React Aria has no clock or media part; this is a hook on `requestAnimationFrame`, nothing to extend.

export type TimelineClockOptions = {
  /** Seconds. */
  duration: number;
  /** Playback speed; a multiple of real time. Default 1. The app owns it (`RateChoice` sets it). */
  rate?: number;
  /** What one step moves, in seconds. Default 1/30. */
  frame?: number;
  /** Start again at the end instead of stopping. */
  loop?: boolean;
  /** Where the playhead rests before anyone has used it: `"end"` shows a recorded run whole before play is pressed. Default `"start"`. */
  startAt?: "start" | "end";
  /** Join a group, as `useMediaElement`'s: starting this clock pauses the others in it. Defaults to the nearest `MediaGroup`. */
  group?: string;
  /** Join the page's key ownership (default true): pass `ownsKeys` to `useHotkeys`' `enabled`. Off for a clock whose keys the screen binds itself. */
  keys?: boolean;
};

/** What `useTimeline` returns: the media element's names for a clock the app owns. */
export type TimelineClock = {
  /** Seconds. */
  time: number;
  duration: number;
  playing: boolean;
  /** Stopped at the end of a clock that does not loop. */
  ended: boolean;
  rate: number;
  /** One step, in seconds, as given. */
  frame: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Moves the playhead (clamped to the run) and pauses. */
  seek: (time: number) => void;
  /** Moves `count` frames (negative goes back) and pauses. */
  step: (count: number) => void;
  /** Whether this clock's keys are live: it is the only player on the page, or the one last used. Pass it to `useHotkeys`' `enabled`. */
  ownsKeys: boolean;
  /** Spread on the region that holds the transport (and the stage, if the keys are to follow it): focus or a press there takes the keys. */
  regionProps: { onFocusCapture: () => void; onPointerDownCapture: () => void };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** A playhead the app owns, in the shape `Transport`, `SeekBar` and `transportShortcuts` take. */
export function useTimeline({
  duration,
  rate = 1,
  frame = 1 / 30,
  loop = false,
  startAt = "start",
  group,
  keys = true,
}: TimelineClockOptions): TimelineClock {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  // `null` until the clock is used, so a clock that starts at the end follows a duration that arrives late.
  const [at, setAt] = React.useState<number | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const time = clamp(at ?? (startAt === "end" ? length : 0), 0, length);
  const live = React.useRef({ time, length, rate, loop });
  live.current = { time, length, rate, loop };

  // The group: a member that says `play` when started and can be paused from outside.
  const member = React.useRef<
    (Omit<GroupMember, "paused" | "pause"> & { paused: boolean; pause: () => void; start(): void }) | null
  >(null);
  if (!member.current) {
    const listeners = new Set<() => void>();
    const m = {
      paused: true,
      pause: () => {},
      addEventListener: (_: "play", l: () => void) => void listeners.add(l),
      removeEventListener: (_: "play", l: () => void) => void listeners.delete(l),
      start: () => listeners.forEach((l) => l()),
    };
    member.current = m;
  }
  const contextGroup = useMediaGroupName();
  const name = group ?? contextGroup;
  React.useEffect(() => (name && member.current ? joinMediaGroup(name, member.current) : undefined), [name]);

  const pause = React.useCallback(() => setPlaying(false), []);
  if (member.current) {
    member.current.paused = !playing;
    member.current.pause = pause;
  }
  const play = React.useCallback(() => {
    const { time: t, length: n, loop: again } = live.current;
    if (n === 0) return;
    // Pressing play at the end starts from the beginning, as a video does.
    if (t >= n && !again) setAt(0);
    else setAt(t);
    setPlaying(true);
    member.current?.start();
  }, []);
  const seek = React.useCallback((to: number) => {
    setAt(clamp(to, 0, live.current.length));
    setPlaying(false);
  }, []);
  const toggle = React.useCallback(() => (playing ? pause() : play()), [playing, pause, play]);

  // The clock: elapsed real time times the rate, from when play started.
  React.useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let id = requestAnimationFrame(function tick() {
      const now = performance.now();
      const { time: t, length: n, rate: r, loop: again } = live.current;
      let next = t + ((now - last) / 1000) * r;
      last = now;
      if (next >= n) {
        if (again) next = n > 0 ? next % n : 0;
        else {
          setAt(n);
          setPlaying(false);
          return;
        }
      }
      live.current = { ...live.current, time: next };
      setAt(next);
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const owner: KeyOwner = useKeyOwner(keys, playing);
  const regionProps = React.useMemo(
    () => ({ onFocusCapture: owner.claim, onPointerDownCapture: owner.claim }),
    [owner.claim],
  );
  return {
    time,
    duration: length,
    playing,
    ended: !playing && length > 0 && time >= length && !loop,
    rate,
    frame,
    play,
    pause,
    toggle,
    seek,
    step: (count) => seek(live.current.time + count * frame),
    ownsKeys: owner.owns,
    regionProps,
  };
}
