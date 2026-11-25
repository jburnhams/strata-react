// The geometry behind `BoxOverlay` (issue #237): boxes in a picture's own pixel units, the order a
// person reads them in, and the viewport that zooms to one. No DOM, so the rules are tested without
// a pointer. `Rect` is the same rectangle `RegionEditor` edits (`lib/region.ts`).
import { boxViewport, type ShareBox, type Viewport } from "./viewport";
import type { Rect } from "./region";

/** A box on a picture, in the picture's own pixels. `label` names it for assistive technology and the list beside it. */
export type PictureBox = Rect & { id: string; label: string; tone?: BoxTone };

/** The status role a box is drawn in. `neutral` is the foreground. Outline only, so the type underneath stays readable. */
export type BoxTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * The boxes in reading order: top to bottom in rows, left to right within a row. A box joins the
 * row above when its centre falls inside that row's first box vertically, so lines of text that
 * wobble a few pixels still read in order and two columns read row by row, not column by column.
 * Returns ids, so a caller keeps its own objects.
 */
export function readingOrder(boxes: readonly Rect[] & readonly { id: string }[]): string[] {
  const byTop = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const rows: (typeof byTop)[] = [];
  for (const box of byTop) {
    const row = rows[rows.length - 1];
    const centre = box.y + box.h / 2;
    if (row && centre >= row[0].y && centre <= row[0].y + row[0].h) row.push(box);
    else rows.push([box]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x).map((b) => b.id));
}

/**
 * The viewport that fills a frame with one box of the picture. The picture sits in the frame the way
 * `object-fit: contain` puts it (a frame of another shape leaves bars), which is also how
 * `BoxOverlay` draws it, so the same numbers agree. `margin` is the share of the box added on every
 * side so the box is not touching the frame (default 0.25).
 */
export function zoomToBox(box: Rect, of: { w: number; h: number }, frame: { width: number; height: number }, margin = 0.25): Viewport {
  const s = Math.min(frame.width / of.w, frame.height / of.h);
  const ox = (frame.width - of.w * s) / 2;
  const oy = (frame.height - of.h * s) / 2;
  const mx = box.w * margin;
  const my = box.h * margin;
  const shares: ShareBox = [(ox + (box.x - mx) * s) / frame.width, (oy + (box.y - my) * s) / frame.height, ((box.w + 2 * mx) * s) / frame.width, ((box.h + 2 * my) * s) / frame.height];
  return boxViewport(shares, frame);
}

/** One box of a picture to show on its own, as `Thumbnail`'s `region` takes it: the picture's size, the box in its pixels, and `pad`, how many times the box's size the crop is (default 1.6, a face with its hair and chin). */
export type PictureRegion = { of: { w: number; h: number }; box: Rect; pad?: number };

/**
 * Where the whole picture goes so that one box of it fills a frame of `aspect` (width over height), as
 * percentages of the frame: the crop is the box grown `pad` times about its centre, then widened or
 * heightened to the frame's shape, so the box is never squashed and stays in the middle. A crop that
 * runs past the picture's edge shows the frame's own ground there, as a face at the edge of a photo
 * is shown by a server crop that pads. No canvas and no second request: the browser draws the one
 * picture, which a list of faces from the same photo shares from its cache.
 */
export function regionStyle({ of, box, pad = 1.6 }: PictureRegion, aspect: number): { left: string; top: string; width: string; height: string } {
  let cw = Math.max(box.w * pad, 1);
  let ch = Math.max(box.h * pad, 1);
  if (cw / ch < aspect) cw = ch * aspect;
  else ch = cw / aspect;
  const x0 = box.x + box.w / 2 - cw / 2;
  const y0 = box.y + box.h / 2 - ch / 2;
  const pct = (n: number) => `${+(n * 100).toFixed(4) || 0}%`; // `|| 0`: never "-0%"
  return { left: pct(-x0 / cw), top: pct(-y0 / ch), width: pct(of.w / cw), height: pct(of.h / ch) };
}
