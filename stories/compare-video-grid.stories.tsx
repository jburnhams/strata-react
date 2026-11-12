import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompareVideoGrid, type Candidate, type VideoMedia } from "../src";
import aSrc from "./fixtures/video/a.webm?url";
import bSrc from "./fixtures/video/b.webm?url";

// The same two fixture clips (360×270 soft, 720×540 sharp) reused for several cells under different
// ids, standing in for the candidates of a video eval. Fixtures: fixtures/video, VP9, 80 KB together.

const clip = (id: string, label: string, src: string, size: [number, number], note?: string): Candidate<VideoMedia> => ({ id, label, note, media: { kind: "video", src, width: size[0], height: size[1], fps: 25 } });
const source = clip("source", "Source", aSrc, [360, 270], "Original, 360×270");
const items = [
  clip("lanczos", "A", aSrc, [360, 270], "Lanczos"),
  clip("seedvr2", "B", bSrc, [720, 540], "SeedVR2"),
  clip("esrgan", "C", bSrc, [720, 540], "Real-ESRGAN"),
  clip("bicubic", "D", aSrc, [360, 270], "Bicubic"),
];

const meta = {
  title: "Data/CompareVideoGrid",
  component: CompareVideoGrid,
  args: { label: "Four upscales of one clip", items, blind: true, missing: "Video not found", columns: 2 },
  render: (args) => (
    <div className="max-w-4xl">
      <CompareVideoGrid {...args} />
    </div>
  ),
} satisfies Meta<typeof CompareVideoGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every candidate at once on one clock: one transport, one zoom, sound off. */
export const Grid: Story = {};

/** Named, with the source first and drawn nearest-neighbour so its own pixels are seen. */
export const WithReference: Story = { args: { blind: false, reference: source } };

/** With a screen's own action under each candidate. */
export const WithActions: Story = {
  args: { actions: (c) => <button type="button" className="type-caption underline">Compare {c.label} with the source</button> },
};

/** Regions: the same part of every candidate, enlarged, while the videos keep playing. */
export const Regions: Story = {
  args: { regions: [{ id: "timecode", label: "Timecode", box: [0, 0, 120, 90], of: [360, 270] }] },
};
