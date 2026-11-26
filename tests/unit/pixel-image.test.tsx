import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { screen } from "@testing-library/react";
import { PixelImage, pixelZoom } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { installFakeGl, type FakeGl } from "../utils/gl";

// Issue #359: a decoded RGBA buffer on a canvas at a whole-number zoom, named with its size.

let gl: FakeGl;
beforeEach(() => void (gl = installFakeGl()));
afterEach(() => gl.uninstall());

const rgba = (w: number, h: number) => new Uint8Array(w * h * 4).fill(255);

describe("pixelZoom", () => {
  it("takes the largest whole number that fits, at least 1, and rounds a number", () => {
    expect(pixelZoom(32, 32, "fit", 512)).toBe(16);
    expect(pixelZoom(100, 40, "fit", 512)).toBe(5);
    expect(pixelZoom(2048, 2048, "fit", 512)).toBe(1);
    expect(pixelZoom(32, 32, 2.6)).toBe(3);
    expect(pixelZoom(32, 32, 0)).toBe(1);
  });
});

describe("PixelImage", () => {
  it("is an image named with its label, size and zoom, drawn at that whole-number size with square pixels", () => {
    renderWithStrata(
      <PixelImage label="e1u1/clip.wal" width={32} height={32} rgba={rgba(32, 32)} zoom={4} />,
    );
    const img = screen.getByRole("img", { name: "e1u1/clip.wal, 32 by 32 pixels, shown at 4×" });
    expect(img).toHaveAttribute("width", "32");
    expect(img).toHaveStyle({ width: "128px", height: "128px" });
    expect(img).toHaveClass("image-pixelated");
    expect(gl.puts.at(-1)).toMatchObject({ width: 32, height: 32 });
  });

  it("fits a small picture inside maxSize by default and says no zoom at 1×", () => {
    renderWithStrata(
      <PixelImage label="Palette" width={16} height={16} rgba={rgba(16, 16)} maxSize={64} />,
    );
    expect(screen.getByRole("img", { name: "Palette, 16 by 16 pixels, shown at 4×" })).toHaveStyle({
      width: "64px",
    });
    renderWithStrata(<PixelImage label="Big" width={1024} height={512} rgba={rgba(1024, 512)} />);
    expect(screen.getByRole("img", { name: "Big, 1,024 by 512 pixels" })).toBeInTheDocument();
  });

  it("takes an ImageData", () => {
    const image = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(2 * 2 * 4).fill(7),
    } as ImageData;
    renderWithStrata(<PixelImage label="Swatch" image={image} zoom={8} />);
    expect(screen.getByRole("img", { name: /Swatch, 2 by 2 pixels, shown at 8×/ })).toHaveStyle({
      width: "16px",
    });
    expect(gl.puts.at(-1)?.data[0]).toBe(7);
  });

  it("does not draw a buffer of the wrong length, and says so", () => {
    renderWithStrata(<PixelImage label="Broken" width={4} height={4} rgba={new Uint8Array(10)} />);
    expect(screen.getByRole("img", { name: "Broken, no picture data" })).toHaveTextContent(
      "No picture data",
    );
    expect(gl.puts).toHaveLength(0);
  });

  it("still renders, named, where there is no 2D context", () => {
    gl.uninstall();
    renderWithStrata(
      <PixelImage label="Texture" width={8} height={8} rgba={rgba(8, 8)} zoom={2} />,
    );
    expect(screen.getByRole("img", { name: /Texture, 8 by 8 pixels/ })).toBeInTheDocument();
  });
});
