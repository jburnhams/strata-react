import { describe, expect, it } from "vitest";
import { differences, resample, type Pixels } from "../../src/lib/image-diff";

const solid = (width: number, height: number, rgba: [number, number, number, number]): Pixels => ({
  width,
  height,
  data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => rgba[i % 4]),
});
const set = (p: Pixels, x: number, y: number, rgba: [number, number, number, number]) => p.data.set(rgba, (y * p.width + x) * 4);
const markAt = (d: ReturnType<typeof differences>, x: number, y: number) => d.marks[(y * d.width + x) * 4 + 3];

describe("differences", () => {
  it("finds no difference between a picture and itself", () => {
    const p = solid(8, 8, [120, 130, 140, 255]);
    const d = differences(p, p);
    expect(d.differing).toBe(0);
    expect(d.total).toBe(64);
    expect([...d.marks].every((v) => v === 0)).toBe(true);
  });

  it("marks exactly the pixels that changed, and leaves the rest transparent", () => {
    const a = solid(10, 10, [200, 200, 200, 255]);
    const b = solid(10, 10, [200, 200, 200, 255]);
    set(b, 3, 4, [0, 0, 0, 255]);
    set(b, 7, 7, [0, 0, 0, 255]);
    const d = differences(a, b);
    expect(d.differing).toBe(2);
    expect(markAt(d, 3, 4)).toBe(255);
    expect(markAt(d, 7, 7)).toBe(255);
    expect(markAt(d, 0, 0)).toBe(0);
  });

  it("ignores a change smaller than the tolerance and counts it when the tolerance is tightened", () => {
    const a = solid(6, 6, [100, 100, 100, 255]);
    const b = solid(6, 6, [104, 100, 100, 255]); // a few levels of compression noise
    expect(differences(a, b).differing).toBe(0);
    expect(differences(a, b, 0.001).differing).toBe(36);
  });

  it("lines up a second picture of another size with the first before comparing", () => {
    const a = solid(8, 8, [10, 200, 10, 255]);
    const b = solid(2, 2, [10, 200, 10, 255]); // the same picture at a quarter of the size
    const d = differences(a, b);
    expect(d.width).toBe(8);
    expect(d.height).toBe(8);
    expect(d.differing).toBe(0);
    const c = solid(2, 2, [200, 10, 10, 255]);
    expect(differences(a, c).differing).toBe(64);
  });
});

describe("resample", () => {
  it("takes each new pixel from the nearest old one and leaves a same-size picture alone", () => {
    const p = solid(2, 1, [0, 0, 0, 255]);
    set(p, 1, 0, [255, 255, 255, 255]);
    expect(resample(p, 2, 1)).toBe(p);
    const big = resample(p, 4, 2);
    expect([...big.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect(big.data[(0 * 4 + 3) * 4]).toBe(255);
    expect(big.data[(1 * 4 + 1) * 4]).toBe(0);
  });
});
