import * as React from "react";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { MicrophoneError, useMicrophone, type Microphone, type MicrophoneStream } from "../lib/microphone";
import { encodeWav, joinSamples, LEVEL_FLOOR_DB, peakDb, speechLevel } from "../lib/recording";
import { Meter, type MeterThreshold } from "./meter";
import { Status } from "./status";

// Recording one take of speech, the parts every recording screen would otherwise write (from
// strata-voice's studio, where they were first hand-built):
// - `useRecorder` opens the microphone, keeps every chunk, stops on request or at `maxSeconds`
//   (the longest take the app's server keeps, so a take is never refused after the speaker has
//   said it), and hands back the take as a lossless WAV (lib/recording.ts). `start` resolves with
//   the take when it stops, so a screen writes `const take = await recorder.start(); if (take) keep(take)`
//   instead of wiring a stop callback. Leaving the screen mid-take closes the microphone (the
//   browser's recording light goes out) and keeps nothing.
// - The live level is the loudest chunk of the last five (~200 ms at the browser's 2048-frame
//   chunks): a peak meter, which is what tells a speaker they are about to clip, held long enough
//   to read. An RMS meter would read 10 dB lower on speech and hide the peaks that clip.
// - `InputLevel` draws it as a `Meter` over `LEVEL_FLOOR_DB`..0 dBFS with one "Too loud" notch at
//   -3 dBFS, the figure in dBFS and how long the take has run against its limit. One threshold, not
//   a green-amber-red ladder: below -3 is fine for a live reading, and "too quiet" is judged on the
//   whole take, since a pause between words is quiet and is not a fault.
// - `TakeLevel` is that judgement once the take ends: a `Status` word, the peak, and what to do
//   (`speechLevel`), so the speaker learns from each take what a calibration step would have told
//   them once.
// Not a React Aria part: none exists for capture, and the controls a screen pairs it with are
// ordinary `Button`s (Record, Stop), so their press, focus and keys come from React Aria already.

/** A finished take: the samples, the same as a WAV, and what was measured. */
export type Recording = {
  samples: Float32Array;
  sampleRate: number;
  /** 16-bit PCM mono WAV of `samples`, ready to upload. */
  wav: Blob;
  seconds: number;
  /** The highest sample in dBFS, never below `LEVEL_FLOOR_DB`. */
  peak: number;
  /** What the browser calls the microphone, or null. */
  device: string | null;
};

/** Where a recorder is: idle, waiting for the browser to open the device, recording, or refused. */
export type RecorderState =
  | { phase: "idle" }
  | { phase: "opening" }
  | { phase: "recording"; seconds: number; level: number }
  | { phase: "failed"; reason: string };

/** `useRecorder`'s options. */
export type UseRecorderOptions = {
  /** The longest take, in seconds: the recorder stops itself there. */
  maxSeconds: number;
  /** The microphone to record from; `useMicrophone()` (the nearest `MicrophoneContext`) when left out. */
  microphone?: Microphone;
};

/** What `useRecorder` returns. */
export type Recorder = {
  state: RecorderState;
  /** Starts a take; resolves with it once it stops (`stop`, or `maxSeconds`), or null when the microphone would not open or a take is already running. */
  start: () => Promise<Recording | null>;
  /** Stops the take, which resolves `start`. Does nothing when nothing is recording. */
  stop: () => void;
  /** True while opening or recording: the moment Record becomes Stop. */
  recording: boolean;
};

const RECENT_CHUNKS = 5;

/** Records one take at a time from the microphone, with its live level, as a lossless WAV. */
export function useRecorder({ maxSeconds, microphone }: UseRecorderOptions): Recorder {
  const fromContext = useMicrophone();
  const device = microphone ?? fromContext;
  const [state, setState] = React.useState<RecorderState>({ phase: "idle" });
  const stream = React.useRef<MicrophoneStream | null>(null);
  const chunks = React.useRef<Float32Array[]>([]);
  const resolveStop = React.useRef<((r: Recording | null) => void) | null>(null);
  const limit = React.useRef(maxSeconds);
  limit.current = maxSeconds;
  // False once the screen has gone: a microphone that finishes opening after that (the permission prompt was
  // still up) is closed at once rather than left recording for nobody.
  const mounted = React.useRef(true);

  const stop = React.useCallback(() => {
    const s = stream.current;
    if (!s) return;
    stream.current = null;
    s.close();
    const samples = joinSamples(chunks.current);
    chunks.current = [];
    setState({ phase: "idle" });
    resolveStop.current?.({
      samples,
      sampleRate: s.sampleRate,
      wav: encodeWav(samples, s.sampleRate),
      seconds: samples.length / s.sampleRate,
      peak: peakDb(samples),
      device: s.device,
    });
    resolveStop.current = null;
  }, []);

  const start = React.useCallback(async (): Promise<Recording | null> => {
    if (stream.current || resolveStop.current) return null;
    setState({ phase: "opening" });
    chunks.current = [];
    let recent: number[] = [];
    let frames = 0;
    const done = new Promise<Recording | null>((resolve) => {
      resolveStop.current = resolve;
    });
    let opened: MicrophoneStream;
    try {
      opened = await device.open((chunk) => {
        const s = stream.current;
        if (!s) return; // a chunk posted after close
        // The last chunk is cut at the limit, so a take is never longer than `maxSeconds` (2048-frame chunks
        // would otherwise overrun a one-second limit by 24 ms at 48 kHz, and the server refuses the take).
        const room = Math.round(limit.current * s.sampleRate) - frames;
        const kept = chunk.length > room ? chunk.subarray(0, Math.max(0, room)) : chunk;
        chunks.current.push(kept);
        frames += kept.length;
        recent = [...recent.slice(1 - RECENT_CHUNKS), peakDb(kept)];
        setState({ phase: "recording", seconds: frames / s.sampleRate, level: Math.max(...recent) });
        if (kept.length < chunk.length || frames >= limit.current * s.sampleRate) stop();
      });
    } catch (e) {
      resolveStop.current = null;
      setState({
        phase: "failed",
        reason: e instanceof MicrophoneError ? e.message : `The microphone could not be opened (${String(e)}).`,
      });
      return null;
    }
    if (!mounted.current) {
      opened.close();
      resolveStop.current = null;
      return null;
    }
    stream.current = opened;
    setState((now) => (now.phase === "opening" ? { phase: "recording", seconds: 0, level: LEVEL_FLOOR_DB } : now));
    return done;
  }, [device, stop]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.close();
      stream.current = null;
    };
  }, []);

  return { state, start, stop, recording: state.phase === "recording" || state.phase === "opening" };
}

/** `InputLevel`'s "Too loud" notch: -3 dBFS on the meter's `LEVEL_FLOOR_DB`..0 scale. */
export const inputLevelThresholds: MeterThreshold[] = [
  { at: (LEVEL_FLOOR_DB + 3) / LEVEL_FLOOR_DB, tone: "danger", label: "Too loud" },
];

/** `InputLevel`'s props. */
export type InputLevelProps = {
  /** The live peak in dBFS (`state.level` while recording). */
  level: number;
  /** How long the take has run. */
  seconds: number;
  /** The longest take, said beside the running time. */
  maxSeconds: number;
  /** The meter's name. Default "Input level". */
  label?: string;
  className?: string;
};

/** The microphone's live level while a take records: a peak meter in dBFS with a "Too loud" notch, and the take's running time. */
export function InputLevel({ level, seconds, maxSeconds, label = "Input level", className }: InputLevelProps) {
  const db = Math.min(0, Math.max(LEVEL_FLOOR_DB, level));
  return (
    <Meter
      label={label}
      value={db - LEVEL_FLOOR_DB}
      max={-LEVEL_FLOOR_DB}
      thresholds={inputLevelThresholds}
      valueText={`${format.integer(Math.round(db) || 0)}\u00a0dBFS`}
      detail={`Recording ${format.runningTime(seconds)} of at most ${format.runningTime(maxSeconds)}`}
      className={className}
    />
  );
}

/** `TakeLevel`'s props. */
export type TakeLevelProps = {
  /** The take's peak in dBFS (`Recording.peak`). */
  peak: number;
  /** What comes before the peak in the sentence, such as "Kept 0:04". */
  lead?: string;
  className?: string;
};

/** How a finished take's level reads for speech: a status word, the peak, and what to do about it. */
export function TakeLevel({ peak, lead, className }: TakeLevelProps) {
  const verdict = speechLevel(peak);
  // Rounded first so a peak of -0.4 reads "0", not "-0".
  const figure = `peak ${format.integer(Math.round(peak) || 0)}\u00a0dBFS`;
  return (
    <p className={cn("flex items-baseline gap-2 type-body-sm", className)}>
      <Status tone={verdict.tone}>{verdict.word}</Status>
      <span className="min-w-0 flex-1">
        {lead ? `${lead}, ${figure}` : figure.charAt(0).toUpperCase() + figure.slice(1)}. {verdict.advice}
      </span>
    </p>
  );
}
