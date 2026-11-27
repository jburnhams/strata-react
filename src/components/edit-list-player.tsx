import * as React from "react";
import { LoaderCircle, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { cn } from "../lib/utils";
import { continues, editTimeOf, editTimes, locateInEdit, nextBreak, EDIT_EPS, type EditClip } from "../lib/edit-list";
import { Alert } from "./alert";
import { Button, IconButton } from "./button";
import { useHotkeys, type Shortcut } from "./hotkeys";
import { useKeyOwner } from "./key-owner";
import { SeekBar, TimeReadout, VolumeControl } from "./media";
import type { MediaMark } from "./media-skip";
import type { MediaProblem } from "./media-player";
import { Status } from "./status";
import { Toolbar } from "./toolbar";

export type { EditClip };

// Playing an edit list without rendering it (strata-react issue #397, from strata-reels' reel preview, spec S8 "proxy preview"):
// clips that are stretches `[start, end)` of files, played one after another as one timeline. `MediaPlayer`'s `sources` moves
// through whole files by changing `src`, which leaves a load gap at each change and cannot start or stop inside a file; a preview
// of an edit needs neither.
//
// - Two `<video>` elements are stacked. The one in front plays; the one behind holds the next clip that does not carry straight on
//   from the one playing (`nextBreak`), already loaded and sought to its start, so at the cut it is told to play and brought to the
//   front, and the old one is paused and given the clip after. Clips of one file that follow on (`b.start == a.end`) play through
//   with no swap at all. Two elements and never a remount: a browser lets an element play without a gesture only once the person
//   has started it, so the first Play also starts and pauses the one behind, muted (iOS asks this; Chrome and Firefox take the
//   page's gesture for every element).
// - The cut is found every animation frame (and on `timeupdate`, which a background tab still gets), half a frame early when `fps`
//   is given, since a frame drawn past the out-point is a frame the render will not have. The preview is for watching, accurate to
//   a screen refresh; the app's render is what is frame exact.
// - The one behind is hidden by opacity, not `visibility` or `display`, so its sought frame is already composited when it comes
//   forward. A clip whose file is not loaded yet at its cut waits there (`loading`) rather than skipping it.
// - The bar is the parts `MediaPlayer` uses (`SeekBar` over the whole edit with a mark per clip, `TimeReadout`, `VolumeControl`,
//   frame steps with `fps`), and the keys follow the page's key-owner rule (#147). A seek keeps playing, as a video's does.
//
// Checked: React Aria has no media part (see `media-player.tsx`), so the engine is ours; `useMediaElement` follows one element and
// its window, and a gapless swap needs two followed as one, so this owns both rather than stacking two of that hook.

/** What `useEditList` returns: the edit's state as values, and the requests a player makes. */
export type EditListState = {
  /** Spread `ref` and `className` onto two `<video>` elements, in this order, stacked in one box. */
  slots: readonly [EditListSlot, EditListSlot];
  /** Edit time, seconds. */
  time: number;
  /** The edit's length, seconds. */
  duration: number;
  /** The clip playing (or paused on); -1 for an empty edit. */
  index: number;
  /** Where each clip starts, in edit time. */
  starts: readonly number[];
  playing: boolean;
  ended: boolean;
  /** Waiting for a file to load at a cut or a seek. */
  loading: boolean;
  error: MediaProblem | null;
  /** 0 to 100; 0 is muted. */
  volume: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Moves to an edit time; keeps playing if it was. */
  seek: (time: number) => void;
  /** Moves `count` frames (needs `fps`) and pauses. */
  step: (count: number) => void;
  setVolume: (volume: number) => void;
  /** Loads again from where it was, for the error state's "Try again". */
  retry: () => void;
  /** Whether this player's keys are live (the page's key-owner rule). */
  ownsKeys: boolean;
  /** Spread on the player's region: focus or a press there takes the keys. */
  regionProps: { onFocusCapture: () => void; onPointerDownCapture: () => void };
};

/** One of the two stacked elements. */
export type EditListSlot = { ref: React.RefObject<HTMLVideoElement | null>; front: boolean };

export type EditListOptions = {
  /** The source's frame rate: makes the cut land on a frame and enables frame steps. */
  fps?: number;
  /** Called when the clip playing changes (by playing through a cut or by a seek). */
  onClipChange?: (index: number) => void;
  /** Join the page's key ownership (default true). */
  keys?: boolean;
};

const LOAD_MESSAGES: Record<number, string> = {
  2: "The connection dropped while it was loading.",
  3: "A file could not be decoded.",
  4: "A file is in a format this browser cannot play, or is not there.",
};

/** Plays an edit list through two stacked `<video>` elements with no gap at the cuts. `EditListPlayer` is it with the bar. */
export function useEditList(clips: readonly EditClip[], options: EditListOptions = {}): EditListState {
  const { fps, keys = true } = options;
  const a = React.useRef<HTMLVideoElement>(null);
  const b = React.useRef<HTMLVideoElement>(null);
  const refs = React.useMemo(() => [a, b] as const, []);
  const times = React.useMemo(() => editTimes(clips), [clips]);

  const [front, setFront] = React.useState(0);
  const [index, setIndex] = React.useState(clips.length ? 0 : -1);
  const [time, setTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<MediaProblem | null>(null);
  const [volume, setVolumeState] = React.useState(100);

  // What the engine works from between renders: the element events and the frame loop read it.
  const live = React.useRef({
    clips,
    times,
    front: 0,
    index: clips.length ? 0 : -1,
    // The clip each element holds (sought to its start, or playing), or null.
    holds: [null, null] as (number | null)[],
    // A time to seek to once the element's metadata has loaded.
    pending: [null, null] as (number | null)[],
    playing: false,
    // An element is being changed by us (a new src): its pause and emptied events are not the person's.
    quiet: [false, false],
    unlocked: [false, false],
    busy: false,
    volume: 100,
    lead: fps ? 0.5 / fps : 0.02,
    refresh: 1 / 60,
    // The element in front reports its frames (requestVideoFrameCallback), so the frame loop need not cut early.
    frames: false,
  });
  live.current.clips = clips;
  live.current.times = times;
  live.current.lead = fps ? 0.5 / fps : 0.02;
  const onClip = React.useRef(options.onClipChange);
  onClip.current = options.onClipChange;

  const el = (slot: number) => refs[slot].current;

  const setIdx = React.useCallback((i: number) => {
    if (live.current.index === i) return;
    live.current.index = i;
    setIndex(i);
    onClip.current?.(i);
  }, []);

  // Puts clip `i` in an element at `source` seconds of its file (its start by default), paused unless `play`.
  const hold = React.useCallback((slot: number, i: number, source?: number) => {
    const v = el(slot);
    const c = live.current.clips[i];
    if (!v || !c) return;
    const at = source ?? c.start;
    live.current.holds[slot] = i;
    v.volume = live.current.volume / 100;
    if (v.getAttribute("src") !== c.src) {
      live.current.quiet[slot] = true;
      live.current.pending[slot] = at;
      v.src = c.src;
      v.load();
      live.current.quiet[slot] = false;
    } else if (v.readyState >= 1) {
      if (Math.abs(v.currentTime - at) > EDIT_EPS) v.currentTime = at;
    } else live.current.pending[slot] = at;
  }, []);

  const muteFor = (v: HTMLVideoElement, vol: number) => {
    v.muted = vol === 0;
  };

  // Gets the one behind ready for the next clip that is not a straight carry-on from `i`.
  const prepareBehind = React.useCallback(
    (i: number) => {
      const behind = 1 - live.current.front;
      const k = nextBreak(live.current.clips, i);
      if (k === null) return;
      if (live.current.holds[behind] === k && live.current.pending[behind] === null) {
        const v = el(behind);
        const c = live.current.clips[k];
        if (v && Math.abs(v.currentTime - c.start) <= EDIT_EPS) return;
      }
      el(behind)?.pause();
      hold(behind, k);
    },
    [hold],
  );

  const reject = React.useCallback(() => {
    setError({ kind: "blocked", message: "The browser did not let it play. Press Play to start it." });
    live.current.playing = false;
    setPlaying(false);
  }, []);

  const playFront = React.useCallback(() => {
    const v = el(live.current.front);
    if (!v) return;
    muteFor(v, live.current.volume);
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(reject);
  }, [reject]);

  const show = (slot: number) =>
    refs.forEach((r, i) => {
      const v = r.current;
      if (!v) return;
      v.style.opacity = i === slot ? "" : "0";
      v.style.pointerEvents = i === slot ? "" : "none";
    });
  React.useLayoutEffect(() => show(live.current.front));

  const bringForward = React.useCallback(
    (slot: number) => {
      const old = live.current.front;
      if (old === slot) return;
      live.current.front = slot;
      // Shown and hidden here, not by a render: React commits after the frame is painted, and a frame of the old clip past its
      // out-point would show in between.
      show(slot);
      setFront(slot);
      if (live.current.playing) playFront();
      // After the new one is told to play, so the picture never shows neither.
      el(old)?.pause();
    },
    [playFront],
  );

  // The cut: moves to clip `j` from the clip playing.
  const advance = React.useCallback(
    (j: number) => {
      const s = live.current;
      if (j >= s.clips.length) {
        s.playing = false;
        setPlaying(false);
        el(s.front)?.pause();
        setTime(s.times.duration);
        return;
      }
      const i = s.index;
      if (i >= 0 && continues(s.clips[i], s.clips[j]) && s.holds[s.front] === i) {
        s.holds[s.front] = j;
        setIdx(j);
        return;
      }
      const behind = 1 - s.front;
      if (s.holds[behind] !== j) hold(behind, j);
      // The clip first: bringing the element forward plays it, and its events read which clip is playing.
      setIdx(j);
      bringForward(behind);
      prepareBehind(j);
    },
    [bringForward, hold, prepareBehind, setIdx],
  );

  // Reads the element in front: edit time, the cut, waiting.
  // Makes the cut from clip `i` if it is still the one playing. Events the cut itself fires (a play, a seek) must not cut again.
  const cut = React.useCallback(
    (i: number) => {
      const s = live.current;
      if (s.busy || s.index !== i || !s.playing) return;
      s.busy = true;
      try {
        advance(i + 1);
      } finally {
        s.busy = false;
      }
    },
    [advance],
  );

  // Reads the element in front: edit time, the cut (a fallback where the element has no frame callbacks, or one was missed), waiting.
  const tick = React.useCallback(() => {
    const s = live.current;
    const v = el(s.front);
    const i = s.index;
    if (!v || i < 0 || s.busy) return;
    const c = s.clips[i];
    const early = s.frames ? 0 : Math.max(s.lead, s.refresh);
    if (s.playing && s.pending[s.front] === null && (v.currentTime >= c.end - early || v.ended)) {
      cut(i);
      return;
    }
    setTime(editTimeOf(s.clips, s.times, i, v.currentTime));
    setLoading(s.playing && (s.pending[s.front] !== null || v.readyState < 3));
  }, [cut]);

  // The exact cut, where the browser says when each frame is shown (requestVideoFrameCallback: Chromium, Safari, Firefox 132):
  // when the clip's last frame is on screen, the cut is timed for just before the next one would be, so the last frame gets its
  // full time and the frame after the out-point is never drawn. Without it, the frame loop cuts a refresh early.
  React.useEffect(() => {
    if (!playing) return;
    const s = live.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watching: { v: HTMLVideoElement; id: number } | null = null;
    let lastMedia: number | null = null;
    let frameLength = fps ? 1 / fps : 0;
    const watch = () => {
      const v = el(s.front);
      if (stopped || !v || typeof v.requestVideoFrameCallback !== "function") return;
      s.frames = true;
      const id = v.requestVideoFrameCallback((now, meta) => {
        if (stopped) return;
        if (v !== el(s.front)) return;
        if (!fps && lastMedia !== null && meta.mediaTime > lastMedia) frameLength = meta.mediaTime - lastMedia;
        lastMedia = meta.mediaTime;
        const i = s.index;
        const c = s.clips[i];
        if (c && frameLength > 0 && meta.mediaTime + frameLength >= c.end - EDIT_EPS) {
          // On screen until the next frame's turn: one frame on from when this one was due, less half a refresh.
          const shown = meta.expectedDisplayTime ?? now;
          const wait = shown + frameLength * 1000 - s.refresh * 500 - performance.now();
          clearTimeout(timer);
          timer = setTimeout(() => cut(i), Math.max(0, wait));
        }
        watch();
      });
      watching = { v, id };
    };
    watch();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (watching) watching.v.cancelVideoFrameCallback(watching.id);
    };
    // `front`: a swap brings the other element forward, and this follows it.
  }, [playing, fps, cut, front]);

  React.useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    let id = requestAnimationFrame(function loop(now) {
      // The screen's refresh, measured: the cut is made one refresh early, so the frame after the out-point is never drawn.
      if (last !== null) live.current.refresh = 0.8 * live.current.refresh + 0.2 * Math.min(0.05, (now - last) / 1000);
      last = now;
      tick();
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [playing, tick]);

  // The elements' events: a late metadata load takes its pending seek, an error shows, a pause from outside (the browser's own
  // menu, a media session) stops the edit.
  React.useEffect(() => {
    const unbind: (() => void)[] = [];
    refs.forEach((ref, slot) => {
      const v = ref.current;
      if (!v) return;
      const on = (e: Event) => {
        const s = live.current;
        if (e.type === "loadedmetadata" && s.pending[slot] !== null) {
          v.currentTime = s.pending[slot]!;
          s.pending[slot] = null;
          if (slot === s.front && s.playing) playFront();
        }
        if (e.type === "error" && v.error && v.error.code !== 1 && slot === s.front) {
          setError({ kind: "load", message: LOAD_MESSAGES[v.error.code] ?? "It could not be played." });
          s.playing = false;
          setPlaying(false);
        }
        if (e.type === "pause" && slot === s.front && s.playing && !s.quiet[slot] && !v.ended) {
          // Paused by something else (the browser, a media key): follow it, unless it is the end of a clip at its file's end.
          const c = s.clips[s.index];
          if (c && v.currentTime < c.end - s.lead) {
            s.playing = false;
            setPlaying(false);
          }
        }
        if (slot === s.front) tick();
      };
      const types = [
        "loadedmetadata",
        "timeupdate",
        "waiting",
        "playing",
        "canplay",
        "seeked",
        "error",
        "pause",
        "ended",
      ];
      for (const t of types) v.addEventListener(t, on);
      unbind.push(() => types.forEach((t) => v.removeEventListener(t, on)));
    });
    return () => unbind.forEach((u) => u());
  }, [refs, tick, playFront]);

  // A new edit (another revision): stay in the clip being watched if the new edit still has it there (a trim elsewhere should not
  // move the person), otherwise the same edit time, as near as the new edit has it.
  const signature = clips.map((c) => `${c.id}|${c.src}|${c.start}|${c.end}`).join(";");
  const previous = React.useRef<readonly EditClip[]>([]);
  React.useEffect(() => {
    const s = live.current;
    const was = s.index >= 0 ? previous.current[s.index] : undefined;
    const source = was ? (el(s.front)?.currentTime ?? was.start) : 0;
    previous.current = s.clips;
    s.holds = [null, null];
    s.pending = [null, null];
    if (s.clips.length === 0) {
      s.index = -1;
      setIndex(-1);
      s.playing = false;
      setPlaying(false);
      setTime(0);
      return;
    }
    const same = was ? s.clips.findIndex((c) => c.id === was.id && source >= c.start && source < c.end) : -1;
    const found =
      same >= 0
        ? { index: same, source }
        : locateInEdit(s.clips, s.times, Math.min(timeRef.current, s.times.duration))!;
    s.busy = true;
    try {
      setIdx(found.index);
      hold(s.front, found.index, found.source);
      setTime(editTimeOf(s.clips, s.times, found.index, found.source));
      prepareBehind(found.index);
      if (s.playing) playFront();
    } finally {
      s.busy = false;
    }
  }, [signature]);
  const timeRef = React.useRef(time);
  timeRef.current = time;

  React.useEffect(
    () => () => {
      refs.forEach((r) => r.current?.pause());
    },
    [refs],
  );

  // A first Play is the person's gesture: start and pause the one behind with it, muted, so it may play later on its own.
  const unlockBehind = () => {
    const s = live.current;
    const slot = 1 - s.front;
    const v = el(slot);
    if (!v || s.unlocked[slot] || !v.getAttribute("src")) return;
    s.unlocked[slot] = true;
    const at = v.currentTime;
    v.muted = true;
    s.quiet[slot] = true;
    const p = v.play();
    const done = () => {
      s.quiet[slot] = false;
      if (live.current.front === slot) return;
      v.pause();
      muteFor(v, s.volume);
      if (Math.abs(v.currentTime - at) > EDIT_EPS) v.currentTime = at;
    };
    if (p && typeof p.then === "function") p.then(done, done);
    else done();
  };

  const play = React.useCallback(() => {
    const s = live.current;
    if (s.clips.length === 0) return;
    setError(null);
    if (timeRef.current >= s.times.duration - EDIT_EPS) {
      const v = el(s.front);
      if (v) {
        hold(s.front, 0);
        setIdx(0);
        setTime(0);
        prepareBehind(0);
      }
    }
    s.playing = true;
    setPlaying(true);
    s.unlocked[s.front] = true;
    playFront();
    unlockBehind();
  }, [hold, playFront, prepareBehind, setIdx]);

  const pause = React.useCallback(() => {
    live.current.playing = false;
    setPlaying(false);
    setLoading(false);
    el(live.current.front)?.pause();
  }, []);

  const seek = React.useCallback(
    (to: number) => {
      const s = live.current;
      const found = locateInEdit(s.clips, s.times, Math.min(Math.max(to, 0), s.times.duration));
      if (!found) return;
      const { index: j, source } = found;
      const behind = 1 - s.front;
      const src = s.clips[j].src;
      const holdsSrc = (slot: number) => el(slot)?.getAttribute("src") === src;
      s.busy = true;
      try {
        setIdx(j);
        if (!holdsSrc(s.front) && (s.holds[behind] === j || holdsSrc(behind))) {
          // The one behind has the file already: seek it and bring it forward rather than load the file again in front.
          hold(behind, j, source);
          bringForward(behind);
        } else hold(s.front, j, source);
        setTime(editTimeOf(s.clips, s.times, j, source));
        prepareBehind(j);
        if (s.playing) playFront();
      } finally {
        s.busy = false;
      }
    },
    [bringForward, hold, playFront, prepareBehind, setIdx],
  );

  const step = React.useCallback(
    (count: number) => {
      if (!fps) return;
      pause();
      seek(timeRef.current + count / fps);
    },
    [fps, pause, seek],
  );

  const setVolume = React.useCallback(
    (v: number) => {
      const s = live.current;
      s.volume = v;
      setVolumeState(v);
      refs.forEach((r, slot) => {
        const e = r.current;
        if (!e) return;
        e.volume = Math.max(0, Math.min(1, v / 100));
        if (!s.quiet[slot]) muteFor(e, v);
      });
    },
    [refs],
  );

  const retry = React.useCallback(() => {
    const s = live.current;
    setError(null);
    for (const slot of [0, 1]) {
      const v = el(slot);
      if (v) v.removeAttribute("src");
    }
    s.holds = [null, null];
    seek(timeRef.current);
  }, [seek]);

  const owner = useKeyOwner(keys, playing);
  const regionProps = React.useMemo(
    () => ({ onFocusCapture: owner.claim, onPointerDownCapture: owner.claim }),
    [owner.claim],
  );

  return {
    slots: [
      { ref: a, front: front === 0 },
      { ref: b, front: front === 1 },
    ],
    time,
    duration: times.duration,
    index,
    starts: times.at,
    playing,
    ended: !playing && clips.length > 0 && time >= times.duration - EDIT_EPS,
    loading,
    error,
    volume,
    play,
    pause,
    toggle: () => (live.current.playing ? pause() : play()),
    seek,
    step,
    setVolume,
    retry,
    ownsKeys: owner.owns,
    regionProps,
  };
}

export type EditListPlayerProps = {
  /** The edit, in play order. A new array with other clips (a new revision) carries on from the same edit time. */
  clips: readonly EditClip[];
  /** Names the player: "Preview of Summer 1994". */
  label: string;
  /** What to show when the edit has no clips: what to do to get some. */
  empty: React.ReactNode;
  /** The picture's shape. Default 16/9; a PAL tape is 4/3. */
  aspect?: number;
  /** The source's frame rate: cuts land on a frame and the frame steps are drawn. */
  fps?: number;
  /** Called when the clip playing changes, to follow it in a list beside the player. */
  onClipChange?: (index: number) => void;
  /** Leave the page's keys alone (an app that binds its own). Default true. */
  shortcuts?: boolean;
  /** Hands the state out, for a list beside the player that seeks it ("Play this clip"). */
  playerRef?: React.Ref<EditListState>;
  className?: string;
};

/** Plays an edit list (stretches of files) as one timeline with no gap at the cuts, with a seek bar marked at every clip, frame steps and the page's keys. */
export function EditListPlayer({
  clips,
  label,
  empty,
  aspect = 16 / 9,
  fps,
  onClipChange,
  shortcuts = true,
  playerRef,
  className,
}: EditListPlayerProps) {
  const edit = useEditList(clips, { fps, onClipChange, keys: shortcuts });
  React.useImperativeHandle(playerRef, () => edit, [edit]);
  const marks: MediaMark[] = React.useMemo(
    () => clips.map((c, i) => ({ time: edit.starts[i], label: c.label ?? `Clip ${i + 1}`, kind: "scene" as const })),
    [clips, edit.starts],
  );
  const toClip = (dir: 1 | -1) => {
    const i = edit.index;
    if (dir < 0) {
      // Back goes to the start of this clip, or the one before when already near its start (as a CD player does).
      const into = edit.time - edit.starts[i];
      edit.seek(edit.starts[into > 1 || i === 0 ? i : i - 1]);
    } else if (i + 1 < clips.length) edit.seek(edit.starts[i + 1]);
  };
  const frame = fps ? 1 / fps : undefined;
  const keyList: Shortcut[] = [
    { keys: [" ", "k"], label: "Play or pause", run: edit.toggle },
    { keys: ["j"], label: "Back 10 seconds", run: () => edit.seek(edit.time - 10) },
    { keys: ["l"], label: "Forward 10 seconds", run: () => edit.seek(edit.time + 10) },
    { keys: ["p"], label: "Previous clip", run: () => toClip(-1) },
    { keys: ["n"], label: "Next clip", run: () => toClip(1) },
    ...(frame
      ? [
          { keys: [","], label: "Back one frame", run: () => edit.step(-1) },
          { keys: ["."], label: "Forward one frame", run: () => edit.step(1) },
        ]
      : []),
    { keys: ["Home"], label: "Go to start", run: () => edit.seek(0) },
    { keys: ["End"], label: "Go to end", run: () => edit.seek(edit.duration) },
  ];
  useHotkeys(keyList, { enabled: shortcuts && edit.ownsKeys && clips.length > 0 });

  const current = edit.index >= 0 ? clips[edit.index] : undefined;
  return (
    <div role="group" aria-label={label} {...edit.regionProps} className={cn("grid min-w-0 gap-2", className)}>
      <div
        className="relative w-full overflow-hidden rounded-surface bg-surface-sunken"
        style={{ aspectRatio: aspect }}
      >
        {edit.slots.map((slot, i) => (
          <video
            key={i}
            ref={slot.ref}
            playsInline
            preload="auto"
            aria-hidden={!slot.front}
            data-front={slot.front ? "" : undefined}
            onClick={slot.front && clips.length ? edit.toggle : undefined}
            className="absolute inset-0 size-full object-contain"
          />
        ))}
        {clips.length === 0 && (
          <div className="absolute inset-0 grid place-items-center p-4 text-center type-body-sm text-muted-foreground">
            {empty}
          </div>
        )}
        {edit.loading && !edit.error && (
          <div className="pointer-events-none absolute top-3 left-3">
            <Status tone="info" icon={LoaderCircle}>
              Loading
            </Status>
          </div>
        )}
      </div>
      {edit.error && (
        <Alert
          tone={edit.error.kind === "load" ? "danger" : "info"}
          announce
          action={
            edit.error.kind === "load" ? (
              <Button size="sm" onPress={edit.retry}>
                Try again
              </Button>
            ) : undefined
          }
        >
          {edit.error.message}
        </Alert>
      )}
      <div className="flex min-w-0 items-center gap-3">
        <SeekBar
          time={edit.time}
          duration={clips.length ? edit.duration : null}
          onSeek={edit.seek}
          marks={marks}
          onMarkPress={(m) => edit.seek(m.time)}
          step={10}
          bigStep={60}
          label={`Seek in ${label}`}
          disabled={clips.length === 0}
        />
        <TimeReadout time={edit.time} duration={clips.length ? edit.duration : null} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Toolbar label="Playback" className="gap-2">
          <IconButton
            icon={SkipBack}
            label="Previous clip"
            hint="P"
            disabled={clips.length === 0}
            onPress={() => toClip(-1)}
          />
          {frame && (
            <IconButton
              icon={StepBack}
              label="Back one frame"
              hint=","
              disabled={clips.length === 0}
              onPress={() => edit.step(-1)}
            />
          )}
          <IconButton
            icon={edit.playing ? Pause : Play}
            label={edit.playing ? "Pause" : "Play"}
            hint="Space"
            variant="outline"
            disabled={clips.length === 0}
            onPress={edit.toggle}
          />
          {frame && (
            <IconButton
              icon={StepForward}
              label="Forward one frame"
              hint="."
              disabled={clips.length === 0}
              onPress={() => edit.step(1)}
            />
          )}
          <IconButton
            icon={SkipForward}
            label="Next clip"
            hint="N"
            disabled={clips.length === 0 || edit.index >= clips.length - 1}
            onPress={() => toClip(1)}
          />
        </Toolbar>
        {current && (
          <span className="min-w-0 truncate type-body-sm text-muted-foreground">
            Clip {edit.index + 1} of {clips.length}
            {current.label ? `: ${current.label}` : ""}
          </span>
        )}
        <span className="ml-auto flex items-center gap-x-3">
          <VolumeControl volume={edit.volume} onVolumeChange={edit.setVolume} />
        </span>
      </div>
    </div>
  );
}
