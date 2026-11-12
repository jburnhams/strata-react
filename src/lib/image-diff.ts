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
