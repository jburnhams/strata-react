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
