// Cutting takes out of a microphone that is always open (strata-voice's hands-free studio: the speaker reads
// prompt after prompt and clicks nothing). The arithmetic is kept here, apart from the device and React, so it
// is unit tested sample by sample; `useAutoRecorder` (components/auto-recorder.tsx) feeds it the chunks.
//
// An energy detector, not a model: the samples are read in 20 ms frames, each frame's RMS in dBFS is compared
// with the room's own quiet, and speech is a run of frames well above it. That is enough for one speaker close
// to a microphone in a quiet room, which is the only case a recording studio serves, and it needs no download,
// no worker and no dependency. A neural VAD would tell speech from a door closing; here the app's scoring does
// that (a take with the wrong words is asked again), so a false start costs one retry, not a bad dataset.
//
// The choices, each with its reason:
// - The quiet is measured, not set: `noise` follows the quietest frames (down quickly, up at 2.5 dB a second,
//   and never while speech is heard), so a fan or a different microphone needs no calibration step.
// - Onset is `onsetDb` (12 dB) above the quiet, held for 60 ms, so a click or a breath does not start a take;
//   once started a frame counts as speech at 6 dB less (hysteresis), so the quiet end of a word does not
//   end it. `floorDb` (-55 dBFS) is the least a frame must reach whatever the quiet, so digital silence (a
//   muted device, the fake microphone's gaps) does not make every frame "loud".
// - A take ends after `silenceSeconds` (1 s) with no speech: longer than a pause at a comma (0.3 to 0.6 s),
//   shorter than the gap a speaker leaves to read the next prompt.
// - Each take keeps `padSeconds` (0.3 s) before the first speech frame and after the last, so the first
//   consonant's lead-in and the last one's release are not cut (the server crops more finely after).
// - Less than `minSpeechSeconds` (0.3 s) of speech frames is dropped: a cough, a "hm", a chair.
// - At `maxSeconds` the take is cut there and handed over marked `cut`, and nothing more is taken until the
//   speaker has been quiet for `silenceSeconds`, so the rest of a long sentence is not kept as a fragment.

import { LEVEL_FLOOR_DB } from "./recording";

/** How the segmenter tells speech from the room. Every field has a default. */
export type SegmenterOptions = {
  /** dB above the room's quiet that starts a take. Default 12. */
  onsetDb?: number;
  /** The least a frame must reach to count as speech, in dBFS RMS, however quiet the room. Default -55. */
  floorDb?: number;
  /** Quiet that ends a take, in seconds. Default 1. */
  silenceSeconds?: number;
  /** Kept before the first and after the last speech, in seconds. Default 0.3. */
  padSeconds?: number;
  /** Takes with less speech than this are dropped, in seconds. Default 0.3. */
  minSpeechSeconds?: number;
  /** The longest take: it is cut there. Default none. */
  maxSeconds?: number;
};

/** One take cut from the stream. */
export type Segment = {
  samples: Float32Array;
  /** True when the take reached `maxSeconds` and was cut there, mid-speech. */
  cut: boolean;
};

/** A running segmenter: give it every chunk, in order; it hands back each take as it ends. */
export type Segmenter = {
  /** Reads a chunk; returns the takes that ended inside it (usually none, at most a few). */
  push: (chunk: Float32Array) => Segment[];
  /** Ends the take being heard now, if it has enough speech (when listening stops or pauses). */
  flush: () => Segment | null;
  /** Drops the take being heard now, keeping what was learnt about the room. */
  reset: () => void;
  /** The room's quiet, in dBFS RMS, or null before the first frame. */
  readonly noise: number | null;
  /** True while a take is being heard. */
  readonly speaking: boolean;
  /** Seconds of the take being heard so far (from its first kept sample), 0 when none. */
  readonly seconds: number;
};

const FRAME_SECONDS = 0.02;
const ONSET_FRAMES = 3;
const HYSTERESIS_DB = 6;
const RISE_DB_PER_SECOND = 2.5;
const FALL = 0.2; // share of the gap closed each frame when a frame is quieter than the quiet: fast, but one zero frame does not drag it to the floor
const SILENT_DB = -100; // a frame of zeros: below anything real, and finite so the arithmetic holds

/** The RMS of `frame` in dBFS, `SILENT_DB` for zeros. */
export function rmsDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / Math.max(1, frame.length));
  return rms > 0 ? Math.max(SILENT_DB, 20 * Math.log10(rms)) : SILENT_DB;
}

/** A segmenter for a stream at `sampleRate`. */
export function createSegmenter(
  sampleRate: number,
  {
    onsetDb = 12,
    floorDb = -55,
    silenceSeconds = 1,
    padSeconds = 0.3,
    minSpeechSeconds = 0.3,
    maxSeconds,
  }: SegmenterOptions = {},
): Segmenter {
  const frameLength = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const frames = (seconds: number) => Math.max(0, Math.round(seconds / FRAME_SECONDS));
  const padFrames = frames(padSeconds);
  const silenceFrames = Math.max(1, frames(silenceSeconds));
  const minSpeechFrames = frames(minSpeechSeconds);
  const maxSamples = maxSeconds === undefined ? Infinity : Math.floor(maxSeconds * sampleRate);
  const rise = RISE_DB_PER_SECOND * FRAME_SECONDS;

  // A partial frame carried to the next chunk.
  let carry = new Float32Array(frameLength);
  let carried = 0;
  // The last frames heard, for the pad before a take's first speech (and the onset frames themselves).
  const recent: Float32Array[] = [];
  const recentSize = padFrames + ONSET_FRAMES;
  let noise: number | null = null;
  let loudRun = 0;
  // The take being heard: its frames from the first kept one, the index just after its last speech frame, and
  // how many of its frames were speech.
  let take: Float32Array[] | null = null;
  let lastSpeech = 0;
  let speechFrames = 0;
  // After a cut: frames of quiet still needed before another take may start.
  let hush = 0;

  const join = (parts: Float32Array[], length: number) => {
    const out = new Float32Array(length);
    let at = 0;
    for (const p of parts) {
      if (at >= length) break;
      const n = Math.min(p.length, length - at);
      out.set(n < p.length ? p.subarray(0, n) : p, at);
      at += n;
    }
    return out;
  };
  const length = (parts: Float32Array[]) => parts.length * frameLength;

  const end = (): Segment | null => {
    const t = take;
    const spoke = speechFrames;
    take = null;
    speechFrames = 0;
    if (!t || spoke < minSpeechFrames) return null;
    const keep = Math.min(t.length, lastSpeech + padFrames);
    return { samples: join(t, Math.min(keep * frameLength, maxSamples)), cut: false };
  };

  const frame = (f: Float32Array): Segment | null => {
    const db = rmsDb(f);
    const quiet = noise ?? db;
    const on = Math.max(quiet + onsetDb, floorDb);
    const still = Math.max(quiet + onsetDb - HYSTERESIS_DB, floorDb - HYSTERESIS_DB);
    recent.push(f);
    if (recent.length > recentSize) recent.shift();

    if (take) {
      take.push(f);
      if (db >= still) {
        lastSpeech = take.length;
        speechFrames++;
      }
      // Measured to the last speech, not the frames held after it: quiet still being waited out is not part of
      // the take, so a short take near the limit is not cut.
      if (lastSpeech * frameLength >= maxSamples) {
        const t = take;
        take = null;
        speechFrames = 0;
        hush = silenceFrames;
        loudRun = 0;
        return { samples: join(t, maxSamples), cut: true };
      }
      return take.length - lastSpeech >= silenceFrames ? end() : null;
    }

    // Not in a take: learn the room from frames that are not speech, and watch for an onset.
    if (db < on) {
      noise = db < quiet ? quiet + (db - quiet) * FALL : Math.min(db, quiet + rise);
      loudRun = 0;
      if (hush > 0) hush--;
      return null;
    }
    if (hush > 0) {
      hush = silenceFrames; // still speaking after a cut: wait for real quiet
      return null;
    }
    loudRun++;
    if (loudRun < ONSET_FRAMES) return null;
    take = [...recent];
    lastSpeech = take.length;
    speechFrames = ONSET_FRAMES;
    loudRun = 0;
    return null;
  };

  return {
    push(chunk) {
      const out: Segment[] = [];
      let at = 0;
      while (at < chunk.length) {
        const n = Math.min(frameLength - carried, chunk.length - at);
        carry.set(chunk.subarray(at, at + n), carried);
        carried += n;
        at += n;
        if (carried === frameLength) {
          const f = carry;
          carry = new Float32Array(frameLength);
          carried = 0;
          const s = frame(f);
          if (s) out.push(s);
        }
      }
      return out;
    },
    flush() {
      hush = 0;
      return end();
    },
    reset() {
      take = null;
      speechFrames = 0;
      loudRun = 0;
      hush = 0;
      recent.length = 0;
    },
    get noise() {
      return noise === null ? null : Math.max(LEVEL_FLOOR_DB, noise);
    },
    get speaking() {
      return take !== null;
    },
    get seconds() {
      return take ? length(take) / sampleRate : 0;
    },
  };
}
