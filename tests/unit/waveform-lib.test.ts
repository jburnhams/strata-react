import { describe, expect, it, vi } from "vitest";
import { clampView, peaksBetween, peaksFromAudio, resamplePeaks, timeAt, toPeakPair } from "../../src/lib/waveform";

// Issue #185: the numbers behind Waveform, with no DOM.

const r2 = (a: ArrayLike<number>) => Array.from(a).map((v) => +v.toFixed(3));

describe("toPeakPair", () => {
  it("makes a magnitude the pair -m to m", () => {
    const p = toPeakPair([0.5, 1, -0.25]);
    expect(Array.from(p.min)).toEqual([-0.5, -1, -0.25]);
    expect(Array.from(p.max)).toEqual([0.5, 1, 0.25]);
  });
  it("orders min and max pairs, and uses the shorter length", () => {
    const p = toPeakPair({ min: [0.2, -0.5, 9], max: [-0.2, 0.5] });
    expect(r2(p.min)).toEqual([-0.2, -0.5]);
    expect(r2(p.max)).toEqual([0.2, 0.5]);
  });
});

describe("resamplePeaks", () => {
  const source = { min: [-0.1, -0.9, -0.2, -0.3], max: [0.1, 0.4, 0.2, 0.8] };
  it("takes the extremes of what each bucket covers", () => {
    const r = resamplePeaks(source, 2);
    expect(Array.from(r.min).map((v) => +v.toFixed(2))).toEqual([-0.9, -0.3]);
    expect(Array.from(r.max).map((v) => +v.toFixed(2))).toEqual([0.4, 0.8]);
  });
  it("keeps the loudest moment when there are fewer buckets, and never leaves a gap when there are more", () => {
    expect(resamplePeaks(source, 1).min[0]).toBeCloseTo(-0.9);
    const up = resamplePeaks(source, 12);
    expect(up.max.length).toBe(12);
    expect(Array.from(up.max).every((v) => v > 0)).toBe(true);
  });
  it("handles nothing", () => {
    expect(resamplePeaks([], 4).max.length).toBe(4);
    expect(resamplePeaks([1], 0).max.length).toBe(0);
  });
});

describe("peaksBetween", () => {
  it("a slice narrower than one entry takes the entry it falls in", () => {
    const pair = toPeakPair([0.1, 0.9, 0.3]);
    expect(r2(peaksBetween(pair, 0.4, 0.41))).toEqual([-0.9, 0.9]);
  });
});

describe("peaksFromAudio", () => {
  const audio = (samples: number[][]) => ({ duration: 1, numberOfChannels: samples.length, length: samples[0].length, getChannelData: (c: number) => samples[c] });
  it("reduces every channel to the buckets and reports progress", async () => {
    const progress = vi.fn();
    const r = await peaksFromAudio(audio([[0, 0.5, -0.5, 0], [0, 0, 0, 0.9]]), 2, { progress, chunk: 1 });
    expect(r2(r.max)).toEqual([0.5, 0.9]);
    expect(Array.from(r.min)).toEqual([0, -0.5]);
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });
  it("stops when cancelled", async () => {
    const ctl = new AbortController();
    const run = peaksFromAudio(audio([new Array(1000).fill(0.1)]), 1000, { signal: ctl.signal, chunk: 10 });
    ctl.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("view maths", () => {
  it("maps a pixel to a time in the visible range", () => {
    expect(timeAt(50, 100, 10, 20)).toBe(15);
    expect(timeAt(-5, 100, 10, 20)).toBe(10);
  });
  it("keeps a view inside the file", () => {
    expect(clampView(95, 10, 100)).toEqual([90, 100]);
    expect(clampView(-3, 10, 100)).toEqual([0, 10]);
    expect(clampView(0, 500, 100)).toEqual([0, 100]);
  });
});
