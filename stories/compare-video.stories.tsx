import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompareVideo, EmptyState, PairJudge, Skeleton, type Candidate, type VideoMedia, type VideoMode } from "../src";
import aSrc from "./fixtures/video/a.webm?url";
import bSrc from "./fixtures/video/b.webm?url";

// Two renderings of one two-second test card, 25 fps: A is 360×270 and soft (a quarter of the detail
// scaled back up), B is 720×540 and sharp, so the story also shows candidates of different pixel
// sizes drawn in one box. The files are in fixtures/video (VP9, 80 KB together).

const a: Candidate<VideoMedia> = { id: "lanczos", label: "A", note: "Baseline, 360×270", media: { kind: "video", src: aSrc, width: 360, height: 270, fps: 25 } };
const b: Candidate<VideoMedia> = { id: "seedvr2", label: "B", note: "SeedVR2, 720×540", media: { kind: "video", src: bSrc, width: 720, height: 540, fps: 25 } };

function Stateful(props: React.ComponentProps<typeof CompareVideo>) {
  const [mode, setMode] = React.useState<VideoMode>(props.mode);
  return (
    <div className="max-w-4xl">
      <CompareVideo {...props} mode={mode} onModeChange={setMode} />
    </div>
  );
}

const meta = {
  title: "Data/CompareVideo",
  component: CompareVideo,
  args: { label: "Pair 3 of 12, two upscales of one clip", a, b, blind: true, missing: "Video not found", mode: "side", onModeChange: () => undefined },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof CompareVideo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Side by side on one clock: play, pause, seek and speed drive both; the follower is held within a frame of the first. */
export const SideBySide: Story = {};

/** Swipe: the divider over the moving picture, the view that shows an upscaler's edges best. */
export const Swipe: Story = { args: { mode: "swipe" } };

/** Fade and blink flip between the two on the same frame, playing or paused. */
export const Fade: Story = { args: { mode: "fade" } };
export const Blink: Story = { args: { mode: "blink" } };

/** Not blind: the notes show under the captions. */
export const Named: Story = { args: { blind: false } };

/** With real pixels (nearest-neighbour) at any zoom, for looking at the pixels themselves. */
export const RealPixels: Story = { args: { mode: "swipe", pixelated: "always" } };

/** The app names moments ("fast motion") and holds the loop, so the same two seconds replay for every pair; slow motion goes down to 0.1. */
export const Moments: Story = {
  args: { mode: "swipe", moments: [{ time: 0.6, label: "Fast motion" }, { time: 1.4, label: "Turning face" }], loop: { start: 0.4, end: 1.2 }, onLoopChange: () => undefined },
};

/** As the answering half of a blind pairwise judgment: the same keys and bar as pictures and clips. */
export const Judged: Story = {
  render: () => (
    <div className="max-w-4xl">
      <PairJudge
        pair={{ status: "ready", data: { label: "Pair 3 of 12, two upscales of one clip", a, b } }}
        skeleton={<Skeleton className="h-64 w-full" />}
        empty={<EmptyState title="Nothing left to judge" />}
        onAnswer={() => undefined}
        pending={false}
        progress="12 pairs left"
        view={(slot, pair) => <CompareVideo {...pair} {...slot} blind missing="Video not found" mode="swipe" onModeChange={() => undefined} />}
      />
    </div>
  ),
};
