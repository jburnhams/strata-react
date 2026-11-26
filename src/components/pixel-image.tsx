import * as React from "react";
import { cn } from "../lib/utils";
import { format } from "../lib/format";

// A decoded RGBA buffer drawn at a whole-number zoom with square pixels (issue #359, from the Quake 2
// explorer, whose `Picture.tsx` did all of this by hand). `Thumbnail` and `Lightbox` take a URL; a tool
// that decodes pictures itself (game textures, sprite frames, palette swatches, a generated mask or
// heightmap) holds a width, a height and bytes. Written out each time it is a `<canvas>` filled with
// `putImageData` in an effect, `role="img"`, a zoom that must be a whole number or a 32×32 texture is
// smoothed into mush, `image-rendering: pixelated` as an inline style, and a guard because jsdom has no
// canvas.
//
// - **Square pixels.** The canvas is drawn at the picture's own size and the browser scales it by an
//   integer (`width`/`height` in CSS), with the `image-pixelated` utility; a fractional zoom is
//   rounded, because half a pixel is how pictures get soft. `zoom="fit"` takes the largest whole number
//   that keeps the picture inside `maxSize` (default 512px, never under 1); a picture bigger than that
//   is drawn at 1 and scrolls in its parent, never shrunk by a fraction.
// - **Transparency is shown.** A checkerboard (the muted and sunken roles, so it follows dark mode)
//   sits behind the canvas, so a clear pixel (palette index 255 in a sprite) reads as clear, not as
//   the page's colour. The checks are 8px, a size of their own and not the picture's pixels.
// - **Said in words.** The canvas is an `img` named "<label>, 64 by 64 pixels, shown at 4×", so a screen
//   reader hears what and how big, and the size is in the name when the picture is blank too.
// - **No 2D context, no blank hole.** Where a canvas cannot be drawn on (jsdom, a blocked canvas) the box
//   keeps its size and its name; nothing is thrown.
// - **A buffer of the wrong length** is not drawn and is named so ("no picture data", also written in a
//   dashed box), never half a picture: `rgba.length` must be `width × height × 4`.
// `rgbaToBlob` is the download path: the same pixels as a PNG `Blob`, which `useObjectUrl` turns into a
// link. React Aria has no picture part; the canvas is a native element, as `Waveform` and `PanoramaViewer` are.

type PixelSource =
  | { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray; image?: never }
  | { image: ImageData; width?: never; height?: never; rgba?: never };

/** What `PixelImage` takes: a width, height and RGBA bytes, or an `ImageData`, and how to show it. */
export type PixelImageProps = PixelSource & {
  /** What the picture is, in words: "e1u1/clip.wal". The size and zoom are added to the name. */
  label: string;
  /** A whole number of screen pixels per picture pixel, or `"fit"` for the largest that fits `maxSize`. Default `"fit"`. */
  zoom?: number | "fit";
  /** The most `zoom="fit"` may take, in CSS pixels, each way. Default 512. */
  maxSize?: number;
  className?: string;
};

const sizeOf = (p: PixelSource) =>
  p.image
    ? { width: p.image.width, height: p.image.height, data: p.image.data }
    : { width: p.width, height: p.height, data: p.rgba };

/** The zoom a picture is drawn at: a whole number, at least 1. */
export function pixelZoom(width: number, height: number, zoom: number | "fit" = "fit", maxSize = 512): number {
  if (typeof zoom === "number") return Math.max(1, Math.round(zoom));
  return Math.max(1, Math.floor(maxSize / Math.max(1, width, height)));
}

/** A decoded RGBA picture on a canvas at a whole-number zoom with square pixels, a checkerboard behind clear pixels, named with its size. */
export function PixelImage({ label, zoom = "fit", maxSize = 512, className, ...source }: PixelImageProps) {
  const { width, height, data } = sizeOf(source as PixelSource);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const complete = data.length === width * height * 4 && width > 0 && height > 0;
  const scale = pixelZoom(width, height, zoom, maxSize);

  React.useEffect(() => {
    const el = canvas.current;
    if (!el || !complete) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = el.getContext("2d");
    } catch {
      ctx = null; // a runtime with no canvas: the box keeps its size and its name
    }
    if (!ctx) return;
    const picture = ctx.createImageData(width, height);
    picture.data.set(data);
    ctx.putImageData(picture, 0, 0);
  }, [data, width, height, complete]);

  if (!complete) {
    // Never half a picture: a box of the size it should have been, saying so in words.
    return (
      <span
        role="img"
        aria-label={`${label}, no picture data`}
        className={cn(
          "inline-grid min-h-16 min-w-40 place-items-center rounded-control border border-dashed border-border bg-surface-sunken px-3 type-body-sm text-muted-foreground",
          className,
        )}
      >
        <span aria-hidden>No picture data</span>
      </span>
    );
  }
  const name = `${label}, ${format.integer(width)} by ${format.integer(height)} pixels${scale > 1 ? `, shown at ${scale}×` : ""}`;
  return (
    <span
      className={cn("inline-block w-fit max-w-full overflow-auto rounded-control align-top", className)}
      style={{
        backgroundColor: "var(--surface-sunken)",
        backgroundImage: "conic-gradient(var(--muted) 25%, transparent 0 50%, var(--muted) 0 75%, transparent 0)",
        backgroundSize: "16px 16px",
      }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={name}
        width={width}
        height={height}
        className="image-pixelated block"
        style={{ width: width * scale, height: height * scale }}
      />
    </span>
  );
}

/** The same pixels as a PNG `Blob`, for a download (`useObjectUrl` makes the link). Rejects where there is no canvas. */
export function rgbaToBlob(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("canvas");
    el.width = width;
    el.height = height;
    const ctx = el.getContext("2d");
    if (!ctx) return reject(new Error("This browser cannot draw the picture, so it cannot be saved."));
    const picture = ctx.createImageData(width, height);
    picture.data.set(rgba);
    ctx.putImageData(picture, 0, 0);
    el.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be saved."))), "image/png");
  });
}
