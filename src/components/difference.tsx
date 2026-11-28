import * as React from "react";
import {
  INK_COLOURS,
  differences,
  inkMatch,
  readPixels,
  type Difference,
  type InkColours,
  type InkMatch,
  type Pixels,
} from "../lib/image-diff";

// The pixel half of `Compare`'s difference view: loads both pictures' pixels once per pair, and
// recomputes which differ when the tolerance moves. The tolerance is deferred (`useDeferredValue`),
// so dragging its slider stays smooth while a 2048-pixel comparison runs behind it; the marks lag
// by a frame or two and the readout beside the slider says what it is showing. Pixels are not
// asked for until the view is open (`enabled`), since most comparisons never use it. The ink match
// (`useInkMatch`, Compare's "match" view) reads the same pair the same way and draws through the same
// `DifferenceMarks`; its colours are the theme's roles, read when the pair arrives.

/** How pictures become pixels. The default draws them on a canvas; supply another where that does not fit (an authenticated request, a picture the browser will not let a page read). */
export type ReadPixels = (src: string) => Promise<Pixels>;

/** The state of a difference: reading the pictures, unable to, or the result. */
export type DifferenceState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; difference: Difference };

/** Both pictures' pixels, read once per pair and only while `enabled`. */
function usePixelPair(a: string, b: string, enabled: boolean, read: ReadPixels) {
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
  if (loaded === "failed") return "failed" as const;
  return loaded && loaded.key === key ? loaded : null;
}

/** The pixels that differ between two pictures at a tolerance (0 to 1), read only while `enabled`. */
export function useDifference(
  a: string,
  b: string,
  tolerance: number,
  enabled: boolean,
  read: ReadPixels = readPixels,
): DifferenceState {
  const pair = usePixelPair(a, b, enabled, read);
  const deferred = React.useDeferredValue(tolerance);
  const difference = React.useMemo(
    () => (pair && pair !== "failed" ? differences(pair.a, pair.b, deferred) : null),
    [pair, deferred],
  );
  if (pair === "failed") return { status: "failed" };
  return difference ? { status: "ready", difference } : { status: "loading" };
}

/** The state of an ink match: reading the pictures, unable to, or the result. */
export type InkMatchState = { status: "loading" } | { status: "failed" } | { status: "ready"; match: InkMatch };

/** The theme's colour for a role (`--color-danger`) as [r, g, b], read by painting it on a 1×1 canvas, so an oklch or a palette's colour comes out right. `fallback` where the page has no canvas (jsdom). */
export function roleColour(role: string, fallback: readonly number[]): readonly number[] {
  if (typeof document === "undefined") return fallback;
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(role).trim();
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!value || !ctx) return fallback;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  } catch {
    // jsdom without a canvas package throws from getContext: the fixed colours do
    return fallback;
  }
}

/** Matched ink in the foreground's colour, A's own in the danger role's and B's in the info role's, read from the theme each time the view opens (light, dark or a palette). */
export function themeInkColours(): InkColours {
  return {
    both: roleColour("--color-foreground", INK_COLOURS.both),
    onlyA: roleColour("--color-danger", INK_COLOURS.onlyA),
    onlyB: roleColour("--color-info", INK_COLOURS.onlyB),
  };
}

/** A count that goes up whenever the page's scheme or palette changes (`ThemeProvider` sets the `class` and `data-palette` of the root element), so colours read from the theme can be read again. */
function useThemeChanges(enabled: boolean): number {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!enabled || typeof MutationObserver === "undefined") return;
    const watch = new MutationObserver(() => setN((x) => x + 1));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette", "style"] });
    return () => watch.disconnect();
  }, [enabled]);
  return n;
}

/** Where two pictures' ink agrees, within `near` pixels, read only while `enabled`. */
export function useInkMatch(
  a: string,
  b: string,
  near: number,
  enabled: boolean,
  read: ReadPixels = readPixels,
): InkMatchState {
  const pair = usePixelPair(a, b, enabled, read);
  const deferred = React.useDeferredValue(near);
  // read when the pair arrives and again whenever the scheme or palette changes, so the marks always
  // agree with the legend and the background, which follow the theme through CSS (Codex on #406)
  const theme = useThemeChanges(enabled);
  const colours = React.useMemo(
    () => (pair && pair !== "failed" ? themeInkColours() : INK_COLOURS),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `theme` is the reason to read the colours again
    [pair, theme],
  );
  const match = React.useMemo(
    () => (pair && pair !== "failed" ? inkMatch(pair.a, pair.b, { near: deferred, colours }) : null),
    [pair, deferred, colours],
  );
  if (pair === "failed") return { status: "failed" };
  return match ? { status: "ready", match } : { status: "loading" };
}

/** The marks of a difference drawn over the picture: a canvas that fits its frame the way the picture does (`object-contain`). */
export function DifferenceMarks({ difference }: { difference: Pick<Difference, "marks" | "width" | "height"> }) {
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
