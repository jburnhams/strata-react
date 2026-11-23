import * as React from "react";
import { LoaderCircle, Maximize, Minimize, SkipBack, SkipForward } from "lucide-react";
import { Status } from "./status";
import { cn } from "../lib/utils";
import { Alert } from "./alert";
import { PlayerWarningToast, type PlayerWarningEvent } from "./player-warning";
import { Button, IconButton } from "./button";
import { FullscreenFrame, canFullscreen } from "./fullscreen-frame";
import { useHotkeys, type Shortcut } from "./hotkeys";
import { RateChoice, SeekBar, SpanStrip, TimeReadout, Transport, VolumeControl } from "./media";
import { joinMediaGroup, useMediaGroupName } from "./media-group";
import { SpanActions, useMediaSpans, type MediaSpanData, type SpanKind, type SpanOutcome, type SpanWords } from "./media-spans";
import { format } from "../lib/format";
import { VisuallyHidden } from "react-aria";
import { isDev } from "../lib/dev";
import { createWatchedRanges, type MediaProgress } from "./media-progress";

export type { MediaProgress };

// Playing a file without writing the glue (strata-react issue #134, from strata-listory, whose two
// players stayed `<audio controls>` because the parts of #78 take state in and requests out, and
// every app that plays a file would write the same event handling). Two pieces, one on the other:
//
// - `useMediaElement(ref)` owns the element's state. It listens to the events a player needs
//   (`timeupdate`, `durationchange`, `progress`, `play`, `pause`, `ended`, `volumechange`,
//   `ratechange`, `waiting`, `error`, and the ones that say loading has started or finished) and
//   hands back plain values that spread straight into `Transport`, `SeekBar`, `TimeReadout`,
//   `VolumeControl` and `RateChoice`, and the requests (`play`, `pause`, `toggle`, `seek`,
//   `setVolume`, `setRate`, `retry`). It catches the rejection of `play()` (autoplay refused) into
//   `error` instead of an unhandled promise, applies a seek made before the metadata has loaded
//   once it has, and gives `duration` as `null` until it is known (a stream says `NaN` or `Infinity`),
//   so `SeekBar` draws a disabled bar with an en dash and no thumb stuck at 0. It only listens, so it
//   reads an element drawn with the browser's own controls just as well.
// - `MediaPlayer` is the 90% case: the element, the hook, the parts and the keys. `controls` is
//   `"auto"` (the browser's own bar on a touch device, `(pointer: coarse)`, Strata's on a desktop),
//   `"native"` or `"strata"`. Native stays an option because the browser's bar brings what a custom
//   one will not (lock-screen and headset controls, AirPlay and Cast, picture in picture, caption
//   menus); `session` sets `navigator.mediaSession` for the same reason. The stack table's rule,
//   "native elements stay where the platform does it better", applies to playback of a file.
// - A sequence (chapters, a playlist) is `sources`: ending moves to the next and keeps playing by
//   changing the element's `src`, never remounting it, because a browser allows playback to continue
//   only on an element the person has already started. When every source gives its `duration` the
//   seek bar spans the whole sequence, with a mark at each source's title; otherwise it spans the
//   current one.
//
// Checked: React Aria has no media element hook (its `VisuallyHidden`, `useSlider` and toolbar are
// what the parts are built on), so the hook is ours. Volume is 0 to 100 and 0 is muted, the way
// `VolumeControl` has it; unmuting restores the element's own level.

/** The words of the "Picked up at" notice. */
export type ResumeWords = {
  /** Default `Picked up at 2:05`. Takes the time already formatted. */
  pickedUp?: (time: string) => string;
  /** Default "Start over". */
  startOver?: string;
};

/** Why a player is not playing, for the app to word. */
export type MediaProblem = { kind: "load"; message: string } | { kind: "blocked"; message: string };

/** What `useMediaElement` returns: the element's state as values, and the requests a player makes of it. */
export type MediaElementState = {
  /** Seconds that can be sought to: for a source still being made, the end of what exists; otherwise the duration (or 0 while it is not known). */
  ready: number;
  /** A source that is still being made has been played up to the end of what exists, and is waiting for more. */
  waitingForMore: boolean;
  /** Shows a stream's own failure (one the element cannot report, such as a stream engine's fatal error) as the load error, with Try again. */
  reportProblem: (message: string | null) => void;
  /** The stretch of the file being played, if any: the `window` option, or the last `playWindow`. */
  window: MediaWindow | null;
  /** Plays a stretch: seeks to its start, plays, and stops (or loops) at its end. */
  playWindow: (window: MediaWindow) => Promise<void>;
  playing: boolean;
  /** Seconds. */
  time: number;
  /** Seconds, or null until the element knows it (a stream reports NaN or Infinity). */
  duration: number | null;
  /** Seconds buffered from the start of the range holding `time`. */
  buffered: number;
  /** 0 to 100; 0 while muted. */
  volume: number;
  muted: boolean;
  rate: number;
  ended: boolean;
  /** Waiting for data (the first load, or a seek into what is not buffered yet). */
  loading: boolean;
  error: MediaProblem | null;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => void;
  /** Seeks; before the metadata has loaded, remembers the time and applies it when it has. */
  seek: (time: number) => void;
  /** 0 to 100. 0 mutes; more unmutes at that level. */
  setVolume: (volume: number) => void;
  setRate: (rate: number) => void;
  /** Loads again, and plays if it was playing. For the error state's "Try again". */
  retry: () => void;
  /** Counts a stretch (seconds in the file) as watched without it being played, for one the app skipped on purpose. See `onProgress`. */
  markWatched: (start: number, end: number) => void;
};

/** A stretch of a file, in seconds. */
export type MediaWindow = { start: number; end: number };

/** What `useMediaElement` can be asked to do besides follow the element. */
export type MediaElementOptions = {
  /** Bound playback to a stretch: it starts at `start` (a play from outside it seeks there) and stops at `end`. */
  window?: MediaWindow | null;
  /** At the end of the window, go back to its start and carry on, instead of stopping. */
  loop?: boolean;
  /** Join a group: when this element plays, the others in the group pause. Defaults to the nearest `MediaGroup`. */
  group?: string;
  /** Called every animation frame while playing, with the element's time, for highlighting what is being heard. */
  onTimeUpdate?: (time: number) => void;
  /** The window's end was reached (once per play; not called when it loops). */
  onWindowEnd?: () => void;
  /** The source is still being made (a growing stream): its duration is the end of what exists and keeps growing, it never counts as ended, and playback that reached the end carries on when more arrives. */
  growing?: boolean;
  /** Loads again from `time`, for a source the element cannot reload itself (a stream engine). Replaces the element's `load()` in `retry`. */
  onRetry?: (time: number) => void;
  /**
   * How much has been seen (strata-react issue #272): called every `progressEvery` seconds of playing, and on pause, on the end, when the page is hidden, when it is left and when the player unmounts or changes file.
   * `watched` counts each second once, when the playhead passes it by playing; a seek or skip counts nothing and going back over a part adds nothing. A report is not repeated while nothing has changed.
   */
  onProgress?: (report: MediaProgress) => void;
  /** Seconds of playing between reports. Default 15. */
  progressEvery?: number;
  /** Names what is being played, so the count starts again when it changes. Default the element's `src` attribute; give it for a stream attached by an engine. */
  progressKey?: string;
};

type Snapshot = Omit<MediaElementState, "play" | "pause" | "toggle" | "seek" | "setVolume" | "setRate" | "retry" | "playWindow" | "window" | "reportProblem" | "markWatched">;

/** How far one notch of the wheel over a focused video moves the volume, in percent. */
const WHEEL_VOLUME_STEP = 5;

const idle: Snapshot = { ready: 0, waitingForMore: false, playing: false, time: 0, duration: null, buffered: 0, volume: 100, muted: false, rate: 1, ended: false, loading: false, error: null };

const LOAD_MESSAGES: Record<number, string> = {
  2: "The connection dropped while it was loading.",
  3: "The file could not be decoded.",
  4: "This format is not supported or the file is not there.",
};

function bufferedAhead(el: HTMLMediaElement) {
  const ranges = el.buffered;
  for (let i = 0; i < ranges.length; i++) if (el.currentTime >= ranges.start(i) && el.currentTime <= ranges.end(i)) return ranges.end(i);
  return 0;
}

// Subscribes while an element is mounted, and again if the ref later holds another one (a player that
// changes `kind` replaces its DOM node, and the old node's listeners are gone with it).
function useElementListeners(ref: React.RefObject<HTMLMediaElement | null>, bind: (el: HTMLMediaElement) => () => void) {
  const bound = React.useRef<{ el: HTMLMediaElement; unbind: () => void } | null>(null);
  const latest = React.useRef(bind);
  latest.current = bind;
  // No dependency list on purpose: a ref changing does not render, but whatever replaced the node did.
  React.useEffect(() => {
    const el = ref.current;
    if (bound.current?.el === el) return;
    bound.current?.unbind();
    bound.current = el ? { el, unbind: latest.current(el) } : null;
  });
  React.useEffect(
    () => () => {
      bound.current?.unbind();
      bound.current = null;
    },
    [],
  );
}

const EVENTS = [
  "loadstart", "loadedmetadata", "durationchange", "timeupdate", "progress", "play", "playing", "pause", "ended",
  "volumechange", "ratechange", "seeking", "seeked", "waiting", "canplay", "emptied", "error",
] as const;

/** Follows an `<audio>` or `<video>` and returns its state and the requests a player makes. Works with the browser's own controls too. */
export function useMediaElement(ref: React.RefObject<HTMLMediaElement | null>, options: MediaElementOptions = {}): MediaElementState {
  const [snapshot, setSnapshot] = React.useState<Snapshot>(idle);
  const blocked = React.useRef<MediaProblem | null>(null);
  const pendingSeek = React.useRef<number | null>(null);
  // The window being played: the app's, or the last `playWindow`. Held in a ref as well, because the
  // element's events (`play`, `timeupdate`) and the frame loop read it between renders.
  const [ownWindow, setOwnWindow] = React.useState<MediaWindow | null>(null);
  const active = options.window ?? ownWindow;
  const win = React.useRef<MediaWindow | null>(active);
  win.current = active;
  const opts = React.useRef(options);
  opts.current = options;
  const windowEnded = React.useRef(false);
  const streamProblem = React.useRef<string | null>(null);
  const edgePause = React.useRef(false);
  const contextGroup = useMediaGroupName();
  const group = options.group ?? contextGroup;

  const read = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const finite = Number.isFinite(el.duration) && el.duration > 0;
    const growing = opts.current.growing === true;
    // A source still being made: what can be sought is the end of what exists.
    const seekEnd = el.seekable && el.seekable.length > 0 ? el.seekable.end(el.seekable.length - 1) : 0;
    const known = finite ? el.duration : growing && seekEnd > 0 ? seekEnd : null;
    const ready = growing ? (seekEnd > 0 ? seekEnd : (known ?? 0)) : (known ?? 0);
    const endedNow = el.ended && !growing;
    let error: MediaProblem | null = blocked.current ?? (streamProblem.current ? { kind: "load", message: streamProblem.current } : null);
    // Code 1 is the load being abandoned on purpose (a new src), not a failure.
    if (el.error && el.error.code !== 1) error = { kind: "load", message: LOAD_MESSAGES[el.error.code] ?? "It could not be played." };
    const next: Snapshot = {
      ready,
      // At the end of what exists, still being made: not an ending.
      waitingForMore: growing && known !== null && (el.ended || (el.readyState < 3 && !el.paused)) && el.currentTime >= known - 2,
      playing: !el.paused && !el.ended,
      time: Number.isFinite(el.currentTime) ? el.currentTime : 0,
      duration: known,
      buffered: bufferedAhead(el),
      volume: el.muted ? 0 : Math.round(el.volume * 100),
      muted: el.muted,
      rate: el.playbackRate,
      ended: endedNow,
      loading: !error && el.networkState === 2 && el.readyState < 3 && !el.paused,
      error,
    };
    // Playback that ran into the end of a growing source carries on when more has been made.
    if (growing && el.ended) edgePause.current = true;
    if (edgePause.current && known !== null && known > el.currentTime + 0.5 && el.paused) {
      edgePause.current = false;
      void el.play().catch(() => {});
    }
    setSnapshot((previous) => (Object.keys(next) as (keyof Snapshot)[]).every((k) => Object.is(previous[k], next[k]) || (k === "error" && previous.error?.message === next.error?.message && previous.error?.kind === next.error?.kind)) ? previous : next);
  }, [ref]);

  // Stops, or loops, at the end of the window. Called every frame while playing and on every
  // `timeupdate` (the frame loop is what makes it exact; the event is what a background tab still gets).
  const enforce = React.useCallback(
    (el: HTMLMediaElement) => {
      const w = win.current;
      if (!w || el.paused || windowEnded.current) return;
      if (el.currentTime < w.end) return;
      if (opts.current.loop) {
        el.currentTime = w.start;
        return;
      }
      windowEnded.current = true;
      el.pause();
      el.currentTime = w.end;
      opts.current.onWindowEnd?.();
    },
    [],
  );

  useElementListeners(ref, (el) => {
    el.preservesPitch = true;
    const on = (e: Event) => {
      if (e.type === "play" || e.type === "playing") blocked.current = null;
      if (e.type === "play") {
        windowEnded.current = false;
        const w = win.current;
        // A play from outside the window (the start of the file, or after it stopped at its end) begins at its start.
        if (w && (el.currentTime < w.start || el.currentTime >= w.end)) el.currentTime = w.start;
      }
      if (e.type === "ended" && win.current && !windowEnded.current) {
        // The file's own end is the window's end.
        if (opts.current.loop) {
          el.currentTime = win.current.start;
          void el.play().catch(() => {});
        } else {
          windowEnded.current = true;
          opts.current.onWindowEnd?.();
        }
      }
      if (e.type === "timeupdate") enforce(el);
      if (e.type === "loadedmetadata" && pendingSeek.current !== null) {
        el.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
      if (e.type === "emptied" || e.type === "loadstart") {
        blocked.current = null;
        streamProblem.current = null;
      }
      if (e.type === "pause" && !el.ended) edgePause.current = false;
      read();
    };
    for (const type of EVENTS) el.addEventListener(type, on);
    read();
    return () => {
      for (const type of EVENTS) el.removeEventListener(type, on);
    };
  });

  // How much was seen (issue #272). Counted from the element's own events: a second counts when `timeupdate` shows the
  // playhead moved forward a little while playing; a seek (`seeking`) breaks the run, so a jump counts nothing.
  const seen = React.useRef({ ranges: createWatchedRanges(), last: null as number | null, since: 0, position: 0, duration: null as number | null, reported: "", key: null as string | null });
  const report = React.useCallback(() => {
    const w = seen.current;
    const total = w.ranges.total();
    const signature = `${w.position}:${total}`;
    if (!opts.current.onProgress || signature === w.reported || (total === 0 && w.position === 0)) return;
    w.reported = signature;
    w.since = 0;
    opts.current.onProgress({ position: w.position, watched: total, duration: w.duration });
  }, []);
  useElementListeners(ref, (el) => {
    const w = seen.current;
    // Forward and small: a timeupdate is about every 250 ms (about a second in a background tab), more at a faster rate.
    const count = (to: number) => {
      if (w.last !== null && to > w.last && to - w.last <= 2 * Math.max(1, el.playbackRate) + 0.5) {
        w.ranges.add(w.last, to);
        w.since += to - w.last;
      }
      w.last = to;
    };
    const on = (e: Event) => {
      const now = Number.isFinite(el.currentTime) ? el.currentTime : 0;
      w.position = now;
      w.duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      if (e.type === "play" || e.type === "playing") w.last ??= now;
      else if (e.type === "seeking") w.last = null;
      else if (e.type === "seeked") w.last = el.paused ? null : now;
      else if (e.type === "timeupdate") {
        if (!el.paused && !el.ended) count(now);
        if (w.since >= (opts.current.progressEvery ?? 15)) report();
      } else if (e.type === "pause" || e.type === "ended") {
        if (e.type === "ended" && w.duration !== null) count(w.duration);
        else count(now);
        w.last = null;
        report();
      }
    };
    const types = ["play", "playing", "seeking", "seeked", "timeupdate", "pause", "ended"];
    for (const t of types) el.addEventListener(t, on);
    return () => {
      for (const t of types) el.removeEventListener(t, on);
    };
  });
  // A different file starts a new count (the old one is reported first); the same file reloaded (Try again) keeps it.
  React.useEffect(() => {
    const w = seen.current;
    const key = opts.current.progressKey ?? ref.current?.getAttribute("src") ?? "";
    if (w.key !== null && w.key !== key) {
      report();
      w.ranges.clear();
      w.last = null;
      w.since = 0;
      w.position = 0;
      w.reported = "";
    }
    w.key = key;
  });
  // Leaving the page: hidden (a phone's tab switch may be the last chance), the page going away, and this player unmounting.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const hidden = () => document.visibilityState === "hidden" && report();
    const leave = () => report();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
      report();
    };
  }, [report]);

  // Group: while joined, a `play` here pauses the others. Re-joins if the ref later holds another element.
  const joined = React.useRef<{ el: HTMLMediaElement; name: string; leave: () => void } | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (joined.current && (joined.current.el !== el || joined.current.name !== group)) {
      joined.current.leave();
      joined.current = null;
    }
    if (el && group && !joined.current) joined.current = { el, name: group, leave: joinMediaGroup(group, el) };
  });
  React.useEffect(
    () => () => {
      joined.current?.leave();
      joined.current = null;
    },
    [],
  );

  // A window set or changed from outside: if the element is outside it, go to its start.
  const startKey = active ? `${active.start}:${active.end}` : null;
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    windowEnded.current = false;
    if (el.readyState < 1) pendingSeek.current = active.start;
    else if (el.currentTime < active.start || el.currentTime >= active.end) el.currentTime = active.start;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey]);

  // The frame loop: exact stops at the window's end and `onTimeUpdate` at the display's rate. Only while playing.
  React.useEffect(() => {
    if (!snapshot.playing || (!active && !options.onTimeUpdate)) return;
    let frame = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        enforce(el);
        opts.current.onTimeUpdate?.(el.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.playing, active !== null, options.onTimeUpdate !== undefined, enforce, ref]);

  return React.useMemo<MediaElementState>(() => {
    const play = async () => {
      const el = ref.current;
      if (!el) return;
      try {
        await el.play();
      } catch (e) {
        // A load error also rejects play(); it is reported through the element's own error.
        if (e instanceof DOMException && e.name === "NotAllowedError") {
          blocked.current = { kind: "blocked", message: "The browser blocked playback until you press Play." };
          read();
        } else if (!(e instanceof DOMException && e.name === "AbortError")) read();
      }
    };
    const playWindow = async (w: MediaWindow) => {
      const el = ref.current;
      if (!el) return;
      // Set first, synchronously: the `play` event reads it before React has rendered.
      win.current = w;
      windowEnded.current = false;
      setOwnWindow(w);
      if (el.readyState < 1) pendingSeek.current = w.start;
      else el.currentTime = w.start;
      await play();
    };
    return {
      ...snapshot,
      window: active,
      playWindow,
      reportProblem: (message) => {
        streamProblem.current = message;
        read();
      },
      play,
      pause: () => ref.current?.pause(),
      toggle: () => {
        const el = ref.current;
        if (!el) return;
        if (el.paused || el.ended) void play();
        else el.pause();
      },
      seek: (time) => {
        const el = ref.current;
        if (!el) return;
        if (el.readyState < 1) pendingSeek.current = Math.max(0, time);
        else el.currentTime = Math.max(0, Number.isFinite(el.duration) ? Math.min(time, el.duration) : time);
        read();
      },
      setVolume: (volume) => {
        const el = ref.current;
        if (!el) return;
        const v = Math.min(Math.max(volume, 0), 100);
        el.muted = v === 0;
        if (v > 0) el.volume = v / 100;
      },
      setRate: (rate) => {
        const el = ref.current;
        if (!el) return;
        // The default too: loading another source resets `playbackRate` to `defaultPlaybackRate`, which would drop the chosen speed at every chapter.
        el.defaultPlaybackRate = rate;
        el.playbackRate = rate;
        // Speech at 0.75 or 2.5 times is only listenable at its own pitch.
        el.preservesPitch = true;
      },
      markWatched: (start, end) => {
        const w = seen.current;
        const top = w.duration ?? end;
        w.ranges.add(Math.max(start, 0), Math.min(end, top));
      },
      retry: () => {
        const el = ref.current;
        if (!el) return;
        const resume = !el.paused;
        const at = el.currentTime;
        blocked.current = null;
        streamProblem.current = null;
        if (opts.current.onRetry) {
          // A stream the element cannot reload: its engine restarts at the current time.
          opts.current.onRetry(at);
          read();
          return;
        }
        el.load();
        if (at > 0) pendingSeek.current = at;
        read();
        if (resume) void play();
      },
    };
  }, [snapshot, ref, read, active]);
}

/** What a stream engine is given when it takes over an element. */
export type StreamContext = {
  /** Where to start, seconds (a reload starts where playback was). */
  startAt: number;
  /** Tell the player the stream failed, in words for the person: it shows the load error with Try again. */
  onProblem: (message: string) => void;
  /** The source is still being made (`MediaPlayer growing`): its start exists and the edge moves, so a first load starts at the beginning, not at the newest part. */
  growing?: boolean;
};

/** A stream engine's hold on an element, so the player can end it and restart it. */
export type StreamAttachment = {
  /** Lets go of the element: stops loading, frees what the engine made. */
  detach: () => void;
  /** Starts again from `at` seconds (the player's Try again). */
  reload: (at: number) => void;
};

/**
 * Plays a source the element cannot play by itself (HLS outside Safari, say) by taking over the
 * element: sets what it needs on it, and returns a hold the player ends when the source changes or the
 * player unmounts. `strata-react/hls` has one; any engine that fits is used the same way.
 */
export type SourceAttacher = (el: HTMLMediaElement, src: string, context: StreamContext) => StreamAttachment;

/**
 * Hands `src` to a stream engine (`attach`) for the element in `ref`, and ends the hold when `src` changes, `attach` does, or the component unmounts.
 * Use it for a plain `<video>` the app owns, with `useMediaElement`; `MediaPlayer` does it for `attach`.
 * Returns `reload`, for the player's Try again (`useMediaElement`'s `onRetry`), and gives the engine's failures to `onProblem` (`reportProblem`).
 */
export function useAttachedSource(ref: React.RefObject<HTMLMediaElement | null>, src: string | undefined, attach: SourceAttacher | undefined, onProblem?: (message: string) => void, growing?: boolean, start?: number): { reload: (at: number) => void } {
  const hold = React.useRef<{ el: HTMLMediaElement; src: string; attach: SourceAttacher; attachment: StreamAttachment } | null>(null);
  const problem = React.useRef(onProblem);
  problem.current = onProblem;
  const grows = React.useRef(growing);
  grows.current = growing;
  // Where the first load begins (issue #271); later sources start at their own beginning.
  const first = React.useRef(start);
  // Runs after every commit, not only when `src` or `attach` change: a `MediaPlayer` that switches
  // between audio and video replaces the element and keeps the ref object, so the element's identity
  // is checked too, and the engine is moved to the new one.
  React.useEffect(() => {
    const el = ref.current;
    const now = hold.current;
    if (now && now.el === el && now.src === src && now.attach === attach) return;
    now?.attachment.detach();
    hold.current = null;
    if (!el || !attach || !src) return;
    const begin = first.current;
    first.current = 0;
    hold.current = { el, src, attach, attachment: attach(el, src, { startAt: begin ?? 0, onProblem: (m) => problem.current?.(m), growing: grows.current }) };
  });
  React.useEffect(() => () => {
    hold.current?.attachment.detach();
    hold.current = null;
  }, []);
  return React.useMemo(() => ({ reload: (at: number) => hold.current?.attachment.reload(at) }), []);
}

/** One file in a sequence. */
export type MediaSource = {
  src: string;
  /** Names the source on the seek bar's marks and in "Chapter 2 of 5". */
  title: string;
  /** Seconds. When every source gives it, the seek bar spans the whole sequence. */
  duration?: number;
};

/** Lock-screen and headset metadata (`navigator.mediaSession`). */
export type MediaSession = { title: string; artist?: string; album?: string; artwork?: string };

export type MediaPlayerProps = {
  /** Names the player and its element. */
  label: string;
  kind?: "audio" | "video";
  /** One file. */
  src?: string;
  /** Or a sequence; ending moves to the next and keeps playing. */
  sources?: readonly MediaSource[];
  /** The current source, when the app holds it (a chapter list beside the player). */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Move to the next source when one ends. Default true. */
  autoAdvance?: boolean;
  /** `"auto"`: the browser's controls on a touch device, Strata's on a desktop. Default. */
  controls?: "auto" | "native" | "strata";
  autoPlay?: boolean;
  poster?: string;
  session?: MediaSession;
  /** The playback speeds offered. Default 0.5 to 2; for speech use {@link SPEECH_RATES}. */
  rates?: readonly number[];
  /** Keys on the page (Space or K, J and L for 10 s, M). Default true; turn off when the screen binds its own. With several players on a page the keys go to the one last played, focused or pressed. */
  shortcuts?: boolean;
  /** Play only a stretch of the file (seconds): it starts at `start`, stops at `end` (or loops), the seek bar and time show the stretch, and "Playing 0:12 to 0:15" is announced. One file only, not with `sources`. */
  window?: MediaWindow;
  /** Go back to the start of `window` at its end and carry on. */
  loop?: boolean;
  /** Show the whole file's timeline with the window marked, instead of the window as the whole bar. */
  showFull?: boolean;
  /** Join a group: starting this player pauses the others in it. Defaults to the nearest `MediaGroup`. */
  group?: string;
  /** Called every animation frame while playing, with the time in the file (not in the window), for highlighting. */
  onTimeUpdate?: (time: number) => void;
  /** The window reached its end (not called when it loops). */
  onWindowEnd?: () => void;
  /** Plays the sources through a stream engine instead of the element's own `src` (`attachHls` from `strata-react/hls` for HLS). The element is the same one throughout, so playback carries on across sources as ever. */
  attach?: SourceAttacher;
  /** The source is still being made (a stream that grows while it plays): the seek bar shows the part that exists, a "Still being made" word and `status` (what the app says about progress) appear, and playback that catches up with the end waits, says so, and resumes when more arrives, without an `onEnded`. Give the source's `duration` when the whole length is known. */
  growing?: { status?: string };
  /** The last source has ended. */
  onEnded?: () => void;
  /** Called as the element plays, with the time in the whole sequence. */
  onTimeChange?: (time: number) => void;
  /** Marked stretches (an intro, a recap, a sponsor read), in seconds on the player's timeline: drawn on the seek bar, and acted on as playback reaches them as `spanKinds` says (strata-react issue #207). */
  spans?: readonly MediaSpanData[];
  /** For each kind of span: its `label`, its `tone` (a status role) and what happens on reaching one: `"auto"` skips it (or mutes it, for a span whose `action` is `"mute"`) with "Skipped intro" and Undo, `"ask"` offers a Skip button over the picture (and the `s` key), `"off"` (default) only draws it. Keep the object stable (state or `useMemo`). */
  spanKinds?: Readonly<Record<string, SpanKind>>;
  /** Told what was done with a span: `skipped`, `muted`, `undone` or `played`. */
  onSpan?: (span: MediaSpanData, what: SpanOutcome) => void;
  /** The Skip button's and the notice's words, in the product's language. */
  spanWords?: SpanWords;
  /** Where a first load begins, seconds (strata-react issue #271: "Continue watching"). For an `attach`ed stream it is the attacher's `startAt`; for a plain `src`, a seek once the metadata is in. A reload (Try again) keeps the time reached. While it is more than 0 the player says "Picked up at 2:05" over the picture, with Start over, until the person starts over, plays for a few seconds, or it is dismissed by seeking. */
  start?: number;
  /** The words of that notice, in the product's language. */
  resumeWords?: ResumeWords;
  /** How much has been seen: every `progressEvery` seconds of playing, and on pause, on the end, when the page is hidden or left and when the player unmounts, with the position and the seconds played through (a span the player skipped counts as watched). `index` is the source in a `sources` sequence, and the times are those of that file (strata-react issue #272). */
  onProgress?: (report: MediaProgress & { index: number }) => void;
  /** Seconds of playing between progress reports. Default 15. */
  progressEvery?: number;
  /** The player's state and requests (`seek`, `setVolume`, `time`, `duration`…), for an app that acts on playback from beside it: a chapter list, comments at a time (strata-react issue #211). An object ref holds the latest state without rendering again; a function ref is called with it on every render. */
  mediaRef?: React.Ref<MediaElementState>;
  /** Drawn over the picture only (never the controls) in a box that fills it; the app's classes choose the corner (`absolute bottom-3 right-3`). Anything interactive in it is clickable and focusable. A video's box keeps its shape before the metadata loads, so the overlay has a stable place. */
  overlay?: (media: MediaElementState) => React.ReactNode;
  /** Content below the controls for playback-related messages and actions. Hides with the controls during idle fullscreen playback. */
  status?: React.ReactNode;
  /** A transient warning from `usePlayerWarnings`, shown independently of the controls. */
  warning?: PlayerWarningEvent;
  /** The picture's shape before its metadata loads (and after, when given): a width over a height, or "16/9". Default "16/9" until the video says its own. */
  aspect?: number | `${number}/${number}`;
  /** A video has a Full screen button (and the `f` key) beside the speed and volume. Default true; `false` for a picture that must stay in its place. Only where the browser has the Fullscreen API (the window-filling fallback would mount the video again and lose its place). Not drawn with the browser's own controls (`controls="native"`, or `"auto"` on a touch device), which have their own. */
  fullscreen?: boolean;
  className?: string;
};

// Which player the page's keys belong to. A page with one player binds them for it, as ever. With
// several, binding Space once per player played and paused every one of them at once, so the keys go
// to the player last used (played, focused or pressed) and the others leave them alone (issue #147,
// from strata-models' blind A/B of two voices). A tiny store outside React so the players on a page
// can see each other without a provider the app would have to add.
const keyPlayers = (() => {
  const ids = new Set<string>();
  let active: string | null = null;
  let warned = false;
  const listeners = new Set<() => void>();
  let snapshot = { count: 0, active: null as string | null };
  const emit = () => {
    snapshot = { count: ids.size, active };
    listeners.forEach((l) => l());
  };
  return {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    get: () => snapshot,
    add(id: string) {
      ids.add(id);
      if (ids.size === 2 && !warned && isDev()) {
        warned = true;
        console.warn("strata-react: several MediaPlayers are on this page, so Space, K, J, L and M go to the one last played or focused. Pass shortcuts={false} to one you bind your own keys for.");
      }
      emit();
    },
    remove(id: string) {
      ids.delete(id);
      if (active === id) active = null;
      emit();
    },
    use(id: string) {
      // A player with shortcuts off is not registered and must not take the keys from the others.
      if (active === id || !ids.has(id)) return;
      active = id;
      emit();
    },
  };
})();

/** Playback speeds an audiobook or lecture listener expects. */
export const SPEECH_RATES: readonly number[] = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const JUMP = 10;

/** How long a notice such as "Picked up at 2:05" stays once the player is playing. */
const NOTICE_MS = 6000;

function useCoarsePointer() {
  const [coarse, setCoarse] = React.useState(false);
  React.useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(pointer: coarse)");
    const read = () => setCoarse(query.matches);
    read();
    query.addEventListener?.("change", read);
    return () => query.removeEventListener?.("change", read);
  }, []);
  return coarse;
}

/**
 * Plays a file or a sequence: the element, its state, and Strata's controls (or the browser's own on
 * a touch device), with the failure to load shown and retried. For an editor or a replay, use the
 * parts and `useMediaElement` directly.
 */
export function MediaPlayer({
  label,
  kind = "audio",
  src,
  sources,
  index: controlledIndex,
  onIndexChange,
  autoAdvance = true,
  controls = "auto",
  autoPlay,
  poster,
  session,
  rates,
  shortcuts = true,
  attach,
  growing,
  window: bound,
  loop,
  showFull,
  group,
  onTimeUpdate,
  onWindowEnd,
  onEnded,
  onTimeChange,
  spans,
  spanKinds,
  onSpan,
  spanWords,
  start,
  resumeWords,
  onProgress,
  progressEvery,
  mediaRef,
  overlay,
  status,
  warning,
  aspect,
  fullscreen = true,
  className,
}: MediaPlayerProps) {
  const list = React.useMemo<readonly MediaSource[]>(() => sources ?? (src ? [{ src, title: label }] : []), [sources, src, label]);
  const [ownIndex, setOwnIndex] = React.useState(0);
  const index = Math.min(controlledIndex ?? ownIndex, Math.max(list.length - 1, 0));
  const current = list[index];
  const ref = React.useRef<HTMLMediaElement>(null);
  const stream = React.useRef<{ reload: (at: number) => void }>({ reload: () => {} });
  const sourceIndex = React.useRef(index);
  const progress = React.useCallback((r: MediaProgress) => onProgress?.({ ...r, index: sourceIndex.current }), [onProgress]);
  const media = useMediaElement(ref, { window: bound, loop, group, onTimeUpdate, onWindowEnd, growing: growing !== undefined, onRetry: attach ? (t) => stream.current.reload(t) : undefined, onProgress: onProgress ? progress : undefined, progressEvery, progressKey: current?.src });
  // After the hook's own effects, so a report made because the file changed still names the file it is about.
  React.useEffect(() => void (sourceIndex.current = index), [index]);
  stream.current = useAttachedSource(ref, current?.src, attach, media.reportProblem, growing !== undefined, start);
  const coarse = useCoarsePointer();
  const native = controls === "native" || (controls === "auto" && coarse);

  const go = React.useCallback(
    (to: number) => {
      if (controlledIndex === undefined) setOwnIndex(to);
      onIndexChange?.(to);
    },
    [controlledIndex, onIndexChange],
  );
  // Changing src on the same element: whether to carry on playing, and where to start, are applied once the new file is loaded.
  const resume = React.useRef(false);
  const startAt = React.useRef<number | null>(null);
  const keep = React.useRef({ index, playing: media.playing, go, onEnded, autoAdvance, last: list.length - 1 });
  keep.current = { index, playing: media.playing, go, onEnded, autoAdvance, last: list.length - 1 };

  const wasSrc = React.useRef(current?.src);
  React.useEffect(() => {
    if (wasSrc.current === current?.src) return;
    wasSrc.current = current?.src;
    const el = ref.current;
    if (!el) return;
    if (startAt.current !== null) {
      media.seek(startAt.current);
      startAt.current = null;
    }
    if (resume.current) {
      resume.current = false;
      void media.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.src]);

  const growingRef = React.useRef(growing !== undefined);
  growingRef.current = growing !== undefined;
  const onEnd = React.useCallback(() => {
    const k = keep.current;
    // A source still being made has not ended: it is waiting for more.
    if (growingRef.current) return;
    if (k.autoAdvance && k.index < k.last) {
      resume.current = true;
      k.go(k.index + 1);
    } else k.onEnded?.();
  }, []);
  useElementListeners(ref, (el) => {
    el.addEventListener("ended", onEnd);
    return () => el.removeEventListener("ended", onEnd);
  });

  // The sequence as one timeline, when every source says how long it is.
  const offsets = React.useMemo(() => {
    if (list.length < 2 || !list.every((s) => s.duration && s.duration > 0)) return null;
    let at = 0;
    return list.map((s) => {
      const start = at;
      at += s.duration!;
      return start;
    });
  }, [list]);
  const total = offsets ? offsets[offsets.length - 1] + list[list.length - 1].duration! : null;
  // A window is the bar's whole length unless `showFull`: times are shown from its start.
  const cut = bound && !showFull ? bound : null;
  const time = cut ? Math.min(Math.max(media.time - cut.start, 0), cut.end - cut.start) : (offsets ? offsets[index] : 0) + media.time;
  // A source still being made: the whole length when the app knows it, with the part that exists drawn as ready; otherwise the part that exists.
  const wholeLength = growing && list.length === 1 && list[0].duration ? list[0].duration : null;
  const duration = cut ? cut.end - cut.start : (total ?? wholeLength ?? media.duration);

  const seek = (t: number) => {
    if (growing && media.ready > 0) t = Math.min(t, media.ready);
    if (cut) return media.seek(cut.start + Math.min(Math.max(t, 0), cut.end - cut.start));
    if (!offsets) return media.seek(t);
    let to = offsets.length - 1;
    while (to > 0 && offsets[to] > t) to--;
    if (to === index) return media.seek(t - offsets[to]);
    resume.current = media.playing;
    startAt.current = t - offsets[to];
    go(to);
  };
  const step = (by: number) => {
    const to = index + by;
    if (to < 0 || to > list.length - 1) return;
    resume.current = media.playing;
    go(to);
  };

  // Where the element's own time is, from the player's: a skipped span is in the player's timeline (a sequence, a window), what is counted is the file's.
  const toFile = (t: number) => (cut ? t + cut.start : offsets ? t - offsets[index] : t);
  const spanSeen = (span: MediaSpanData, what: SpanOutcome) => {
    // Skipped on purpose counts as seen (issue #272); a muted span was played, so the element's own count has it.
    if (what === "skipped" && (span.action ?? "skip") === "skip") media.markWatched(toFile(span.start), toFile(span.end));
    onSpan?.(span, what);
  };

  // Picking up where the last play stopped (issue #271). A plain `src` seeks to it once the metadata is in (the seek is held until then); a stream engine is given it as `startAt`.
  const [picked, setPicked] = React.useState(() => (start ?? 0) > 0);
  const pickedAt = React.useRef(start ?? 0);
  React.useEffect(() => {
    if (pickedAt.current > 0 && !attach) media.seek(pickedAt.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The notice stays until it is answered, then a few seconds once playing; moving on to another source dismisses it.
  React.useEffect(() => {
    if (!picked || !media.playing) return;
    const t = setTimeout(() => setPicked(false), NOTICE_MS);
    return () => clearTimeout(t);
  }, [picked, media.playing]);
  React.useEffect(() => {
    if (index > 0) setPicked(false);
  }, [index]);
  const say = { pickedUp: (t: string) => `Picked up at ${t}`, startOver: "Start over", ...resumeWords };
  const resumeNotice = picked ? { text: say.pickedUp(format.runningTime(pickedAt.current)), actionLabel: say.startOver, run: () => { setPicked(false); seek(0); } } : null;

  const spanState = useMediaSpans({ spans, kinds: spanKinds, words: spanWords, onSpan: spanSeen, time, playing: media.playing, duration: growing ? null : duration, limit: growing ? media.ready : undefined, seek, volume: media.volume, setVolume: media.setVolume });
  const offer = spanState.offer;

  // The app's hold on the state: an object ref keeps the latest (no render of its own), a function ref hears every render.
  React.useEffect(() => {
    if (typeof mediaRef === "function") mediaRef(media);
    else if (mediaRef) (mediaRef as React.MutableRefObject<MediaElementState | null>).current = media;
  });
  React.useEffect(
    () => () => {
      if (mediaRef && typeof mediaRef !== "function") (mediaRef as React.MutableRefObject<MediaElementState | null>).current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // The picture's own shape once it is known, so the box does not change when the metadata arrives.
  const [natural, setNatural] = React.useState<number | null>(null);
  useElementListeners(ref, (el) => {
    const read = () => setNatural(el instanceof HTMLVideoElement && el.videoWidth > 0 && el.videoHeight > 0 ? el.videoWidth / el.videoHeight : null);
    for (const t of ["loadedmetadata", "resize", "emptied"]) el.addEventListener(t, read);
    read();
    return () => {
      for (const t of ["loadedmetadata", "resize", "emptied"]) el.removeEventListener(t, read);
    };
  });

  React.useEffect(() => {
    if (onTimeChange) onTimeChange(time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  // Full screen is the shared `FullscreenFrame` (the Fullscreen API, a window-filling modal on an iPhone), held here so the button and `f` share it.
  const [full, setFull] = React.useState(false);
  // Only where the browser has the Fullscreen API: the window-filling fallback would mount the video again and lose its place (and iPhone's own video controls have full screen).
  const [fullApi, setFullApi] = React.useState(false);
  React.useEffect(() => setFullApi(canFullscreen()), []);
  const canFull = fullscreen && fullApi && kind === "video" && !native;
  const autoHideControls = full && canFull && media.playing;
  const [controlsIdle, setControlsIdle] = React.useState(false);
  const idleTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const wakeControls = React.useCallback(() => {
    clearTimeout(idleTimer.current);
    setControlsIdle(false);
    if (autoHideControls) idleTimer.current = setTimeout(() => setControlsIdle(true), 3000);
  }, [autoHideControls]);
  React.useEffect(() => {
    wakeControls();
    return () => clearTimeout(idleTimer.current);
  }, [wakeControls]);
  const hideControls = autoHideControls && controlsIdle;
  // On the picture: a click plays or pauses and a double click toggles full screen (two clicks cancel out, so the double click leaves playback as it was); the wheel sets the volume, but only while the player has focus, so scrolling past a video still scrolls the page. With the browser's own controls its click and double click are left alone (they do this already); the wheel works there too. The wheel listener is not passive, to stop the page scrolling.
  const stage = React.useRef<HTMLDivElement>(null);
  const latest = React.useRef(media);
  latest.current = media;
  React.useEffect(() => {
    const el = stage.current;
    if (!el || kind !== "video") return;
    const onWheel = (e: WheelEvent) => {
      if (!el.contains(document.activeElement) || e.ctrlKey || !e.deltaY) return;
      e.preventDefault();
      const m = latest.current;
      m.setVolume(Math.min(100, Math.max(0, m.volume + (e.deltaY < 0 ? WHEEL_VOLUME_STEP : -WHEEL_VOLUME_STEP))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [kind]);
  const keys = React.useMemo<Shortcut[]>(
    () => [
      { keys: [" ", "k"], label: "Play or pause", run: media.toggle },
      { keys: ["j"], label: `Back ${JUMP} s`, run: () => seek(time - JUMP), repeat: true },
      { keys: ["l"], label: `Forward ${JUMP} s`, run: () => seek(time + JUMP), repeat: true },
      { keys: ["m"], label: "Mute", run: () => media.setVolume(media.muted ? 100 : 0) },
      ...(canFull ? [{ keys: ["f"], label: full ? "Leave full screen" : "Full screen", run: () => setFull((f) => !f) }] : []),
      ...(offer ? [{ keys: ["s"], label: offer.label, run: offer.run }] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, time, offsets, index, offer, canFull, full],
  );
  // Several players on a page: the keys follow the last used (see keyPlayers); alone, they are this one's.
  const id = React.useId();
  React.useEffect(() => {
    if (!shortcuts || native) return;
    keyPlayers.add(id);
    return () => keyPlayers.remove(id);
  }, [id, shortcuts, native]);
  const page = React.useSyncExternalStore(keyPlayers.subscribe, keyPlayers.get, keyPlayers.get);
  React.useEffect(() => {
    if (media.playing && shortcuts && !native) keyPlayers.use(id);
  }, [media.playing, id, shortcuts, native]);
  const activeKeys = autoHideControls ? keys.map((shortcut) => ({
    ...shortcut,
    run: () => {
      wakeControls();
      shortcut.run();
    },
  })) : keys;
  useHotkeys(activeKeys, { enabled: shortcuts && !native && (page.count <= 1 || page.active === id) });

  // Lock-screen and headset controls.
  React.useEffect(() => {
    if (!session || typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    const s = navigator.mediaSession;
    s.metadata = new MediaMetadata({ title: current?.title ?? session.title, artist: session.artist, album: session.album ?? (list.length > 1 ? session.title : undefined), artwork: session.artwork ? [{ src: session.artwork }] : [] });
    return () => {
      s.metadata = null;
    };
  }, [session, current?.title, list.length]);
  React.useEffect(() => {
    if (!session || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const s = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        s.setActionHandler(action, handler);
      } catch {
        // An action this browser does not offer.
      }
    };
    set("play", () => void media.play());
    set("pause", media.pause);
    set("seekbackward", () => seek(time - JUMP));
    set("seekforward", () => seek(time + JUMP));
    set("previoustrack", index > 0 ? () => step(-1) : null);
    set("nexttrack", index < list.length - 1 ? () => step(1) : null);
    return () => {
      for (const a of ["play", "pause", "seekbackward", "seekforward", "previoustrack", "nexttrack"] as const) set(a, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, media, time, index, list.length]);

  const common = { ref: ref as React.Ref<never>, src: attach ? undefined : current?.src, controls: native, autoPlay, preload: "metadata" as const, "aria-label": `${label}, ${kind}` };
  const hasSpans = (spans?.length ?? 0) > 0;
  const showActions = hasSpans || picked;
  // The picture sits in a box of its own shape (the app's `aspect`, else the video's, else 16:9 until it says), so the page does not jump
  // when the metadata arrives and an overlay has a place to be. The controls are outside the box.
  const element =
    kind === "video" ? (
      <div ref={stage} tabIndex={-1} className={cn("relative w-full overflow-hidden rounded-surface bg-surface-sunken outline-none", full && "min-h-0 flex-1")} style={full ? undefined : { aspectRatio: aspect ?? natural ?? 16 / 9 }}>
        <video
          {...common}
          poster={poster}
          playsInline
          onClick={native ? undefined : () => media.toggle()}
          onDoubleClick={canFull ? () => setFull((f) => !f) : undefined}
          className="absolute inset-0 size-full object-contain"
        />
        {(overlay || showActions) && (
          <div className="pointer-events-none absolute inset-0 [&>*]:pointer-events-auto">
            {overlay?.(media)}
            {showActions && <SpanActions state={spanState} other={resumeNotice} className={cn("absolute right-3 flex flex-col items-end gap-2", native ? "bottom-14" : "bottom-3")} />}
          </div>
        )}
      </div>
    ) : (
      <audio {...common} className={native ? "w-full" : "hidden"} />
    );
  const warningToast = warning && (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 grid justify-items-end">
      <PlayerWarningToast key={warning.key} warning={warning} />
    </div>
  );
  const what = kind === "video" ? "this video" : "this recording";

  return (
    <FullscreenFrame label={label} active={full} onActiveChange={setFull} modal={false} className={className}>
    <div role="group" aria-label={label} onFocusCapture={() => keyPlayers.use(id)} onMouseMoveCapture={autoHideControls ? wakeControls : undefined} onKeyDownCapture={autoHideControls ? wakeControls : undefined} onPointerDownCapture={() => keyPlayers.use(id)} className={cn("relative grid w-full gap-2", full && "flex h-full min-h-0 flex-col")}>
      {element}
      {native && hasSpans && <SpanStrip spans={spanState.bars} duration={duration} label={`Marked parts of ${label}`} />}
      {warningToast}
      {kind === "audio" && showActions && <SpanActions state={spanState} other={resumeNotice} className="flex flex-wrap items-center gap-2" />}
      {kind === "audio" && overlay?.(media)}
      {media.error?.kind === "load" && (
        <Alert
          tone="danger"
          announce
          title={`Could not load ${what}`}
          action={
            <Button size="sm" variant="outline" onClick={media.retry}>
              Try again
            </Button>
          }
        >
          {media.error.message}
        </Alert>
      )}
      {media.error?.kind === "blocked" && (
        <p role="status" className="type-body-sm text-muted-foreground">
          {media.error.message}
        </p>
      )}
      {/* Keep controls and status actions tabbable without reserving space for the idle panel. */}
      {(growing || bound || !native || status) && (
        <div className={cn("grid gap-2", hideControls && "pointer-events-none absolute inset-x-0 bottom-0 opacity-0 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:static has-[:focus-visible]:opacity-100")}>
          {growing && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Status tone="info" icon={LoaderCircle}>
                Still being made
              </Status>
              {growing.status && <span className="type-body-sm text-muted-foreground">{growing.status}</span>}
              <span role="status" className="type-body-sm text-muted-foreground">
                {media.waitingForMore ? "Waiting for more to be made. It will carry on by itself." : ""}
              </span>
            </div>
          )}
          {bound && (
            <>
              <p className="type-caption text-muted-foreground tabular-nums">
                {format.runningTime(bound.start)} to {format.runningTime(bound.end)}
                {loop ? ", looping" : ""}
              </p>
              <VisuallyHidden>
                <span role="status">{media.playing ? `Playing ${format.runningTime(bound.start)} to ${format.runningTime(bound.end)}` : ""}</span>
              </VisuallyHidden>
            </>
          )}
          {!native && (
            <div className="grid gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <SeekBar
                  time={time}
                  duration={duration}
                  onSeek={seek}
                  buffered={growing ? media.ready : offsets ? undefined : media.buffered}
                  spans={spanState.bars}
                  marks={bound && showFull ? [{ time: bound.start, label: "Window starts" }, { time: bound.end, label: "Window ends" }] : offsets ? list.map((s, i) => ({ time: offsets[i], label: s.title })).slice(1) : []}
                  step={JUMP}
                  bigStep={60}
                  label={`Seek in ${label}`}
                />
                <TimeReadout time={time} duration={duration} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Transport playing={media.playing} onPlayPause={media.toggle}>
                  {list.length > 1 && <IconButton icon={SkipBack} label="Previous chapter" disabled={index === 0} onClick={() => step(-1)} />}
                  {list.length > 1 && <IconButton icon={SkipForward} label="Next chapter" disabled={index === list.length - 1} onClick={() => step(1)} />}
                </Transport>
                {list.length > 1 && (
                  <span className="type-body-sm text-muted-foreground">
                    {current?.title} ({index + 1} of {list.length})
                  </span>
                )}
                <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
                  <RateChoice rate={media.rate} onRateChange={media.setRate} rates={rates} />
                  <VolumeControl volume={media.volume} onVolumeChange={media.setVolume} />
                  {canFull && <IconButton icon={full ? Minimize : Maximize} label={full ? "Leave full screen" : "Full screen"} onPress={() => setFull(!full)} />}
                </span>
              </div>
            </div>
          )}
          {status}
        </div>
      )}
    </div>
    </FullscreenFrame>
  );
}
