import { describe, expect, it } from "vitest";
import { drawRect, ease, lerpRect, moveRect, gutterOf, joinRects, moveGutter, normaliseAngle, readingOrder, splitRect, turnRect, turnedSize, resizeRect, zoomToBox, type Rect } from "../../src";

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
  it("starts a drag that began outside the bounds at their edge", () => {
    const inner = { x: 100, y: 100, w: 300, h: 300 };
    expect(drawRect({ x: 0, y: 0 }, { x: 200, y: 200 }, { bounds: inner })).toEqual({ x: 100, y: 100, w: 100, h: 100 });
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

describe("boxes (issue #237)", () => {
  const b = (id: string, x: number, y: number, w = 100, h = 20) => ({ id, x, y, w, h, label: id });
  it("reads rows top to bottom and left to right, tolerating a wobble", () => {
    const boxes = [b("c", 300, 102), b("a", 20, 100), b("d", 20, 140), b("b", 160, 96), b("e", 300, 138)];
    expect(readingOrder(boxes)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("zooms to a box on a picture drawn contained in a frame of another shape", () => {
    // A 1000×500 picture in a 400×400 frame: scale 0.4, 100px bars above and below.
    const v = zoomToBox({ x: 0, y: 0, w: 1000, h: 500 }, { w: 1000, h: 500 }, { width: 400, height: 400 });
    expect(v.scale).toBeCloseTo(1, 0);
    const near = zoomToBox({ x: 400, y: 200, w: 100, h: 50 }, { w: 1000, h: 500 }, { width: 400, height: 400 });
    expect(near.scale).toBeGreaterThan(2);
  });
});

describe("turning and spreads (issue #241)", () => {
  it("makes the canvas a turned picture needs, and leaves a quarter turn as the swapped size", () => {
    expect(turnedSize([1000, 500], 0)).toEqual([1000, 500]);
    expect(turnedSize([1000, 500], 90)).toEqual([500, 1000]);
    const [w, h] = turnedSize([1000, 500], 2);
    expect(w).toBeCloseTo(1000 * Math.cos(Math.PI / 90) + 500 * Math.sin(Math.PI / 90), 3);
    expect(h).toBeGreaterThan(500);
  });
  it("turns a window's centre with the picture and keeps its size, inside the new canvas", () => {
    // The top-left window of a 1000×500 picture turned clockwise: its centre goes to (450, 100) of the 500×1000 canvas, and the window, which keeps its size, is held inside.
    const quarter = turnRect({ x: 0, y: 0, w: 200, h: 100 }, [1000, 500], 0, 90);
    expect(quarter).toMatchObject({ x: expect.closeTo(300, 3), y: expect.closeTo(50, 3), w: 200, h: 100 });
    // A window that stays inside turns there and back again to where it started.
    const small = { x: 100, y: 100, w: 100, h: 50 };
    const there = turnRect(small, [1000, 500], 0, 90);
    expect(there).toMatchObject({ x: expect.closeTo(325, 3), w: 100, h: 50 });
    const back = turnRect(there, [1000, 500], 90, 0);
    expect(back).toMatchObject({ x: expect.closeTo(100, 3), y: expect.closeTo(100, 3), w: 100, h: 50 });
  });
  it("shrinks a window that no longer fits the canvas", () => {
    const r = turnRect({ x: 0, y: 0, w: 1000, h: 500 }, [1000, 500], 0, 90);
    expect(r.w).toBe(500);
  });
  it("brings an angle into range and to a tenth", () => {
    expect(normaliseAngle(190)).toBe(-170);
    expect(normaliseAngle(1.04)).toBe(1);
    expect(normaliseAngle(-180)).toBe(-180);
  });
  it("splits a window down the middle and joins two into their union", () => {
    const [l, r] = splitRect({ x: 10, y: 20, w: 400, h: 300 });
    expect(l).toEqual({ x: 10, y: 20, w: 200, h: 300 });
    expect(r).toEqual({ x: 210, y: 20, w: 200, h: 300 });
    expect(joinRects(l, r)).toEqual({ x: 10, y: 20, w: 400, h: 300 });
  });
  it("moves a gutter so both windows resize, and stops at the minimum", () => {
    const [l, r] = splitRect({ x: 0, y: 0, w: 400, h: 300 });
    const limits = { bounds: { x: 0, y: 0, w: 400, h: 300 }, min: { w: 50, h: 50 } };
    const [l2, r2] = moveGutter(l, r, 60, limits);
    expect([l2.w, r2.x, r2.w]).toEqual([260, 260, 140]);
    expect(gutterOf(l2, r2)).toBe(260);
    const [l3, r3] = moveGutter(l, r, 1000, limits);
    expect(r3.w).toBe(50);
    expect(l3.w + r3.w).toBe(400);
  });
});
