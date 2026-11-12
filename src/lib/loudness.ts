// How loud a clip is, for the audio comparison: so the louder of two clips does not win by being
// louder (a few tenths of a dB already shifts preference), the comparison can turn the louder one
// down to match.
//
// The measure is RMS over the whole clip (up to `MAX_SECONDS`) in dB relative to full scale, with
// the sample peak beside it. It is not LUFS (ITU-R BS.1770): no K-weighting, no gating of silence.
// For two renderings of the same sentence that is close enough to match them, and it is honest
// about what it is; a product that needs broadcast loudness measures it on the server and passes
// `measure`. The arithmetic takes plain channel arrays so it is unit tested without a browser;
// decoding needs the Web Audio API and is covered by the Storybook shots in Chromium.

/** A clip's level in dB relative to full scale: its RMS (what the ear follows) and its highest sample. */
export type Loudness = { rms: number; peak: number };

/** The most of a clip that is measured, in seconds. */
export const MAX_SECONDS = 120;

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** The RMS and peak of channel data (-1 to 1), over all channels together. */
export function loudnessOf(channels: readonly Float32Array[]): Loudness {
  let sum = 0;
  let count = 0;
  let peak = 0;
  for (const c of channels)
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
  count = channels.reduce((n, c) => n + c.length, 0);
  return { rms: db(Math.sqrt(count ? sum / count : 0)), peak: db(peak) };
}

/** How much to turn each of two clips down (in dB, zero or less) so they play at the same RMS: the louder is lowered to the quieter. */
export function matchGains(a: Loudness, b: Loudness): { a: number; b: number } {
  if (!Number.isFinite(a.rms) || !Number.isFinite(b.rms)) return { a: 0, b: 0 };
  const diff = a.rms - b.rms;
  return diff > 0 ? { a: -diff, b: 0 } : { a: 0, b: diff };
}

/** dB to a media element's volume (0 to 1). */
export const gainToVolume = (decibels: number) => Math.min(1, Math.max(0, 10 ** (decibels / 20)));

/** Fetches and decodes a clip and measures it. Needs the Web Audio API; reads at most `MAX_SECONDS`. */
export async function measureLoudness(src: string): Promise<Loudness> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not read ${src}: ${response.status}`);
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const frames = Math.min(buffer.length, Math.floor(buffer.sampleRate * MAX_SECONDS));
    return loudnessOf(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).subarray(0, frames)));
  } finally {
    void context.close();
  }
}
