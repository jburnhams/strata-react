// PNG decode and pixelmatch comparison for the visual suite, kept separate so it is unit tested.
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Per-pixel colour distance pixelmatch treats as equal (0–1). Anti-aliased pixels are ignored. */
export const THRESHOLD = 0.1;
/** Differing pixels tolerated before a screenshot counts as changed: sub-pixel text rasterisation
 *  noise between machines, never a real change (a 1px border on a button is far more). */
export const MAX_DIFF_PIXELS = 20;

export function decode(buffer) {
  return PNG.sync.read(buffer);
}

export function encode({ width, height, data }) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

/**
 * Compares two decoded PNGs. A size change is always a change (layout moved). Returns
 * { same, diffPixels, reason, diff } where diff is a PNG buffer highlighting what changed.
 */
export function compare(expected, actual, { threshold = THRESHOLD, maxDiffPixels = MAX_DIFF_PIXELS } = {}) {
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
