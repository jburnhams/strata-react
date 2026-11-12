import { describe, expect, it } from "vitest";
import { gainToVolume, loudnessOf, matchGains } from "../../src";

const sine = (amplitude: number, n = 4800) => Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin((2 * Math.PI * 440 * i) / 48000));

describe("loudness", () => {
  it("measures RMS and peak in dB relative to full scale", () => {
    const l = loudnessOf([sine(0.5)]);
    expect(l.peak).toBeCloseTo(-6.02, 1); // 20·log10(0.5)
    expect(l.rms).toBeCloseTo(-9.03, 1); // a sine's RMS is its peak over √2: 3 dB lower
  });

  it("measures all channels together, and silence as minus infinity", () => {
    expect(loudnessOf([sine(0.5), sine(0.5)]).rms).toBeCloseTo(loudnessOf([sine(0.5)]).rms, 1);
    expect(loudnessOf([new Float32Array(10)])).toEqual({ rms: -Infinity, peak: -Infinity });
  });

  it("lowers the louder of two clips to the quieter, and never raises one", () => {
    expect(matchGains({ rms: -20, peak: -10 }, { rms: -23, peak: -9 })).toEqual({ a: -3, b: 0 });
    expect(matchGains({ rms: -23, peak: -10 }, { rms: -20, peak: -9 })).toEqual({ a: 0, b: -3 });
    expect(matchGains({ rms: -20, peak: -10 }, { rms: -Infinity, peak: -Infinity })).toEqual({ a: 0, b: 0 });
  });

  it("turns decibels into a media element's volume, capped at 1", () => {
    expect(gainToVolume(-6.0206)).toBeCloseTo(0.5, 3);
    expect(gainToVolume(0)).toBe(1);
    expect(gainToVolume(6)).toBe(1);
  });
});
