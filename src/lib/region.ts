// The rectangle maths behind `RegionEditor` (issue #190): moving, resizing, an aspect lock, limits,
// and the in-between rectangle of a two-window move. Plain numbers in the picture's own units, no
// DOM, so the rules are tested without a pointer.

/** A rectangle in the picture's coordinates: top-left corner and size. */
export type Rect = { x: number; y: number; w: number; h: number };
/** Which edge or corner is held: compass points. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
/** Limits on a rectangle. `aspect` is width over height; `min` is the smallest size; `bounds` is where it may be. */
export type RectLimits = { bounds: Rect; min?: { w: number; h: number }; aspect?: number };

export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Moves a rectangle by (dx, dy), stopping at the bounds (it keeps its size). */
export function moveRect(r: Rect, dx: number, dy: number, bounds: Rect): Rect {
  const x = Math.min(Math.max(r.x + dx, bounds.x), bounds.x + bounds.w - r.w);
  const y = Math.min(Math.max(r.y + dy, bounds.y), bounds.y + bounds.h - r.h);
  return { ...r, x, y };
}

/** Puts a rectangle inside the bounds and at least `min` size, keeping its aspect if one is set (shrinking it to fit). */
export function fitRect(r: Rect, { bounds, min, aspect }: RectLimits): Rect {
  let { w, h } = r;
  const mw = min?.w ?? 0;
  const mh = min?.h ?? 0;
  if (aspect) {
    w = Math.max(w, mw, mh * aspect);
    h = w / aspect;
    const scale = Math.min(1, bounds.w / w, bounds.h / h);
    w *= scale;
    h *= scale;
  } else {
    w = Math.min(Math.max(w, mw), bounds.w);
    h = Math.min(Math.max(h, mh), bounds.h);
  }
  return moveRect({ x: r.x, y: r.y, w, h }, 0, 0, bounds);
}

/**
 * Drags `handle` of `r` by (dx, dy). The opposite edge or corner stays where it is. Without an
 * aspect each edge stops at the bounds and at `min` from the edge opposite; with one the rectangle
 * keeps its shape: a corner follows the larger of the two movements, an edge changes its own
 * dimension and the other grows or shrinks about the middle. The result is always inside the bounds.
 */
export function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, { bounds, min, aspect }: RectLimits): Rect {
  const mw = Math.max(min?.w ?? 0, aspect ? (min?.h ?? 0) * aspect : 0, 0);
  const mh = Math.max(min?.h ?? 0, aspect ? mw / aspect : 0, 0);
  const left = r.x;
  const top = r.y;
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  const hasW = handle.includes("w");
  const hasE = handle.includes("e");
  const hasN = handle.includes("n");
  const hasS = handle.includes("s");

  if (!aspect) {
    const nl = hasW ? Math.min(Math.max(left + dx, bounds.x), right - mw) : left;
    const nr = hasE ? Math.max(Math.min(right + dx, bounds.x + bounds.w), left + mw) : right;
    const nt = hasN ? Math.min(Math.max(top + dy, bounds.y), bottom - mh) : top;
    const nb = hasS ? Math.max(Math.min(bottom + dy, bounds.y + bounds.h), top + mh) : bottom;
    return { x: nl, y: nt, w: nr - nl, h: nb - nt };
  }

  const corner = (hasW || hasE) && (hasN || hasS);
  const ax = hasW ? right : left; // the anchor: the corner or edge that stays
  const ay = hasN ? bottom : top;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  // Room: how wide and tall the rectangle can get on this side of its anchor, inside the bounds.
  const roomW = hasW ? ax - bounds.x : hasE ? bounds.x + bounds.w - ax : 2 * Math.min(cx - bounds.x, bounds.x + bounds.w - cx);
  const roomH = hasN ? ay - bounds.y : hasS ? bounds.y + bounds.h - ay : 2 * Math.min(cy - bounds.y, bounds.y + bounds.h - cy);
  let w: number;
  if (corner) {
    const wantW = r.w + (hasW ? -dx : dx);
    const wantH = r.h + (hasN ? -dy : dy);
    w = Math.max(wantW, wantH * aspect);
  } else if (hasW || hasE) {
    w = r.w + (hasW ? -dx : dx);
  } else {
    w = (r.h + (hasN ? -dy : dy)) * aspect;
  }
  w = Math.min(Math.max(w, mw), roomW, roomH * aspect);
  const h = w / aspect;
  return {
    x: hasW ? ax - w : hasE ? ax : cx - w / 2,
    y: hasN ? ay - h : hasS ? ay : cy - h / 2,
    w,
    h,
  };
}

/** A rectangle drawn by dragging from one corner point to another, ordered and fitted to the limits. */
export function drawRect(start: { x: number; y: number }, b: { x: number; y: number }, limits: RectLimits): Rect {
  const { bounds, aspect } = limits;
  // Both ends are held inside the bounds: a drag that starts outside them starts at their edge.
  const a = { x: Math.min(Math.max(start.x, bounds.x), bounds.x + bounds.w), y: Math.min(Math.max(start.y, bounds.y), bounds.y + bounds.h) };
  const px = Math.min(Math.max(b.x, bounds.x), bounds.x + bounds.w);
  const py = Math.min(Math.max(b.y, bounds.y), bounds.y + bounds.h);
  let w = Math.abs(px - a.x);
  let h = Math.abs(py - a.y);
  if (aspect) {
    w = Math.max(w, h * aspect);
    h = w / aspect;
    const roomW = px < a.x ? a.x - bounds.x : bounds.x + bounds.w - a.x;
    const roomH = py < a.y ? a.y - bounds.y : bounds.y + bounds.h - a.y;
    const scale = Math.min(1, roomW / w, roomH / h);
    w *= scale;
    h *= scale;
  }
  return { x: px < a.x ? a.x - w : a.x, y: py < a.y ? a.y - h : a.y, w, h };
}

/** How a move between two rectangles is eased. */
export type Easing = "linear" | "ease-in-out";

/** The eased share of the way at time `t` (0 to 1). */
export function ease(t: number, easing: Easing = "ease-in-out"): number {
  const c = Math.min(Math.max(t, 0), 1);
  return easing === "linear" ? c : c < 0.5 ? 2 * c * c : 1 - (-2 * c + 2) ** 2 / 2;
}

/** The rectangle part-way from `a` to `b` at time `t` (0 to 1), eased. Corner and size move together. */
export function lerpRect(a: Rect, b: Rect, t: number, easing: Easing = "ease-in-out"): Rect {
  const k = ease(t, easing);
  const mix = (p: number, q: number) => p + (q - p) * k;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: mix(a.h, b.h) };
}

/** True when two rectangles are the same to the unit's thousandth. */
export const sameRect = (a: Rect, b: Rect) => ["x", "y", "w", "h"].every((k) => Math.abs(a[k as keyof Rect] - b[k as keyof Rect]) < 0.001);

// --- turning the picture (issue #241) ----------------------------------------------------------
// A scan is often a little crooked, and the page is a crop of it turned by an angle. The convention
// here is the one a browser draws and a server's `rotate(expand=True)` makes: degrees, positive
// clockwise, about the picture's centre, on a canvas grown to the turned picture's bounding box
// (nothing is cut off, and the corners are empty). Windows are in the turned canvas's units, so the
// editor, the server and the app agree on one set of numbers and no one writes this geometry again.

/** The canvas a picture of `size` needs once turned by `angle` degrees: the bounding box of the turned picture. Zero degrees is the picture's own size. */
export function turnedSize(size: readonly [number, number], angle: number): [number, number] {
  const a = (angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  // Rounded off the floating-point dust that a quarter turn would leave (1000.0000000000001).
  const clean = (n: number) => Math.round(n * 1e6) / 1e6;
  return [clean(size[0] * c + size[1] * s), clean(size[0] * s + size[1] * c)];
}

/**
 * Where a window goes when the picture under it is turned from `from` to `to` degrees. The window's
 * centre turns with the picture about the canvas centre, its size stays, and it is held inside the
 * new canvas (shrunk if it no longer fits). `size` is the picture's own, unturned size.
 */
export function turnRect(rect: Rect, size: readonly [number, number], from: number, to: number): Rect {
  const [w0, h0] = turnedSize(size, from);
  const [w1, h1] = turnedSize(size, to);
  const d = ((to - from) * Math.PI) / 180;
  const vx = rect.x + rect.w / 2 - w0 / 2;
  const vy = rect.y + rect.h / 2 - h0 / 2;
  const cx = w1 / 2 + vx * Math.cos(d) - vy * Math.sin(d);
  const cy = h1 / 2 + vx * Math.sin(d) + vy * Math.cos(d);
  const w = Math.min(rect.w, w1);
  const h = Math.min(rect.h, h1);
  return moveRect({ x: cx - w / 2, y: cy - h / 2, w, h }, 0, 0, { x: 0, y: 0, w: w1, h: h1 });
}

/** An angle in degrees brought into -180 to 180 and rounded to a tenth, the step the turn control works in. */
export function normaliseAngle(angle: number): number {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180;
  return Math.round(a * 10) / 10 || 0;
}

// --- a spread: two windows of one scan with a gutter between ------------------------------------

/** One window cut into a left and a right half at `at` (0 to 1 across it, default the middle). */
export function splitRect(r: Rect, at = 0.5): [Rect, Rect] {
  const cut = r.w * Math.min(Math.max(at, 0), 1);
  return [{ ...r, w: cut }, { ...r, x: r.x + cut, w: r.w - cut }];
}

/** The one window that holds both (their union): a spread made one page again. */
export function joinRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** The x of the gutter between two windows: halfway between the left one's right edge and the right one's left edge. */
export const gutterOf = (left: Rect, right: Rect) => (left.x + left.w + right.x) / 2;

/** Moves the gutter by `dx`: the left window's right edge and the right window's left edge both move, so they resize together and the gap between them is kept. Neither shrinks below `min` wide, and neither leaves the bounds. */
export function moveGutter(left: Rect, right: Rect, dx: number, { bounds, min }: RectLimits): [Rect, Rect] {
  const mw = min?.w ?? 0;
  // Right: the right window shrinks, so it may give up all but `min`. Left: the left window shrinks to `min`, and the right one grows left only as far as the bounds.
  const lo = Math.max(mw - left.w, bounds.x - right.x);
  const hi = right.w - mw;
  const d = Math.min(Math.max(dx, lo), Math.max(lo, hi));
  return [{ ...left, w: left.w + d }, { ...right, x: right.x + d, w: right.w - d }];
}
