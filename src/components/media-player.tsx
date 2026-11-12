import * as React from "react";
import { SkipBack, SkipForward } from "lucide-react";
import { cn } from "../lib/utils";
import { Alert } from "./alert";
import { Button, IconButton } from "./button";
import { useHotkeys, type Shortcut } from "./hotkeys";
import { RateChoice, SeekBar, TimeReadout, Transport, VolumeControl } from "./media";
import { joinMediaGroup, useMediaGroupName } from "./media-group";
import { format } from "../lib/format";
import { VisuallyHidden } from "react-aria";

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

/** Why a player is not playing, for the app to word. */
export type MediaProblem = { kind: "load"; message: string } | { kind: "blocked"; message: string };

/** What `useMediaElement` returns: the element's state as values, and the requests a player makes of it. */
export type MediaElementState = {
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
};

type Snapshot = Omit<MediaElementState, "play" | "pause" | "toggle" | "seek" | "setVolume" | "setRate" | "retry" | "playWindow" | "window">;

const idle: Snapshot = { playing: false, time: 0, duration: null, buffered: 0, volume: 100, muted: false, rate: 1, ended: false, loading: false, error: null };

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
  const contextGroup = useMediaGroupName();
  const group = options.group ?? contextGroup;

  const read = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const finite = Number.isFinite(el.duration) && el.duration > 0;
    let error: MediaProblem | null = blocked.current;
    // Code 1 is the load being abandoned on purpose (a new src), not a failure.
    if (el.error && el.error.code !== 1) error = { kind: "load", message: LOAD_MESSAGES[el.error.code] ?? "It could not be played." };
    const next: Snapshot = {
      playing: !el.paused && !el.ended,
      time: Number.isFinite(el.currentTime) ? el.currentTime : 0,
      duration: finite ? el.duration : null,
      buffered: bufferedAhead(el),
      volume: el.muted ? 0 : Math.round(el.volume * 100),
      muted: el.muted,
      rate: el.playbackRate,
      ended: el.ended,
      loading: !error && el.networkState === 2 && el.readyState < 3 && !el.paused,
      error,
    };
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
      if (e.type === "emptied" || e.type === "loadstart") blocked.current = null;
      read();
    };
    for (const type of EVENTS) el.addEventListener(type, on);
    read();
    return () => {
      for (const type of EVENTS) el.removeEventListener(type, on);
    };
  });

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
      retry: () => {
        const el = ref.current;
        if (!el) return;
        const resume = !el.paused;
        const at = el.currentTime;
        blocked.current = null;
        el.load();
        if (at > 0) pendingSeek.current = at;
        read();
        if (resume) void play();
      },
    };
  }, [snapshot, ref, read, active]);
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
  /** The last source has ended. */
  onEnded?: () => void;
  /** Called as the element plays, with the time in the whole sequence. */
  onTimeChange?: (time: number) => void;
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
      if (ids.size === 2 && !warned && typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
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
  window: bound,
  loop,
  showFull,
  group,
  onTimeUpdate,
  onWindowEnd,
  onEnded,
  onTimeChange,
  className,
}: MediaPlayerProps) {
  const list = React.useMemo<readonly MediaSource[]>(() => sources ?? (src ? [{ src, title: label }] : []), [sources, src, label]);
  const [ownIndex, setOwnIndex] = React.useState(0);
  const index = Math.min(controlledIndex ?? ownIndex, Math.max(list.length - 1, 0));
  const current = list[index];
  const ref = React.useRef<HTMLMediaElement>(null);
  const media = useMediaElement(ref, { window: bound, loop, group, onTimeUpdate, onWindowEnd });
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

  const onEnd = React.useCallback(() => {
    const k = keep.current;
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
  const duration = cut ? cut.end - cut.start : (total ?? media.duration);

  const seek = (t: number) => {
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

  React.useEffect(() => {
    if (onTimeChange) onTimeChange(time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);

  const keys = React.useMemo<Shortcut[]>(
    () => [
      { keys: [" ", "k"], label: "Play or pause", run: media.toggle },
      { keys: ["j"], label: `Back ${JUMP} s`, run: () => seek(time - JUMP), repeat: true },
      { keys: ["l"], label: `Forward ${JUMP} s`, run: () => seek(time + JUMP), repeat: true },
      { keys: ["m"], label: "Mute", run: () => media.setVolume(media.muted ? 100 : 0) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, time, offsets, index],
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
  useHotkeys(keys, { enabled: shortcuts && !native && (page.count <= 1 || page.active === id) });

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

  const common = { ref: ref as React.Ref<never>, src: current?.src, controls: native, autoPlay, preload: "metadata" as const, "aria-label": `${label}, ${kind}` };
  const element = kind === "video" ? <video {...common} poster={poster} playsInline className="w-full rounded-surface bg-surface-sunken" /> : <audio {...common} className={native ? "w-full" : "hidden"} />;
  const what = kind === "video" ? "this video" : "this recording";

  return (
    <div role="group" aria-label={label} onFocusCapture={() => keyPlayers.use(id)} onPointerDownCapture={() => keyPlayers.use(id)} className={cn("grid w-full gap-2", className)}>
      {element}
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
              buffered={offsets ? undefined : media.buffered}
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
            <span className="ml-auto flex items-center gap-3">
              <RateChoice rate={media.rate} onRateChange={media.setRate} rates={rates} />
              <VolumeControl volume={media.volume} onVolumeChange={media.setVolume} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
