// The numbers behind `Waveform` (strata-react issue #185), with no DOM so they are tested on their
// own. A waveform is drawn from *peaks*: for each slice of the audio, the lowest and highest sample.
// An app that already has them from its server (strata-360's music panel does) passes them; a file
// is reduced to them here. Reducing is done to a fixed number of buckets, in chunks that yield to
// the browser, so a long file reports progress and can be cancelled instead of freezing the page.

/** Peaks as an app has them: a magnitude per slice (0 to 1), or the lowest and highest sample per slice (-1 to 1). */
export type WaveformPeaks = ArrayLike<number> | { min: ArrayLike<number>; max: ArrayLike<number> };

/** Peaks as the lowest and highest sample of each slice. */
export type PeakPair = { min: Float32Array; max: Float32Array };

const isPair = (p: WaveformPeaks): p is { min: ArrayLike<number>; max: ArrayLike<number> } => typeof (p as { min?: unknown }).min === "object";

/** Makes the lowest and highest sample of each slice from either form. A magnitude `m` is the pair `-m` to `m`. */
export function toPeakPair(peaks: WaveformPeaks): PeakPair {
  if (isPair(peaks)) {
    const n = Math.min(peaks.min.length, peaks.max.length);
    const min = new Float32Array(n);
    const max = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      min[i] = Math.min(peaks.min[i], peaks.max[i]);
      max[i] = Math.max(peaks.min[i], peaks.max[i]);
    }
    return { min, max };
  }
  const n = peaks.length;
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = Math.abs(peaks[i]);
    min[i] = -m;
    max[i] = m;
  }
  return { min, max };
}

/** The lowest and highest of `pair` over the fraction `from` to `to` of its length (0 to 1). A slice narrower than one entry takes the entry it falls in, so zooming past the data never leaves a gap. */
export function peaksBetween(pair: PeakPair, from: number, to: number): [number, number] {
  const n = pair.min.length;
  if (n === 0) return [0, 0];
  const a = Math.min(Math.max(from, 0), 1) * n;
  const b = Math.min(Math.max(to, 0), 1) * n;
  const first = Math.min(Math.floor(a), n - 1);
  const last = Math.min(Math.max(Math.ceil(b) - 1, first), n - 1);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = first; i <= last; i++) {
    if (pair.min[i] < lo) lo = pair.min[i];
    if (pair.max[i] > hi) hi = pair.max[i];
  }
  return [lo, hi];
}

/** Resamples peaks to `buckets` entries: each is the lowest and highest of the entries it covers. Any length in, any length out. */
export function resamplePeaks(peaks: WaveformPeaks, buckets: number): PeakPair {
  const pair = toPeakPair(peaks);
  const count = Math.max(Math.floor(buckets), 0);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  for (let i = 0; i < count; i++) [min[i], max[i]] = peaksBetween(pair, i / count, (i + 1) / count);
  return { min, max };
}

/** What a decoded file looks like to this code: the shape of the browser's `AudioBuffer`. */
export type DecodedAudio = { duration: number; numberOfChannels: number; length: number; getChannelData: (channel: number) => ArrayLike<number> };

/**
 * Reduces decoded audio to `buckets` peaks over all channels, in chunks, calling `progress` with
 * the buckets done and awaiting between chunks so the page stays responsive and `signal` can stop it.
 */
export async function peaksFromAudio(audio: DecodedAudio, buckets: number, options: { signal?: AbortSignal; progress?: (done: number, total: number) => void; chunk?: number } = {}): Promise<PeakPair> {
  const { signal, progress, chunk = 256 } = options;
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
  const size = audio.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const from = Math.floor(i * size);
    const to = Math.max(Math.floor((i + 1) * size), from + 1);
    let lo = Infinity;
    let hi = -Infinity;
    for (const data of channels) {
      for (let j = from; j < to && j < data.length; j++) {
        const v = data[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[i] = Number.isFinite(lo) ? lo : 0;
    max[i] = Number.isFinite(hi) ? hi : 0;
    if ((i + 1) % chunk === 0 || i === buckets - 1) {
      progress?.(i + 1, buckets);
      if (signal?.aborted) throw new DOMException("The waveform was cancelled.", "AbortError");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return { min, max };
}

/** The time at the pointer, given the visible range and the width. */
export const timeAt = (px: number, width: number, from: number, to: number) => from + (Math.min(Math.max(px, 0), width) / (width || 1)) * (to - from);

/** Keeps a visible range of `span` seconds inside `0` to `duration`. */
export function clampView(from: number, span: number, duration: number): [number, number] {
  const s = Math.min(Math.max(span, Math.min(duration, 0.05)), duration);
  const a = Math.min(Math.max(from, 0), Math.max(duration - s, 0));
  return [a, a + s];
}
