import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
// @ts-expect-error plain ESM script without types
import { compare, decode, encode } from "../../scripts/visual-compare.mjs";

function image(width: number, height: number, paint?: (x: number, y: number) => [number, number, number] | undefined) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = paint?.(x, y) ?? [250, 250, 248];
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  return decode(PNG.sync.write(png));
}

describe("visual compare (pixelmatch)", () => {
  it("passes identical images", () => {
    expect(compare(image(40, 20), image(40, 20)).same).toBe(true);
  });

  it("fails a changed block and returns a diff image", () => {
    const changed = image(40, 20, (x, y) => (x >= 10 && x < 20 && y >= 5 && y < 15 ? [40, 90, 60] : undefined));
    const result = compare(image(40, 20), changed);
    expect(result.same).toBe(false);
    expect(result.diffPixels).toBe(100);
    expect(decode(result.diff).width).toBe(40);
  });

  it("tolerates a few stray pixels", () => {
    const speck = image(40, 20, (x, y) => (x === 3 && y === 3 ? [0, 0, 0] : undefined));
    expect(compare(image(40, 20), speck).same).toBe(true);
  });

  it("treats a size change as a change", () => {
    const result = compare(image(40, 20), image(40, 24));
    expect(result.same).toBe(false);
    expect(result.reason).toBe("size 40×20 → 40×24");
  });

  it("encodes what it decodes", () => {
    const a = image(8, 8);
    expect(compare(a, decode(encode(a))).same).toBe(true);
  });
});
