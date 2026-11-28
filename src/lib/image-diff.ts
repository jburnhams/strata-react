// Which pixels differ between two renderings of one picture, for the difference view of `Compare`.
// pixelmatch does the comparing (it is already a dependency: the visual runner uses it); this file
// is the part around it: getting both pictures to the same size, reading pixels from a picture, and
// telling the person how much of the picture differs. The arithmetic takes plain RGBA buffers, so it
// is unit tested without a canvas; reading pixels needs a browser and is covered by the Storybook
// shots, which run in Chromium.
//
// Why a tolerance rather than "any difference": two JPEGs of one edit differ in almost every
// pixel by a level or two of compression noise, and a person comparing them cares about what they
// can see. pixelmatch's threshold is a colour distance (OKLab, 0 to 1, 1 is black against white);
// the default 0.1 is its own and the one `strata-visual` uses on screenshots. It also ignores
// anti-aliased edge pixels by default, which are the same edge drawn slightly differently, not a
// change in the picture.
//
// Pictures larger than `MAX_SIDE` on their long side are compared at that size: a 24-megapixel
// photo would take seconds on the page's thread, and a difference that vanishes at 2048 pixels is
// not one the person sees in a comparison view. The counts are of the pixels compared, so the share
// printed is the share of the picture either way.
import pixelmatch from "pixelmatch";

/** Decoded pixels: RGBA, 4 bytes each, row by row. */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** The result of comparing two pictures. */
export type Difference = {
  /** RGBA, `width` × `height`: opaque where a pixel differs, transparent elsewhere. */
  marks: Uint8ClampedArray;
  width: number;
  height: number;
  /** Pixels judged different. */
  differing: number;
  /** Pixels compared. */
  total: number;
};

/** The longest side, in pixels, a picture is compared at. */
export const MAX_SIDE = 2048;
/** pixelmatch's own default colour distance below which two pixels are the same. */
export const DEFAULT_TOLERANCE = 0.1;

/** The picture drawn at another size, each new pixel taken from the nearest old one. Used to bring the second picture to the first's size. */
export function resample(p: Pixels, width: number, height: number): Pixels {
  if (p.width === width && p.height === height) return p;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(p.height - 1, Math.floor(((y + 0.5) * p.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(p.width - 1, Math.floor(((x + 0.5) * p.width) / width));
      const from = (sy * p.width + sx) * 4;
      const to = (y * width + x) * 4;
      data[to] = p.data[from];
      data[to + 1] = p.data[from + 1];
      data[to + 2] = p.data[from + 2];
      data[to + 3] = p.data[from + 3];
    }
  }
  return { data, width, height };
}

/**
 * Which pixels differ between two pictures. `b` is resampled to `a`'s size first when they differ,
 * so a re-encoded or resized rendering still lines up. `tolerance` is pixelmatch's `threshold`, 0 to 1.
 */
export function differences(a: Pixels, b: Pixels, tolerance: number = DEFAULT_TOLERANCE): Difference {
  const other = resample(b, a.width, a.height);
  const marks = new Uint8ClampedArray(a.width * a.height * 4);
  const differing = pixelmatch(a.data, other.data, marks, a.width, a.height, {
    threshold: tolerance,
    diffMask: true,
    alpha: 0,
  });
  return { marks, width: a.width, height: a.height, differing, total: a.width * a.height };
}

/** Reads a picture's pixels by drawing it on a canvas, scaled down so its long side is at most `maxSide`. Rejects when the picture cannot be loaded or the browser will not let a page read it (a picture from another site without CORS headers). */
export async function readPixels(src: string, maxSide: number = MAX_SIDE): Promise<Pixels> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot read a picture's pixels.");
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data, width, height };
}

// Ink match, for `Compare`'s "match" view (strata-scan: a scanned page against the same page set again
// in type). A difference of pixels says nothing useful there: the paper's tone, the scan's grain and
// the type's weight differ everywhere while the words sit in the same place. What a person checks is
// whether the ink lines up, so each picture is reduced to its ink (darker than `threshold`, against
// its own paper: a page's ink is dark on light in both) and each ink pixel is looked for in the other
// within `near` pixels, because a re-set line a pixel off is the same line. Matched ink is drawn in
// one colour, ink only in A in a second and ink only in B in a third, as a print proof's
// registration overlay does; the counts give the same F1 the strata-scan quality gate uses.

/** The result of matching two pictures' ink. */
export type InkMatch = {
  /** RGBA, `width` × `height`: matched ink, ink only in A and ink only in B in their colours, transparent elsewhere. */
  marks: Uint8ClampedArray;
  width: number;
  height: number;
  /** Ink pixels of A, and those of them with B's ink near. */
  inkA: number;
  matchedA: number;
  /** Ink pixels of B, and those of them with A's ink near. */
  inkB: number;
  matchedB: number;
  /** How well the inks agree, 0 to 1: the F1 of B's ink against A's. Both without ink is 1. */
  agreement: number;
};

/** The colours of an ink match, as [r, g, b] 0–255. */
export type InkColours = { both: readonly number[]; onlyA: readonly number[]; onlyB: readonly number[] };

/** Where a pixel's brightness (0–255) is below `threshold`. */
function inkOf(p: Pixels, threshold: number): Uint8Array {
  const out = new Uint8Array(p.width * p.height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    // Rec. 709 luma, with a transparent pixel taken as paper.
    const luma = 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
    out[j] = p.data[i + 3] > 127 && luma < threshold ? 1 : 0;
  }
  return out;
}

/** The mask grown by `r` pixels each way (a square), as two passes of a running count so it is linear in the pixels whatever `r` is. */
export function dilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const rows = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let n = 0;
    const o = y * width;
    for (let x = 0; x < Math.min(r, width); x++) n += mask[o + x];
    for (let x = 0; x < width; x++) {
      if (x + r < width) n += mask[o + x + r];
      if (x - r - 1 >= 0) n -= mask[o + x - r - 1];
      rows[o + x] = n > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let n = 0;
    for (let y = 0; y < Math.min(r, height); y++) n += rows[y * width + x];
    for (let y = 0; y < height; y++) {
      if (y + r < height) n += rows[(y + r) * width + x];
      if (y - r - 1 >= 0) n -= rows[(y - r - 1) * width + x];
      out[y * width + x] = n > 0 ? 1 : 0;
    }
  }
  return out;
}

/** Default colours, used where the theme's cannot be read (no canvas): near-black for matched ink, a red and a blue. */
export const INK_COLOURS: InkColours = { both: [40, 40, 40], onlyA: [200, 40, 40], onlyB: [40, 90, 210] };

/**
 * Where two pictures' ink agrees. `b` is resampled to `a`'s size first. `threshold` is the brightness (0–255) below which a pixel is ink;
 * `near` the pixels either way within which the other's ink counts as the same ink.
 */
export function inkMatch(
  a: Pixels,
  b: Pixels,
  {
    threshold = 128,
    near = 1,
    colours = INK_COLOURS,
  }: { threshold?: number; near?: number; colours?: InkColours } = {},
): InkMatch {
  const { width, height } = a;
  const other = resample(b, width, height);
  const ia = inkOf(a, threshold);
  const ib = inkOf(other, threshold);
  const nearA = dilate(ia, width, height, near);
  const nearB = dilate(ib, width, height, near);
  const marks = new Uint8ClampedArray(width * height * 4);
  let inkA = 0,
    matchedA = 0,
    inkB = 0,
    matchedB = 0;
  const put = (j: number, c: readonly number[]) => {
    marks[j * 4] = c[0];
    marks[j * 4 + 1] = c[1];
    marks[j * 4 + 2] = c[2];
    marks[j * 4 + 3] = 255;
  };
  for (let j = 0; j < ia.length; j++) {
    const hitA = ia[j] === 1 && nearB[j] === 1;
    const hitB = ib[j] === 1 && nearA[j] === 1;
    if (ia[j]) {
      inkA++;
      if (hitA) matchedA++;
    }
    if (ib[j]) {
      inkB++;
      if (hitB) matchedB++;
    }
    if (hitA || hitB) put(j, colours.both);
    else if (ia[j]) put(j, colours.onlyA);
    else if (ib[j]) put(j, colours.onlyB);
  }
  let agreement: number;
  if (!inkA && !inkB) agreement = 1;
  else if (!inkA || !inkB) agreement = 0;
  else {
    const p = matchedB / inkB;
    const r = matchedA / inkA;
    agreement = p + r ? (2 * p * r) / (p + r) : 0;
  }
  return { marks, width, height, inkA, matchedA, inkB, matchedB, agreement };
}
