import * as React from "react";
import { Button as AriaButton } from "react-aria-components";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { Thumbnail, type AspectRatio } from "./thumbnail";
import { Toolbar } from "./toolbar";

// A row of frames from a stretch of video: a scene, a shot, a clip in a library (from strata-reels'
// scene browser, where each scene of a family tape is shown by the thumbnails the server made every
// ten seconds; strata-360's clip list and strata-vid's library drew the same row by hand). A person
// scanning a long tape recognises a scene by a few pictures from through it far faster than by one
// keyframe or by words, which is why the row exists at all.
//
// - **It fits its width.** As many frames as fit at `frameWidth` (and at least one) are shown,
//   picked evenly from the first to the last, so a three-hour tape's strip and a ten-second shot's
//   strip are both one tidy row, and a resize shows more or fewer without a request. The frames
//   share the width, so the row has no ragged end. Each is a `Thumbnail`, so it has its shape before
//   it loads, a skeleton while it does, the product's words when it cannot, and a request only near
//   the screen (a list of a hundred scenes asks for the strips on screen, not for all of them).
// - **Each frame says its time**, in the corner and in its name ("Frame at 1:20"), because the time
//   is what a person does something with: play from there, cut there.
// - **Pressing a frame seeks** when `onSeek` is given: the frames are then buttons ("Play from 1:20")
//   in a `Toolbar`, React Aria's, so the row is one tab stop with the arrow keys, Home and End inside
//   it, rather than a tab stop per frame. Without `onSeek` it is a named group of pictures and there
//   is nothing to focus.
// - **The frame being watched** is marked when `time` is inside the strip's `span`: a ring (more than
//   colour: it is a thick outline on a picture) and `aria-current="time"`. Outside the span nothing is
//   marked, so a list of scenes marks only the one playing.
// - No hue of its own, nothing animates (a strip is seen many times a day: ux-character.md, character
//   by frequency).
//
// Checked: React Aria has no filmstrip; its `Toolbar` gives the keyboard model and its `Button` the
// press, so nothing here handles keys or pointers itself.

/** One frame: its time in seconds and its picture (`null` when there is none). */
export type FilmFrame = { time: number; src: string | null };

/** The film strip's props. */
export type FilmStripProps = {
  /** Names the strip: "Frames of scene 3". */
  label: string;
  /** The frames, in time order. More than fit are thinned evenly. */
  frames: readonly FilmFrame[];
  /** The stretch the strip stands for, seconds: `time` inside it marks the frame being watched. Default the first frame's time to the last's. */
  span?: readonly [number, number];
  /** The playhead, seconds. */
  time?: number;
  /** A frame was pressed: play from its time. Makes the frames buttons. */
  onSeek?: (time: number) => void;
  /** Width over height of each frame. Default 4/3. */
  aspect?: AspectRatio;
  /** The narrowest a frame is drawn, px: sets how many fit. Default 96. */
  frameWidth?: number;
  /** The words for a frame with no picture. Default "No picture". */
  missing?: string;
  /** The verb of a frame's button. Default "Play from", as "Play from 1:20". */
  seekVerb?: string;
  className?: string;
};

// gap-1, in px.
const GAP = 4;

/** `n` of `items` spread evenly from the first to the last (all of them when there are no more than `n`). */
export function pickEvenly<T>(items: readonly T[], n: number): T[] {
  if (n <= 0) return [];
  if (items.length <= n) return [...items];
  if (n === 1) return [items[Math.floor((items.length - 1) / 2)]];
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

/** The index of the frame showing `time`: the last at or before it, or -1 outside `span`. */
export function frameAt(frames: readonly FilmFrame[], time: number | undefined, span: readonly [number, number]): number {
  if (time === undefined || frames.length === 0 || time < span[0] || time >= span[1]) return -1;
  let found = 0;
  for (let i = 0; i < frames.length; i++) if (frames[i].time <= time) found = i;
  return found;
}

/** A row of frames from a stretch of video that fits its width, each with its time; pressing one seeks when `onSeek` is given, and the frame at `time` is marked. */
export function FilmStrip({ label, frames, span, time, onSeek, aspect = "4/3", frameWidth = 96, missing = "No picture", seekVerb = "Play from", className }: FilmStripProps) {
  const box = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Before the first measure (and where nothing is laid out, as in jsdom) one frame is shown, so the row has its height.
  const fit = Math.max(1, Math.floor((width + GAP) / (frameWidth + GAP)));
  const shown = pickEvenly(frames, fit);
  const stretch = span ?? ([frames[0]?.time ?? 0, frames.length ? frames[frames.length - 1].time + 1e-6 : 0] as const);
  const current = frameAt(shown, time, stretch);

  const picture = (f: FilmFrame, i: number) => (
    <Thumbnail src={f.src} alt={onSeek ? "" : `Frame at ${format.runningTime(f.time)}`} missing={missing} aspect={aspect} className={cn("w-full", i === current && "ring-2 ring-primary ring-offset-1 ring-offset-background")}>
      <span aria-hidden className="absolute bottom-0.5 right-0.5 rounded-control bg-background/80 px-1 type-caption tabular-nums text-foreground">
        {format.runningTime(f.time)}
      </span>
    </Thumbnail>
  );

  return (
    <div ref={box} className={cn("min-w-0", className)}>
      {frames.length === 0 ? (
        <Thumbnail src={null} alt={label} missing={missing} aspect={aspect} className="w-full max-w-24" />
      ) : onSeek ? (
        <Toolbar label={label} className="flex-nowrap gap-1">
          {shown.map((f, i) => (
            <AriaButton
              key={`${f.time}-${i}`}
              aria-label={`${seekVerb} ${format.runningTime(f.time)}`}
              aria-current={i === current ? "time" : undefined}
              onPress={() => onSeek(f.time)}
              className="min-w-0 flex-1 rounded-control outline-offset-2 transition-state press"
            >
              {picture(f, i)}
            </AriaButton>
          ))}
        </Toolbar>
      ) : (
        <div role="group" aria-label={label} className="flex gap-1">
          {shown.map((f, i) => (
            <div key={`${f.time}-${i}`} aria-current={i === current ? "time" : undefined} className="min-w-0 flex-1">
              {picture(f, i)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
