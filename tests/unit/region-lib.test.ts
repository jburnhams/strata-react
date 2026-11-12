import { describe, expect, it } from "vitest";
import { drawRect, ease, lerpRect, moveRect, resizeRect, type Rect } from "../../src";

const bounds: Rect = { x: 0, y: 0, w: 1000, h: 500 };
const r: Rect = { x: 100, y: 100, w: 200, h: 100 };

describe("moveRect", () => {
  it("moves and stops at the bounds, keeping its size", () => {
    expect(moveRect(r, 50, -20, bounds)).toEqual({ x: 150, y: 80, w: 200, h: 100 });
    expect(moveRect(r, 5000, 5000, bounds)).toEqual({ x: 800, y: 400, w: 200, h: 100 });
    expect(moveRect(r, -5000, -5000, bounds)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });
});

describe("resizeRect without an aspect", () => {
  it("keeps the opposite corner still and stops at the bounds", () => {
    expect(resizeRect(r, "se", 50, 30, { bounds })).toEqual({ x: 100, y: 100, w: 250, h: 130 });
    expect(resizeRect(r, "nw", -50, -30, { bounds })).toEqual({ x: 50, y: 70, w: 250, h: 130 });
    expect(resizeRect(r, "se", 5000, 5000, { bounds })).toEqual({ x: 100, y: 100, w: 900, h: 400 });
    expect(resizeRect(r, "nw", -5000, -5000, { bounds })).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });
  it("refuses to go below the minimum or to flip over", () => {
    const min = { w: 40, h: 20 };
    expect(resizeRect(r, "e", -5000, 0, { bounds, min })).toEqual({ x: 100, y: 100, w: 40, h: 100 });
    expect(resizeRect(r, "w", 5000, 0, { bounds, min })).toEqual({ x: 260, y: 100, w: 40, h: 100 });
    expect(resizeRect(r, "s", 0, -5000, { bounds, min })).toEqual({ x: 100, y: 100, w: 200, h: 20 });
  });
  it("an edge changes one dimension only", () => {
    expect(resizeRect(r, "e", 40, 999, { bounds })).toEqual({ x: 100, y: 100, w: 240, h: 100 });
  });
});

describe("resizeRect with an aspect lock", () => {
  const aspect = 2;
  const limits = { bounds, aspect };
  it("a corner keeps the shape and the opposite corner", () => {
    const out = resizeRect(r, "se", 100, 10, limits);
    expect(out.w / out.h).toBeCloseTo(2);
    expect(out).toMatchObject({ x: 100, y: 100, w: 300, h: 150 });
    const nw = resizeRect(r, "nw", -100, -10, limits);
    expect(nw.x + nw.w).toBeCloseTo(300);
    expect(nw.y + nw.h).toBeCloseTo(200);
    expect(nw.w / nw.h).toBeCloseTo(2);
  });
  it("an edge changes its dimension and the other follows about the middle", () => {
    const e = resizeRect(r, "e", 100, 0, limits);
    expect(e).toMatchObject({ x: 100, w: 300, h: 150 });
    expect(e.y).toBeCloseTo(75);
    const s = resizeRect(r, "s", 0, 50, limits);
    expect(s.h).toBeCloseTo(150);
    expect(s.w).toBeCloseTo(300);
    expect(s.x).toBeCloseTo(50);
  });
  it("never leaves the bounds, whichever way it is pushed", () => {
    for (const handle of ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const) {
      for (const [dx, dy] of [[5000, 5000], [-5000, -5000], [5000, -5000], [-5000, 5000]]) {
        const out = resizeRect({ x: 400, y: 200, w: 200, h: 100 }, handle, dx!, dy!, { ...limits, min: { w: 20, h: 10 } });
        expect(out.x).toBeGreaterThanOrEqual(-1e-9);
        expect(out.y).toBeGreaterThanOrEqual(-1e-9);
        expect(out.x + out.w).toBeLessThanOrEqual(1000 + 1e-9);
        expect(out.y + out.h).toBeLessThanOrEqual(500 + 1e-9);
        expect(out.w / out.h).toBeCloseTo(2);
        expect(out.w).toBeGreaterThanOrEqual(20 - 1e-9);
      }
    }
  });
});

describe("drawRect", () => {
  it("orders the corners whichever way it is dragged and clamps to the bounds", () => {
    expect(drawRect({ x: 300, y: 300 }, { x: 100, y: 200 }, { bounds })).toEqual({ x: 100, y: 200, w: 200, h: 100 });
    expect(drawRect({ x: 900, y: 400 }, { x: 5000, y: 5000 }, { bounds })).toEqual({ x: 900, y: 400, w: 100, h: 100 });
  });
  it("keeps the aspect and stays inside", () => {
    const out = drawRect({ x: 900, y: 400 }, { x: 990, y: 410 }, { bounds, aspect: 2 });
    expect(out.w / out.h).toBeCloseTo(2);
    expect(out.x + out.w).toBeLessThanOrEqual(1000);
    expect(out.y + out.h).toBeLessThanOrEqual(500);
  });
});

describe("lerpRect and ease", () => {
  const a: Rect = { x: 0, y: 0, w: 100, h: 50 };
  const b: Rect = { x: 200, y: 100, w: 300, h: 150 };
  it("starts at the first, ends at the second, and is the midpoint at half either way", () => {
    expect(lerpRect(a, b, 0)).toEqual(a);
    expect(lerpRect(a, b, 1)).toEqual(b);
    expect(lerpRect(a, b, 0.5, "linear")).toEqual({ x: 100, y: 50, w: 200, h: 100 });
    expect(lerpRect(a, b, 0.5, "ease-in-out")).toEqual({ x: 100, y: 50, w: 200, h: 100 });
  });
  it("ease-in-out is slower at the ends than linear", () => {
    expect(ease(0.1, "ease-in-out")).toBeLessThan(0.1);
    expect(ease(0.9, "ease-in-out")).toBeGreaterThan(0.9);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });
});
