import * as React from "react";
import { differences, readPixels, type Difference, type Pixels } from "../lib/image-diff";

// The pixel half of `Compare`'s difference view: loads both pictures' pixels once per pair, and
// recomputes which differ when the tolerance moves. The tolerance is deferred (`useDeferredValue`),
// so dragging its slider stays smooth while a 2048-pixel comparison runs behind it; the marks lag
// by a frame or two and the readout beside the slider says what it is showing. Pixels are not
// asked for until the view is open (`enabled`), since most comparisons never use it.

/** How pictures become pixels. The default draws them on a canvas; supply another where that does not fit (an authenticated request, a picture the browser will not let a page read). */
export type ReadPixels = (src: string) => Promise<Pixels>;

/** The state of a difference: reading the pictures, unable to, or the result. */
export type DifferenceState = { status: "loading" } | { status: "failed" } | { status: "ready"; difference: Difference };

/** The pixels that differ between two pictures at a tolerance (0 to 1), read only while `enabled`. */
export function useDifference(a: string, b: string, tolerance: number, enabled: boolean, read: ReadPixels = readPixels): DifferenceState {
  const [loaded, setLoaded] = React.useState<{ key: string; a: Pixels; b: Pixels } | "failed" | null>(null);
  const key = `${a}|${b}`;
  const reader = React.useRef(read);
  reader.current = read;
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoaded(null);
    Promise.all([reader.current(a), reader.current(b)]).then(
      ([pa, pb]) => !cancelled && setLoaded({ key, a: pa, b: pb }),
      () => !cancelled && setLoaded("failed"),
    );
    return () => {
      cancelled = true;
    };
  }, [a, b, key, enabled]);
  const deferred = React.useDeferredValue(tolerance);
  const difference = React.useMemo(() => (loaded && loaded !== "failed" && loaded.key === key ? differences(loaded.a, loaded.b, deferred) : null), [loaded, key, deferred]);
  if (loaded === "failed") return { status: "failed" };
  return difference ? { status: "ready", difference } : { status: "loading" };
}

/** The marks of a difference drawn over the picture: a canvas that fits its frame the way the picture does (`object-contain`). */
export function DifferenceMarks({ difference }: { difference: Difference }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = difference.width;
    canvas.height = difference.height;
    // createImageData, not `new ImageData`: the same in a browser, and it works where the page has a canvas but no ImageData global (jsdom with @napi-rs/canvas installed).
    const image = ctx.createImageData(difference.width, difference.height);
    image.data.set(difference.marks);
    ctx.putImageData(image, 0, 0);
  }, [difference]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full object-contain" />;
}
