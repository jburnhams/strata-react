// The arithmetic of a shared zoom and pan, kept apart from the DOM so it is unit tested without a
// layout engine (jsdom has none). Used by `ViewportFrame` and so by every comparison view.
//
// Scale is relative to "fit" (1 = the whole picture inside its frame). The offset is in pixels from
// the frame's centre, and the picture's transform origin is that centre, so zooming about a point
// is one line of algebra and a fit picture is always centred.

/** Zoom and pan of a picture inside its frame. `scale` 1 is the picture fitted; `x` and `y` are pixels from the centre. */
export type Viewport = { scale: number; x: number; y: number };

/** The picture fitted in its frame, not panned. */
export const FIT: Viewport = { scale: 1, x: 0, y: 0 };

/** The least zoom: the whole picture fitted. */
export const MIN_SCALE = 1;
/** The most zoom, 32 times the fit. */
export const MAX_SCALE = 32;

/** Keeps the picture from being dragged out of its frame: at most half the extra width or height past each edge. */
export function clampViewport(v: Viewport, frame: { width: number; height: number }): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
  if (scale === MIN_SCALE) return FIT;
  const mx = ((scale - 1) * frame.width) / 2;
  const my = ((scale - 1) * frame.height) / 2;
  return { scale, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
}

/** A new scale with the point under `at` (pixels from the frame's centre) staying under it. */
export function zoomAt(v: Viewport, nextScale: number, at: { x: number; y: number }, frame: { width: number; height: number }): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
  const k = scale / v.scale;
  return clampViewport({ scale, x: at.x - k * (at.x - v.x), y: at.y - k * (at.y - v.y) }, frame);
}

/** The scale at which the picture's own pixels are drawn one to one: its natural width over the width it is fitted at. */
export function actualPixelsScale(naturalWidth: number, fittedWidth: number): number {
  if (!naturalWidth || !fittedWidth) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, naturalWidth / fittedWidth));
}

/** The CSS transform for a viewport. */
export function viewportTransform(v: Viewport): string {
  return `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
}
