import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilmStrip, Waveform } from "../src";
import { framesFrom } from "./fixtures/frames";

// A row of frames from a stretch of video (from strata-reels' scene browser): as many as fit, picked
// evenly, each with its time; pressing one plays from there, and the frame being watched is marked.

const meta = {
  title: "Data/Film strip",
  component: FilmStrip,
  args: { label: "Frames of scene 3", frames: framesFrom(600, 24), className: "w-full max-w-2xl" },
} satisfies Meta<typeof FilmStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four minutes of thumbnails, one every ten seconds, thinned to what fits the width. Without `onSeek` it is a named group of pictures. */
export const Pictures: Story = {};

/** With `onSeek` the frames are buttons ("Play from 10:40") in one tab stop; the frame at `time` is ringed. */
export const Seeking: Story = {
  render: (args) => {
    const [time, setTime] = React.useState(700);
    return (
      <div className="grid gap-2">
        <FilmStrip {...args} span={[600, 840]} time={time} onSeek={setTime} />
        <p className="type-body-sm text-muted-foreground tabular-nums">Playing from {time} s</p>
      </div>
    );
  },
};

/** A short scene has fewer frames than fit: they share the width, so the row has no ragged end. A frame with no picture says so. */
export const FewFrames: Story = { args: { frames: [...framesFrom(1200, 2), { time: 1220, src: null }] } };

/** A narrow column (a phone) shows fewer frames from the same scene. */
export const Phone: Story = { tags: ["visual-phone"], args: { className: "w-full" } };

/** A stretch with no thumbnails yet (the job that makes them has not run): the product's words. */
export const NoFrames: Story = { args: { frames: [], missing: "No thumbnails yet" } };

// --- Waveform normalise, the other half of the scene browser's quiet tapes.
const quiet = Array.from(
  { length: 600 },
  (_, i) => (Math.abs(Math.sin(i / 7)) * 0.08 + (i % 97 === 0 ? 0.02 : 0)) * (i > 380 && i < 450 ? 0.2 : 1),
);

/** A camcorder's sound peaks at a tenth of full scale: to scale it is a flat line (above); `normalise` scales the drawing until the loud parts fill the height and says by how much (below). */
export const QuietWaveform: StoryObj = {
  render: () => {
    const [time, setTime] = React.useState(40);
    return (
      <div className="grid w-full max-w-2xl gap-4">
        <Waveform label="Waveform of the tape, to scale" duration={120} peaks={quiet} time={time} onSeek={setTime} />
        <Waveform
          label="Waveform of the tape, normalised"
          duration={120}
          peaks={quiet}
          time={time}
          onSeek={setTime}
          normalise
        />
      </div>
    );
  },
};
