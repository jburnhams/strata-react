import * as React from "react";
import { format } from "../lib/format";
import { MicrophoneError, useMicrophone, type Microphone, type MicrophoneStream } from "../lib/microphone";
import { encodeWav, LEVEL_FLOOR_DB, peakDb } from "../lib/recording";
import { createSegmenter, type Segmenter, type SegmenterOptions } from "../lib/segmenter";
import { Meter } from "./meter";
import { inputLevelThresholds, type Recording } from "./recorder";

// Hands-free recording (strata-voice's auto studio: "I can just speak without clicking anything"): the
// microphone stays open, each stretch of speech is cut out as its own take (lib/segmenter.ts says how and
// why), and the app is handed each one as it ends, as the same lossless `Recording` `useRecorder` makes.
// - `start` opens the microphone once and resolves true (false when it would not open, with the sentence
//   in `state`); `stop` closes it. Both hand over a take being heard at that moment if it has enough
//   speech, so stopping just after the last word does not lose it. Leaving the screen closes the
//   microphone and keeps nothing.
// - `paused` keeps the microphone open (no second permission prompt, the level still moves) but takes
//   nothing: for while the app itself is talking (a prompt read aloud) or the speaker wants a moment.
// - `onTake` is read when each take ends, not when the hook was made, so a screen can hand a take to
//   "the prompt now showing" without the microphone being opened again on every render.
// - The live level is the same peak as useRecorder's (the loudest of the last five chunks), and the room's
//   quiet is said beside it: "too quiet to start a take" is the one thing a hands-free speaker cannot see.
// `ListeningLevel` draws it. Not a React Aria part: none exists for capture, and nothing here is a control.

/** Where an auto recorder is: idle, opening the device, listening (and hearing a take or not), or refused. */
export type AutoRecorderState =
  | { phase: "idle" }
  | { phase: "opening" }
  | {
      phase: "listening";
      /** The live peak in dBFS. */
      level: number;
      /** The room's quiet in dBFS (RMS), or null before the first chunk. */
      noise: number | null;
      /** True while a take is being heard. */
      speaking: boolean;
      /** How long the take being heard has run, 0 when none. */
      seconds: number;
      /** True while `paused`: the microphone is open but nothing is taken. */
      paused: boolean;
    }
  | { phase: "failed"; reason: string };

/** A take cut from a microphone that is always open. */
export type AutoTake = Recording & {
  /** True when the speaker was still talking at `maxSeconds` and the take was cut there. */
  cut: boolean;
};

/** `useAutoRecorder`'s options: the segmenter's (`SegmenterOptions`) plus these. */
export type UseAutoRecorderOptions = Omit<SegmenterOptions, "maxSeconds"> & {
  /** The longest take, in seconds: a longer stretch of speech is cut there (`AutoTake.cut`). */
  maxSeconds: number;
  /** Called with each take as it ends. */
  onTake: (take: AutoTake) => void;
  /** Keep the microphone open but take nothing. */
  paused?: boolean;
  /** The microphone to listen to; `useMicrophone()` (the nearest `MicrophoneContext`) when left out. */
  microphone?: Microphone;
};

/** What `useAutoRecorder` returns. */
export type AutoRecorder = {
  state: AutoRecorderState;
  /** Opens the microphone and listens until `stop`; resolves false when it would not open or is already open. */
  start: () => Promise<boolean>;
  /** Closes the microphone, handing over a take being heard if it has enough speech. */
  stop: () => void;
  /** True while opening or listening. */
  listening: boolean;
};

const RECENT_CHUNKS = 5;

/** Listens all the time and hands over each stretch of speech as its own lossless take. */
export function useAutoRecorder({ maxSeconds, onTake, paused = false, microphone, ...tuning }: UseAutoRecorderOptions): AutoRecorder {
  const fromContext = useMicrophone();
  const device = microphone ?? fromContext;
  const [state, setState] = React.useState<AutoRecorderState>({ phase: "idle" });
  const stream = React.useRef<MicrophoneStream | null>(null);
  const segmenter = React.useRef<Segmenter | null>(null);
  const latest = React.useRef({ onTake, paused, maxSeconds, tuning });
  latest.current = { onTake, paused, maxSeconds, tuning };
  const mounted = React.useRef(true);
  const opening = React.useRef(false);
  const cancelled = React.useRef(false);

  const hand = React.useCallback((samples: Float32Array, cut: boolean, s: MicrophoneStream) => {
    latest.current.onTake({
      samples,
      sampleRate: s.sampleRate,
      wav: encodeWav(samples, s.sampleRate),
      seconds: samples.length / s.sampleRate,
      peak: peakDb(samples),
      device: s.device,
      cut,
    });
  }, []);

  const flush = React.useCallback(() => {
    const s = stream.current;
    const taken = segmenter.current?.flush();
    if (s && taken) hand(taken.samples, taken.cut, s);
  }, [hand]);

  const stop = React.useCallback(() => {
    // Stop while the microphone is still opening (the permission prompt is up): it is closed as soon as it opens.
    if (opening.current) {
      cancelled.current = true;
      setState({ phase: "idle" });
      return;
    }
    const s = stream.current;
    if (!s) return;
    flush();
    stream.current = null;
    segmenter.current = null;
    s.close();
    setState({ phase: "idle" });
  }, [flush]);

  const start = React.useCallback(async (): Promise<boolean> => {
    if (stream.current || opening.current) return false;
    opening.current = true;
    cancelled.current = false;
    setState({ phase: "opening" });
    let recent: number[] = [];
    let opened: MicrophoneStream;
    try {
      opened = await device.open((chunk) => {
        const s = stream.current;
        const seg = segmenter.current;
        if (!s || !seg) return; // a chunk posted after close
        recent = [...recent.slice(1 - RECENT_CHUNKS), peakDb(chunk)];
        const quiet = latest.current.paused;
        if (!quiet) for (const taken of seg.push(chunk)) hand(taken.samples, taken.cut, s);
        if (stream.current !== s) return; // onTake stopped the recorder: it stays stopped
        setState({
          phase: "listening",
          level: Math.max(...recent),
          noise: seg.noise,
          speaking: !quiet && seg.speaking,
          seconds: quiet ? 0 : seg.seconds,
          paused: quiet,
        });
      });
    } catch (e) {
      opening.current = false;
      if (cancelled.current) return false; // stopped while opening: nothing to say about a device no one wants now
      setState({ phase: "failed", reason: e instanceof MicrophoneError ? e.message : `The microphone could not be opened (${String(e)}).` });
      return false;
    }
    opening.current = false;
    if (!mounted.current || cancelled.current) {
      opened.close();
      return false;
    }
    const { maxSeconds: max, tuning: t } = latest.current;
    segmenter.current = createSegmenter(opened.sampleRate, { ...t, maxSeconds: max });
    stream.current = opened;
    const quiet = latest.current.paused;
    setState({ phase: "listening", level: LEVEL_FLOOR_DB, noise: null, speaking: false, seconds: 0, paused: quiet });
    return true;
  }, [device, hand]);

  // Pausing hands over what was being said (the speaker stopped, then pressed Pause); resuming starts clean.
  React.useEffect(() => {
    if (paused) flush();
    else segmenter.current?.reset();
    setState((now) => (now.phase === "listening" ? { ...now, paused, speaking: false, seconds: 0 } : now));
  }, [paused, flush]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.close();
      stream.current = null;
      segmenter.current = null;
    };
  }, []);

  return { state, start, stop, listening: state.phase === "listening" || state.phase === "opening" };
}

/** `ListeningLevel`'s props. */
export type ListeningLevelProps = {
  /** The recorder's state while listening. */
  state: Extract<AutoRecorderState, { phase: "listening" }>;
  /** The longest take, said beside a take's running time. */
  maxSeconds: number;
  /** The meter's name. Default "Input level". */
  label?: string;
  className?: string;
};

/** The live level of a microphone that is always open, with what it is doing in words: waiting, hearing a take, or paused. */
export function ListeningLevel({ state, maxSeconds, label = "Input level", className }: ListeningLevelProps) {
  const db = Math.min(0, Math.max(LEVEL_FLOOR_DB, state.level));
  const room = state.noise === null ? "" : `; the room is at ${format.integer(Math.round(state.noise) || 0)} dBFS`;
  const detail = state.paused
    ? `Paused: nothing is kept until you resume${room}`
    : state.speaking
      ? `Hearing you: ${format.runningTime(state.seconds)} of at most ${format.runningTime(maxSeconds)}`
      : `Listening: start speaking to record${room}`;
  return (
    <Meter
      label={label}
      value={db - LEVEL_FLOOR_DB}
      max={-LEVEL_FLOOR_DB}
      thresholds={inputLevelThresholds}
      valueText={`${format.integer(Math.round(db) || 0)} dBFS`}
      detail={detail}
      className={className}
    />
  );
}
