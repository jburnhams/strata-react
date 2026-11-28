import { describe, expect, it } from "vite-plus/test";
import { INK_COLOURS, differences, dilate, inkMatch, resample, type Pixels } from "../../src/lib/image-diff";

const solid = (width: number, height: number, rgba: [number, number, number, number]): Pixels => ({
  width,
  height,
  data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => rgba[i % 4]),
});
const set = (p: Pixels, x: number, y: number, rgba: [number, number, number, number]) =>
  p.data.set(rgba, (y * p.width + x) * 4);
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
    expect(big.data[12]).toBe(255);
    expect(big.data[(1 * 4 + 1) * 4]).toBe(0);
  });
});

describe("inkMatch", () => {
  const paper = (w = 10, h = 10) => solid(w, h, [240, 235, 225, 255]);
  const ink: [number, number, number, number] = [20, 20, 20, 255];
  const colourAt = (m: ReturnType<typeof inkMatch>, x: number, y: number) => [
    ...m.marks.slice((y * m.width + x) * 4, (y * m.width + x) * 4 + 4),
  ];

  it("agrees fully on a picture and itself, and on two blank pages", () => {
    const a = paper();
    set(a, 2, 2, ink);
    expect(inkMatch(a, a).agreement).toBe(1);
    expect(inkMatch(paper(), paper()).agreement).toBe(1);
    expect(inkMatch(paper(), paper()).inkA).toBe(0);
  });

  it("colours matched ink, ink only in A and ink only in B apart", () => {
    const a = paper();
    const b = paper();
    set(a, 1, 1, ink);
    set(b, 1, 1, ink); // both
    set(a, 8, 1, ink); // only A
    set(b, 1, 8, ink); // only B
    const m = inkMatch(a, b, { near: 0 });
    expect(colourAt(m, 1, 1)).toEqual([...INK_COLOURS.both, 255]);
    expect(colourAt(m, 8, 1)).toEqual([...INK_COLOURS.onlyA, 255]);
    expect(colourAt(m, 1, 8)).toEqual([...INK_COLOURS.onlyB, 255]);
    expect(colourAt(m, 5, 5)[3]).toBe(0);
    expect(m.inkA).toBe(2);
    expect(m.matchedA).toBe(1);
    expect(m.agreement).toBeCloseTo(0.5);
  });

  it("counts ink a pixel or two off as the same ink when `near` allows it", () => {
    const a = paper();
    const b = paper();
    set(a, 4, 4, ink);
    set(b, 5, 5, ink);
    expect(inkMatch(a, b, { near: 0 }).agreement).toBe(0);
    expect(inkMatch(a, b, { near: 1 }).agreement).toBe(1);
  });

  it("brings B to A's size first", () => {
    const a = paper(10, 10);
    const b = paper(20, 20);
    expect(inkMatch(a, b).width).toBe(10);
  });

  it("has no agreement when only one side has ink", () => {
    const a = paper();
    set(a, 3, 3, ink);
    expect(inkMatch(a, paper()).agreement).toBe(0);
  });
});

describe("dilate", () => {
  it("grows a pixel into a square of side 2r+1, clipped at the edges", () => {
    const m = new Uint8Array(25);
    m[0] = 1;
    const d = dilate(m, 5, 5, 1);
    expect([...d].reduce((s, v) => s + v, 0)).toBe(4);
    const c = new Uint8Array(25);
    c[12] = 1;
    expect([...dilate(c, 5, 5, 2)].every((v) => v === 1)).toBe(true);
  });
});
