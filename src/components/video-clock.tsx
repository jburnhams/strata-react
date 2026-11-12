import * as React from "react";
import { format } from "../lib/format";
import { Button } from "./button";
import type { Shortcut } from "./hotkeys";
import { RateChoice, SeekBar, TimeReadout, Transport, VolumeControl } from "./media";
import { useMediaElement } from "./media-player";

// One clock for any number of videos of the same thing: what `CompareVideo` (two) and
// `CompareVideoGrid` (four to eight) share, so a fix to the sync is a fix to both.
//
// The first video attached (index 0) is the leader and the others follow it. While the clock runs, a
// `requestAnimationFrame` loop keeps every follower within a frame of the leader: a rate nudge of
// 3% when more than a frame off, a seek when more than 0.3 s off, and when ANY video has fewer than
// three frames of data ALL are paused until all have them, so a stall on one is never seen as the
// others running ahead. (requestVideoFrameCallback was considered and not used: it fires only when
// the leader presents a frame, which is the one time a stall cannot be seen.) A follower more than
// two frames off while playing is reported in `behind`, so a screen can say which cell is catching
// up instead of drifting silently. Known limit: a seek is not hidden while the decoders catch up (an
// element cannot hold its old frame); the same loop corrects it, and playback after a seek waits.
//
// A video the screen says is not visible (`setVisible`) is paused and left out of the loop, and
// brought back to the leader's time when it is visible again, so eight 50p clips do not all decode
// when three are on screen. The leader is always kept.
//
// Judging short clips (issue #203, the VHS upscale judge: 8 s clips watched several times): the clock
// can start itself (`autoPlay`) and loop the whole clip (`loopWhole`), both off by default.
// - Auto play waits for every video's metadata, then plays; the hold rule above keeps them still
//   until all have their frames, so "start once all can play in step" is that rule, not a second
//   one. It starts muted unless the person has chosen a sound level on this clock (a browser
//   refuses autoplay with sound, and a refusal falls back to paused with Play showing, as any
//   refused play does). It starts again for a new pair (`pairKey`), from 0 and paused-then-playing,
//   and leaves a pair the person paused alone. A person who prefers reduced motion gets no autoplay
//   unless the app insists (`"always"`).
// - A new pair always starts at 0: before this the position and the playing state of the last pair
//   were put on the next one, which a judge answering pair after pair never wants.
// - Whole-clip looping restarts at the natural end while playing. A loop range set with `i` and `o`
//   wins while both ends are set; `c` goes back to the whole clip. A pause is kept at the loop point:
//   the restart only happens for a clip that was playing when it ended.
//
// Elements are attached by index with `attach(i)` (a stable callback ref), because a screen may
// move a video to another place in the tree (a view change makes new elements): the clock keeps the
// time, whether it was playing and the chosen speed, and puts a new element back there when it has
// its metadata (`restore`, for `onLoadedMetadata`).
//
// Checked: React Aria has no media clock or player; the transport and seek bar are the media parts
// built on its slider and toolbar hooks.

/** A range to loop, in seconds of the clip; the same seconds in every video. */
export type VideoLoop = { start: number | null; end: number | null };

/** Speeds offered by default: slow motion for sitting on a moment. */
export const SLOW_RATES = [0.1, 0.25, 0.5, 1, 1.25, 1.5, 2] as const;

type Info = { duration: number | null; error: boolean };

/** Options for `useVideoClock`. */
export type VideoClockOptions = {
  /** Frames per second of the leader: the unit of the sync tolerance and of a step. */
  fps: number;
  loop?: VideoLoop;
  onLoopChange?: (loop: VideoLoop) => void;
  /** The index of the video whose sound is heard; none when `null`. */
  audio: number | null;
  /** Start playing once every video has its metadata (and muted, unless the person chose a sound level), and again for each new `pairKey`. `"always"` also with reduced motion. Default off. */
  autoPlay?: boolean | "always";
  /** Loop from 0 to the natural end when no range is set. A range with both ends set wins. Default off. */
  loopWhole?: boolean;
  /** Names the pair on the clock: when it changes the clock starts again at 0, paused (or playing, with `autoPlay`). */
  pairKey?: string;
};

/** The clock and everything a transport needs. */
export type VideoClock = ReturnType<typeof useVideoClock>;

/** Plays, pauses, seeks, steps and loops any number of videos together. */
export function useVideoClock({ fps, loop: loopProp, onLoopChange, audio, autoPlay = false, loopWhole = false, pairKey }: VideoClockOptions) {
  const els = React.useRef(new Map<number, HTMLVideoElement>());
  const leaderRef = React.useRef<HTMLVideoElement | null>(null);
  const cleanups = React.useRef(new Map<number, () => void>());
  const attachers = React.useRef(new Map<number, (el: HTMLVideoElement | null) => void>());
  const hidden = React.useRef(new Set<number>());
  const [infos, setInfos] = React.useState<Record<number, Info>>({});
  const [wanted, setWanted] = React.useState(false);
  const wantedRef = React.useRef(false);
  wantedRef.current = wanted;
  const [started, setStarted] = React.useState(false);
  const [volume, setVolume] = React.useState(100);
  const [muted, setMuted] = React.useState(false);
  // True once the person has chosen a sound level on this clock: autoplay then keeps it instead of starting muted.
  const soundChosen = React.useRef(false);
  const [behind, setBehind] = React.useState<ReadonlySet<number>>(new Set());
  const chosenRate = React.useRef(1);
  // True while the group is held for a video that has not got its frames; a cell that comes into view then waits with the rest.
  const holdRef = React.useRef(false);
  const lead = useMediaElement(leaderRef);

  const active = () => [...els.current.entries()].filter(([i]) => i === 0 || !hidden.current.has(i)).sort((a, b) => a[0] - b[0]).map(([, el]) => el);

  // A play() the browser refuses (autoplay policy) or that a pause or a hold interrupts rejects; an interruption is ours and ignored, a refusal means nothing is playing, so the transport must not say it is.
  const start = (el: HTMLVideoElement) => {
    void el.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setWanted(false);
    });
  };
  // Pause reaches every attached element, hidden ones too, so none can go on after the transport says paused.
  const pauseAll = () => {
    for (const el of els.current.values()) el.pause();
  };

  // ---- the loop ----
  const [ownLoop, setOwnLoop] = React.useState<VideoLoop>({ start: null, end: null });
  const loop = loopProp ?? ownLoop;
  const setLoop = (next: VideoLoop) => {
    setOwnLoop(next);
    onLoopChange?.(next);
  };
  const loopRef = React.useRef(loop);
  loopRef.current = loop;
  const wholeRef = React.useRef(loopWhole);
  wholeRef.current = loopWhole;

  // The leader reaching the end, or any video reaching its own: the clock runs to the shortest, which is the length shown. Unless a loop is set, then the end is where it goes back from.
  const onEnded = () => {
    const { start, end } = loopRef.current;
    const list = active();
    const ranged = start !== null && end !== null;
    if (wantedRef.current && (ranged || wholeRef.current)) {
      for (const el of list) el.currentTime = ranged ? start : 0;
      for (const el of list) startRef.current(el);
      return;
    }
    setWanted(false);
    pauseAll();
  };
  const startRef = React.useRef(start);
  startRef.current = start;
  const onEndedRef = React.useRef(onEnded);
  onEndedRef.current = onEnded;

  // ---- attaching ----
  const refresh = () => {
    const first = [...els.current.keys()].sort((a, b) => a - b)[0];
    leaderRef.current = first === undefined ? null : (els.current.get(first) ?? null);
  };
  const attach = (index: number) => {
    let fn = attachers.current.get(index);
    if (fn) return fn;
    fn = (el) => {
      if (els.current.get(index) === el || (!el && !els.current.has(index))) return;
      cleanups.current.get(index)?.();
      cleanups.current.delete(index);
      if (!el) {
        els.current.delete(index);
        refresh();
        setInfos((p) => {
          const { [index]: _gone, ...rest } = p;
          return rest;
        });
        return;
      }
      els.current.set(index, el);
      refresh();
      const read = () => setInfos((p) => ({ ...p, [index]: { duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null, error: !!el.error && el.error.code !== 1 } }));
      const ended = () => onEndedRef.current();
      const types = ["loadedmetadata", "durationchange", "error", "emptied", "loadstart"] as const;
      for (const t of types) el.addEventListener(t, read);
      el.addEventListener("ended", ended);
      cleanups.current.set(index, () => {
        for (const t of types) el.removeEventListener(t, read);
        el.removeEventListener("ended", ended);
      });
      read();
    };
    attachers.current.set(index, fn);
    return fn;
  };

  // ---- the numbers a transport shows ----
  const known = Object.values(infos).map((i) => i.duration).filter((d): d is number => d !== null);
  const duration = known.length ? Math.min(...known) : null;
  const count = Object.keys(infos).length;
  const loaded = count > 0 && known.length === count;
  const failed = lead.error !== null || Object.values(infos).some((i) => i.error);
  const now = () => leaderRef.current?.currentTime ?? lead.time;

  // ---- the clock ----
  const play = () => {
    setWanted(true);
    setStarted(true);
    for (const el of active()) start(el);
  };
  const pause = () => {
    setWanted(false);
    pauseAll();
  };
  const toggle = () => (wanted ? pause() : play());
  const seek = (time: number) => {
    const t = Math.max(0, duration === null ? time : Math.min(time, duration));
    lead.seek(t);
    for (const [i, el] of els.current) if (el !== leaderRef.current && !hidden.current.has(i)) el.currentTime = t;
  };
  // Frame by frame: the centre of the next or previous frame, so a step cannot land on a boundary and show the wrong one. From the leader's own time, not the snapshot, which is only as fresh as the last media event.
  const step = (direction: 1 | -1) => {
    pause();
    seek(Math.max(0, (Math.floor(now() * fps + 1e-6) + direction + 0.5) / fps));
  };
  // Kept here, not read back from an element, so new elements get it too.
  const setRate = (rate: number) => {
    chosenRate.current = rate;
    for (const el of els.current.values()) {
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
    }
  };
  const setPoint = (point: "start" | "end") => {
    const t = now();
    const other = point === "start" ? loop.end : loop.start;
    // A start after the end (or an end before the start) replaces the other point.
    const clash = other !== null && (point === "start" ? t >= other : t <= other);
    setLoop(clash ? { start: point === "start" ? t : null, end: point === "end" ? t : null } : { ...loop, [point]: t });
  };
  const clearLoop = () => setLoop({ start: null, end: null });

  // A video that was not on screen comes back to where the clock is.
  const setVisible = (index: number, visible: boolean) => {
    if (index === 0) return;
    const el = els.current.get(index);
    if (!visible) {
      hidden.current.add(index);
      el?.pause();
      return;
    }
    if (!hidden.current.delete(index) || !el) return;
    el.currentTime = now();
    el.playbackRate = chosenRate.current;
    if (wantedRef.current && !holdRef.current) start(el);
  };

  React.useEffect(() => {
    if (!wanted) return;
    let held = false;
    let frame = requestAnimationFrame(function tick() {
      const list = active();
      const [L, ...followers] = list;
      if (L && list.every((el) => !el.ended)) {
        if (!list.every((el) => el.readyState >= 3)) {
          held = true;
          holdRef.current = true;
          // Every tick, so a cell that came into view during the hold is stopped too.
          for (const el of list) if (!el.paused) el.pause();
        } else if (held) {
          held = false;
          holdRef.current = false;
          for (const el of list) startRef.current(el);
        } else if (!L.paused) {
          const { start, end } = loopRef.current;
          if (start !== null && end !== null && L.currentTime >= end) {
            for (const el of list) el.currentTime = start;
          } else {
            const one = 1 / fps;
            const slow = new Set<number>();
            const indexes = [...els.current.entries()].filter(([, el]) => followers.includes(el)).map(([i]) => i);
            followers.forEach((el, k) => {
              const drift = el.currentTime - L.currentTime;
              if (Math.abs(drift) > 0.3) el.currentTime = L.currentTime;
              else if (Math.abs(drift) > one) el.playbackRate = L.playbackRate * (drift > 0 ? 0.97 : 1.03);
              else if (Math.abs(drift) < one / 2 && el.playbackRate !== L.playbackRate) el.playbackRate = L.playbackRate;
              if (Math.abs(drift) > 2 * one) slow.add(indexes[k]);
            });
            setBehind((prev) => (prev.size === slow.size && [...slow].every((i) => prev.has(i)) ? prev : slow));
          }
        }
      }
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      holdRef.current = false;
    };
  }, [wanted, fps]);
  // Nothing is behind when nothing runs.
  React.useEffect(() => {
    if (!wanted) setBehind((prev) => (prev.size ? new Set() : prev));
  }, [wanted]);

  // New elements (a view change) come back to where the old ones were.
  const resume = React.useRef({ time: 0, playing: false });
  if (lead.duration !== null) resume.current = { time: lead.time, playing: wanted };
  const restore = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.defaultPlaybackRate = chosenRate.current;
    el.playbackRate = chosenRate.current;
    if (resume.current.time > 0) el.currentTime = resume.current.time;
    const index = [...els.current.entries()].find(([, e]) => e === el)?.[0];
    if (resume.current.playing && (index === undefined || !hidden.current.has(index))) start(el);
  };

  // A new pair starts again: at 0, not playing, and not waiting on the last pair's metadata (the elements keep their identity when only `src` changes, so what they said about the old clip is dropped until they say it of the new one).
  const lastPair = React.useRef(pairKey);
  const armed = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (lastPair.current === pairKey) return;
    lastPair.current = pairKey;
    armed.current = undefined;
    resume.current = { time: 0, playing: false };
    pauseAll();
    // A new source starts at 0 in a browser; an element that is kept for the next pair must not carry the old time.
    for (const el of els.current.values()) el.currentTime = 0;
    setWanted(false);
    setStarted(false);
    setInfos({});
  }, [pairKey]);

  // Autoplay: once, for each pair, when every video has its metadata.
  const [reduced] = React.useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const auto = autoPlay === "always" || (autoPlay === true && !reduced);
  const playRef = React.useRef(play);
  playRef.current = play;
  React.useEffect(() => {
    if (!auto || !loaded || armed.current === (pairKey ?? "")) return;
    armed.current = pairKey ?? "";
    if (audio !== null && !soundChosen.current) setMuted(true);
    playRef.current();
  }, [auto, loaded, pairKey, audio]);

  // One sound: the chosen video at the volume, the rest muted.
  React.useEffect(() => {
    for (const [i, el] of els.current) {
      el.muted = audio !== i || muted || volume === 0;
      el.volume = volume / 100;
    }
  });

  const shortcuts = (): Shortcut[] => [
    { keys: [" ", "k"], label: "Play or pause", run: toggle },
    { keys: ["j"], label: "Back 1 s", run: () => seek(now() - 1), repeat: true },
    { keys: ["l"], label: "Forward 1 s", run: () => seek(now() + 1), repeat: true },
    { keys: [","], label: "Back one frame", run: () => step(-1), repeat: true },
    { keys: ["."], label: "Forward one frame", run: () => step(1), repeat: true },
    { keys: ["i"], label: "Loop starts here", run: () => setPoint("start") },
    { keys: ["o"], label: "Loop ends here", run: () => setPoint("end") },
    { keys: ["c"], label: "Clear the loop", run: clearLoop, disabled: loop.start === null && loop.end === null },
    ...(audio === null ? [] : [{ keys: ["m"], label: "Mute", run: () => ((soundChosen.current = true), setMuted((m) => !m)) }]),
  ];

  return {
    attach,
    restore,
    wanted,
    started,
    play,
    pause,
    toggle,
    seek,
    step,
    setRate,
    time: lead.time,
    rate: lead.rate,
    buffered: lead.buffered,
    duration,
    loaded,
    failed,
    loop,
    looping: loop.start !== null && loop.end !== null,
    /** The whole clip loops: asked for, and no range set to override it. */
    loopsWhole: loopWhole && !(loop.start !== null && loop.end !== null),
    setPoint,
    clearLoop,
    volume,
    muted,
    setVolume: (v: number) => ((soundChosen.current = true), setMuted(false), setVolume(v)),
    behind,
    setVisible,
    shortcuts,
    hasAudio: audio !== null,
    fps,
  };
}

/** The transport row (play, step, time, seek bar with moments and the loop's ends, speed, volume) and the loop row, for a clock. */
export function VideoControls({ clock, rates = SLOW_RATES, moments = [] }: { clock: VideoClock; rates?: readonly number[]; moments?: readonly { time: number; label: string }[] }) {
  const { loop, fps } = clock;
  const at = (t: number | null) => (t === null ? format.missing : format.timecode(t, { precision: "frames", fps }));
  const marks = [
    ...moments,
    ...(loop.start !== null ? [{ time: loop.start, label: "Loop start" }] : []),
    ...(loop.end !== null ? [{ time: loop.end, label: "Loop end" }] : []),
  ];
  return (
    <>
      <Transport playing={clock.wanted} onPlayPause={clock.toggle} onStepBack={() => clock.step(-1)} onStepForward={() => clock.step(1)}>
        <TimeReadout time={clock.time} duration={clock.duration} precision="frames" fps={fps} />
        <SeekBar time={clock.time} duration={clock.duration} onSeek={clock.seek} marks={marks} onMarkPress={(m) => (clock.pause(), clock.seek(m.time))} buffered={clock.buffered} label="Position" step={1} precision="frames" fps={fps} />
        <RateChoice rate={clock.rate} onRateChange={clock.setRate} rates={rates} />
        {clock.hasAudio && <VolumeControl volume={clock.muted ? 0 : clock.volume} onVolumeChange={clock.setVolume} />}
      </Transport>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onPress={() => clock.setPoint("start")} disabled={clock.duration === null}>
          Loop starts here
        </Button>
        <Button size="sm" onPress={() => clock.setPoint("end")} disabled={clock.duration === null}>
          Loop ends here
        </Button>
        <Button size="sm" variant="ghost" onPress={clock.clearLoop} disabled={loop.start === null && loop.end === null}>
          Clear the loop
        </Button>
        <span role="status" className="type-caption tabular-nums text-muted-foreground">
          {clock.looping ? `Looping ${at(loop.start)} to ${at(loop.end)}` : clock.loopsWhole ? "Looping the whole clip" : loop.start !== null ? `Loop starts at ${at(loop.start)}` : loop.end !== null ? `Loop ends at ${at(loop.end)}` : "No loop"}
        </span>
      </div>
    </>
  );
}
