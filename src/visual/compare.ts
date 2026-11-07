// PNG decode and pixelmatch comparison, kept apart from the browser so it is unit tested without
// one. The numbers are the ones every Strata suite uses, so a baseline means the same thing in
// the library and in an app: anti-aliased pixels ignored, a few stray pixels of rasterisation
// noise tolerated, and a size change always a change (the layout moved).
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Per-pixel colour distance pixelmatch treats as equal (0–1). Anti-aliased pixels are ignored. */
export const THRESHOLD = 0.1;
/** Differing pixels tolerated before a screenshot counts as changed: sub-pixel text rasterisation
 *  noise between machines, never a real change (a 1px border on a button is far more). */
export const MAX_DIFF_PIXELS = 20;

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
  /** Pixels that differ beyond the threshold (Infinity when the size changed). */
  diffPixels: number;
  /** One line for a report: what changed. */
  reason: string;
  /** A PNG highlighting the differing pixels, when the images differ in content. */
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

/** Compares two decoded PNGs with pixelmatch. A size change is always a change. */
export function compare(
  expected: Image,
  actual: Image,
  { threshold = THRESHOLD, maxDiffPixels = MAX_DIFF_PIXELS }: { threshold?: number; maxDiffPixels?: number } = {},
): CompareResult {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      same: false,
      diffPixels: Number.POSITIVE_INFINITY,
      reason: `size ${expected.width}×${expected.height} → ${actual.width}×${actual.height}`,
    };
  }
  const { width, height } = expected;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, width, height, { threshold, includeAA: false });
  const same = diffPixels <= maxDiffPixels;
  return {
    same,
    diffPixels,
    reason: `${diffPixels} pixels differ (${((diffPixels / (width * height)) * 100).toFixed(3)}%)`,
    diff: same ? undefined : PNG.sync.write(diff),
  };
}
