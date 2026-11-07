// PNG decode and pixelmatch comparison, kept apart from the browser so it is unit tested without
// one. The defaults are the ones every Strata suite uses, so a baseline means the same thing in
// the library and in an app; a config can change them (`VisualConfig.compare`).
//
// Why blur first. Two machines running the same Chromium still rasterise edges a little
// differently (GPU or CPU raster, SIMD paths, a newer Skia): the coverage of an edge pixel moves
// to its neighbour, so plain pixelmatch sees a scatter of differing pixels along every edge and
// glyph. Experiments on Strata's 218 shots (CHANGELOG, 2026-11-07) found that noise reached 159
// pixels at threshold 0.1 under GPU raster, more than one changed letter makes (10 to 50 pixels),
// so no pixel allowance could tell the two apart. Averaging each pixel with its 3×3 neighbours
// before comparing keeps the ink an edge or glyph lays down and drops where exactly it fell: the
// same noise then came to at most 1 pixel, while a changed letter, a weight step, a 1px shift or a
// colour change still differed by tens to thousands. A size change is always a change (the layout
// moved).
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Per-pixel colour distance pixelmatch treats as equal (0–1), measured after the blur. */
export const THRESHOLD = 0.1;
/** Radius in pixels of the box blur applied to both images before comparing (1 is 3×3; 0 turns it off). */
export const BLUR = 1;
/** Differing pixels (after the blur) tolerated before a screenshot counts as changed. */
export const MAX_DIFF_PIXELS = 4;

/** How two screenshots are compared. Every field has the default above. */
export interface CompareOptions {
  /** Per-pixel colour distance treated as equal, 0–1 (pixelmatch's `threshold`). Default {@link THRESHOLD}. */
  threshold?: number;
  /** Box blur radius applied to both images first, absorbing anti-aliasing differences. Default {@link BLUR}. */
  blur?: number;
  /** Differing pixels tolerated. Default {@link MAX_DIFF_PIXELS}. */
  maxDiffPixels?: number;
  /** Count pixels pixelmatch judges to be anti-aliasing as differences too. Default false. */
  includeAA?: boolean;
}

/** A decoded RGBA image. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

/** The result of comparing a screenshot with its baseline. */
export interface CompareResult {
  /** Within tolerance: the screenshot matches. */
  same: boolean;
  /** Every pixel is identical, before any blur or threshold. */
  identical: boolean;
  /** Pixels that differ beyond the threshold after the blur (Infinity when the size changed). */
  diffPixels: number;
  /** One line for a report: what changed. */
  reason: string;
  /** A PNG highlighting the differing pixels in red over the faded baseline, when the images differ in content. */
  diff?: Buffer;
}

/** Decodes a PNG file's bytes. */
export function decode(buffer: Buffer | Uint8Array): Image {
  return PNG.sync.read(Buffer.from(buffer));
}

/** Encodes an RGBA image as PNG bytes. */
export function encode({ width, height, data }: Image): Buffer {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

/** Box-blurs an RGBA image with the given radius (separable, edges averaged over what exists). */
export function boxBlur({ width: w, height: h, data }: Image, radius: number): Uint8Array {
  if (radius <= 0) return data;
  const pass = (src: ArrayLike<number>, horizontal: boolean) => {
    const out = new Float32Array(src.length);
    const [outer, inner] = horizontal ? [h, w] : [w, h];
    for (let o = 0; o < outer; o++) {
      for (let c = 0; c < 4; c++) {
        const at = (i: number) => ((horizontal ? o * w + i : i * w + o) << 2) + c;
        // Running sum over the window, so the cost does not grow with the radius.
        let sum = 0;
        for (let i = 0; i <= Math.min(radius, inner - 1); i++) sum += src[at(i)];
        for (let i = 0; i < inner; i++) {
          const lo = Math.max(0, i - radius);
          const hi = Math.min(inner - 1, i + radius);
          out[at(i)] = sum / (hi - lo + 1);
          if (i + radius + 1 < inner) sum += src[at(i + radius + 1)];
          if (i - radius >= 0) sum -= src[at(i - radius)];
        }
      }
    }
    return out;
  };
  const blurred = pass(pass(data, true), false);
  const out = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i++) out[i] = Math.round(blurred[i]);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
}

/** Compares two decoded PNGs with pixelmatch after a small blur. A size change is always a change. */
export function compare(expected: Image, actual: Image, options: CompareOptions = {}): CompareResult {
  const { threshold = THRESHOLD, blur = BLUR, maxDiffPixels = MAX_DIFF_PIXELS, includeAA = false } = options;
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      same: false,
      identical: false,
      diffPixels: Number.POSITIVE_INFINITY,
      reason: `size ${expected.width}×${expected.height} → ${actual.width}×${actual.height}`,
    };
  }
  const { width, height } = expected;
  if (sameBytes(expected.data, actual.data)) return { same: true, identical: true, diffPixels: 0, reason: "identical" };
  const mask = new Uint8Array(width * height * 4);
  const diffPixels = pixelmatch(boxBlur(expected, blur), boxBlur(actual, blur), mask, width, height, {
    threshold,
    includeAA,
    diffMask: true,
  });
  const same = diffPixels <= maxDiffPixels;
  return {
    same,
    identical: false,
    diffPixels,
    reason: `${diffPixels} pixels differ (${((diffPixels / (width * height)) * 100).toFixed(3)}%)`,
    diff: same ? undefined : diffImage(expected, mask),
  };
}

// The baseline faded to grey, with the pixels that differ (pixelmatch's red mask) on top: the
// mask was computed on blurred images, so it is drawn over the sharp baseline to stay readable.
function diffImage(expected: Image, mask: Uint8Array): Buffer {
  const png = new PNG({ width: expected.width, height: expected.height });
  const d = expected.data;
  for (let i = 0; i < d.length; i += 4) {
    if (mask[i + 3] > 0 && mask[i] === 255 && mask[i + 1] === 0) {
      png.data[i] = 255;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
    } else {
      const grey = 255 + ((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - 255) * 0.1 * d[i + 3]) / 255;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = grey;
    }
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}
