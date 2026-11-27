import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditListPlayer, type EditClip } from "../src";
import aSrc from "./fixtures/video/a.webm?url";
import bSrc from "./fixtures/video/b.webm?url";

// Issue #397: an edit list (stretches of files) played as one timeline, as strata-reels previews a reel before it is rendered.
// The fixtures are two 2 s, 25 fps clips; the edit cuts between them and back, and the last clip carries straight on in its file.

const clips: EditClip[] = [
  { id: "c1", src: aSrc, start: 0, end: 0.8, label: "Opening" },
  { id: "c2", src: bSrc, start: 0.4, end: 1.2, label: "The other camera" },
  { id: "c3", src: aSrc, start: 1.2, end: 1.6, label: "Back again" },
  { id: "c4", src: aSrc, start: 1.6, end: 2, label: "Carrying on" },
];

const meta = {
  title: "Actions/Edit list player",
  component: EditListPlayer,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="max-w-3xl">{Story()}</div>],
} satisfies Meta<typeof EditListPlayer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Four clips from two files, played with no gap at the cuts; the seek bar has a mark at each clip and the frame steps use the 25 fps rate. A video's first frame differs by decoder, so this one is not a baseline. */
export const Edit: Story = {
  tags: ["no-visual"],
  args: { clips, label: "Preview of the edit", empty: "Nothing to play.", aspect: 4 / 3, fps: 25 },
};

/** An edit with no clips yet: the stage says what to do and the controls are off. */
export const Empty: Story = {
  args: { clips: [], label: "Preview of the reel", empty: "Make a reel to preview it here.", aspect: 4 / 3 },
};
