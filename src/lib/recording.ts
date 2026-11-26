// Recording speech in the browser, the parts that are arithmetic: joining what a microphone sent, writing it
// as a WAV, and reading its level. Kept apart from the device (lib/microphone.ts) so they are unit tested
// without one.
//
// A take is kept as a lossless master: 16-bit PCM, mono, at the microphone's own rate, nothing resampled or
// compressed. MediaRecorder cannot do that (it writes Opus in WebM, or AAC), and an app that trains or
// measures a voice from its takes (strata-voice) needs the samples as they were.
//
// The level is the sample peak in dB of full scale, the reading that tells a speaker they are about to clip.
// `speechLevel` judges a take's peak in words: speech wants headroom, but not so little level that the noise
// floor comes up with it, so about -30 to -3 dBFS is good and above -1 the take has almost surely clipped.

/** The quietest level a speech meter draws, in dBFS: below it is silence for speech. */
export const LEVEL_FLOOR_DB = -60;

/** Joins chunks of samples into one buffer, in order. */
export function joinSamples(chunks: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** A mono 16-bit PCM WAV of `samples` (-1 to 1; beyond full scale is clipped). */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // the fmt chunk's size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes a frame
  view.setUint16(34, 16, true); // bits a sample
  text(36, "data");
  view.setUint32(40, bytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

/** The highest sample in dBFS, never below `LEVEL_FLOOR_DB` (silence reads as the floor, not minus infinity). */
export function peakDb(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak > 0 ? Math.max(LEVEL_FLOOR_DB, 20 * Math.log10(peak)) : LEVEL_FLOOR_DB;
}

/** How a take's level reads for speech, in words a speaker can act on. */
export type SpeechLevel = { tone: "success" | "warning" | "danger"; word: string; advice: string };

/** Judges a take by its peak (dBFS). */
export function speechLevel(peak: number): SpeechLevel {
  if (peak >= -1)
    return {
      tone: "danger",
      word: "Too loud",
      advice: "It may have clipped. Move back from the microphone or turn its gain down.",
    };
  if (peak < -30)
    return { tone: "warning", word: "Too quiet", advice: "Move closer to the microphone or turn its gain up." };
  return { tone: "success", word: "Good level", advice: "The level suits speech." };
}
