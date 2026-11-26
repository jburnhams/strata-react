import * as React from "react";
import { BoxOverlay, type BoxesState } from "./box-overlay";
import { Thumbnail } from "./thumbnail";
import { ViewportFrame, useViewport } from "./viewport";
import { zoomToBox, type PictureBox } from "../lib/boxes";
import { FIT } from "../lib/viewport";

// A face in its picture (strata-models' face store: every app that shows a face offers "see it in the
// photo"; strata-scan's lines and strata-360's people are the same need). The parts were already
// here (`ViewportFrame`, `BoxOverlay`, `zoomToBox`, `Thumbnail`), and the box-overlay story shows the
// glue; what each app would still write by hand, and get wrong, is the opening: a person who opens a
// face from a grid expects to land on that face, not on the whole photo with a small outline
// somewhere in it. `zoomToBox` needs the frame's size in pixels, which exists only after layout, so
// the zoom waits for the frame to be measured (a layout effect, before paint, so the photo never
// shows fitted first) and runs again whenever the chosen box or the frame's size changes, from the picture or from a
// `BoxList` beside it. `zoom={false}` keeps the photo fitted and only lights the box.
//
// The chosen box is marked by a heavier outline only (`BoxOverlay fillLit={false}`): its subtle fill, right over a line of
// text, would grey out the very face a person opened the photo to see.
//
// The picture is a `Thumbnail` (`fit="contain"`, eager: it is the thing being looked at), so a photo
// that is missing says so in the product's words instead of leaving an empty frame with boxes on it.
// The frame takes the picture's own shape (`of`), so the boxes land on their pixels.

export type BoxedPictureProps = {
  /** Names the frame: "Photo 2026-03-14 09:12". */
  label: string;
  /** The picture; `null` when there is none (the boxes still show, on the `missing` words). */
  src: string | readonly string[] | null;
  /** What the picture shows, or `""` when `label` says it. */
  alt: string;
  /** The words when the picture cannot be shown: "Photo not kept". */
  missing: string;
  /** The picture's size in pixels; the boxes are in these units. */
  of: { w: number; h: number };
  boxes: readonly PictureBox[];
  /** From `useBoxes`, shared with a `BoxList` if there is one; its `active` box is the one opened on. */
  state: BoxesState;
  /** Names the layer of boxes: "Faces in this photo". */
  boxesLabel: string;
  /** Zoom to the chosen box when it is chosen and when the picture opens on one. Default `true`. */
  zoom?: boolean;
  /** How much of the box's size to leave around it when zoomed, on every side. Default 0.75 (a face with its hair, shoulders and something of who is beside it). */
  margin?: number;
  /** The tallest the frame may be, as a CSS length. Default `"70svh"`. */
  maxHeight?: string;
  /** A box was chosen in the picture. */
  onChoose?: (box: PictureBox) => void;
  className?: string;
};

/** A picture with its boxes drawn on it, opened zoomed to the chosen one (a face in its photo): `ViewportFrame` + `BoxOverlay` + `zoomToBox`, with the picture's missing state. Pair it with a `BoxList` through one `useBoxes`. */
export function BoxedPicture({
  label,
  src,
  alt,
  missing,
  of,
  boxes,
  state,
  boxesLabel,
  zoom = true,
  margin = 0.75,
  maxHeight = "70svh",
  onChoose,
  className,
}: BoxedPictureProps) {
  const view = useViewport();
  const frame = React.useRef<HTMLDivElement>(null);
  const { setViewport } = view;
  const box = state.active ? boxes.find((b) => b.id === state.active) : undefined;
  // The frame's size, kept current: `zoomToBox` answers in pixels, so a resized window, a turned phone or a pane that
  // widens must zoom again, and a frame first drawn hidden (size 0) zooms once it is shown.
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
  React.useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((was) =>
        was && was.width === r.width && was.height === r.height ? was : { width: r.width, height: r.height },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useLayoutEffect(() => {
    // Zoom off means fitted, also when it is turned off after opening zoomed.
    if (!zoom) return setViewport(FIT);
    if (box && size && size.width > 0 && size.height > 0) setViewport(zoomToBox(box, of, size, margin));
    // The box's id and place are the inputs; a new array of the same boxes must not zoom again over a person's own panning.
  }, [zoom, box?.id, box?.x, box?.y, box?.w, box?.h, of.w, of.h, margin, size, setViewport]);
  return (
    <ViewportFrame ref={frame} label={label} aspect={of.w / of.h} maxHeight={maxHeight} className={className} {...view}>
      <Thumbnail
        src={src}
        alt={alt}
        missing={missing}
        aspect={of.w / of.h}
        fit="contain"
        eager
        className="size-full rounded-none"
      />
      <BoxOverlay label={boxesLabel} of={of} boxes={boxes} state={state} onChoose={onChoose} fillLit={false} />
    </ViewportFrame>
  );
}
