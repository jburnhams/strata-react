import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Compare, CompareGrid, type Candidate, type CompareMode } from "../src";
import { renderingsLoading } from "./mocks/handlers";

// Two renderings of one shelf photo: the person's own version and a machine's. They differ in the
// glaze's tint, the shelf's tone and a speck on the rim, which is what each view is for finding.
// The pictures come from MSW (`/api/renderings/:variant`), so the stories run the real requests.

const final = { id: "final", label: "Your final", note: "Lightroom", media: { kind: "image", src: "/api/renderings/final.svg", alt: "Celadon bowl, your final", size: [400, 300] } } as const;
const auto = { id: "auto", label: "auto2", note: "14 s", media: { kind: "image", src: "/api/renderings/auto.svg", alt: "Celadon bowl, auto2", size: [400, 300] } } as const;
const blindA = { ...final, label: "A" };
const blindB = { ...auto, label: "B" };

function Stateful(args: React.ComponentProps<typeof Compare>) {
  const [mode, setMode] = React.useState<CompareMode>(args.mode);
  return <Compare {...args} mode={mode} onModeChange={setMode} className="max-w-3xl" />;
}

const meta = {
  title: "Data/Compare",
  component: Compare,
  render: (args) => <Stateful {...args} />,
  args: { label: "Celadon bowl, two versions", a: final, b: auto, blind: false, missing: "Picture not found", mode: "side", onModeChange: () => undefined },
} satisfies Meta<typeof Compare>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Side by side: which do I prefer. Zoom and pan move both pictures together. */
export const SideBySide: Story = {};

/** Swipe: a divider to drag (or move with the arrow keys) shows where the two differ along an edge. */
export const Swipe: Story = { args: { mode: "swipe" } };

/** Fade: one laid over the other at a chosen strength. */
export const Fade: Story = { args: { mode: "fade" } };

/** Blink: one at a time in the same place, flipped with a key: the most sensitive way to see a small change. */
export const Blink: Story = { args: { mode: "blink" } };

/** Difference, brightness: B laid over A with a difference blend, so only what changed is bright; amplify makes faint changes show. The speck on the rim and the shift in the glaze stand out. */
export const Difference: Story = { args: { mode: "difference" } };

/** Difference, changed pixels: pixelmatch marks each pixel that differs by more than the tolerance and says how much of the picture that is. */
export const DifferenceChangedPixels: Story = { args: { mode: "difference", defaultDifference: "pixels" } };

/** Blind: pictures are only "A" and "B"; the variant, note and the caller's alt text are never on the page. */
export const Blind: Story = { args: { blind: true, a: blindA, b: blindB } };

/** Only the views a screen wants: a judging screen might offer side by side and blink and nothing else. */
export const TwoViews: Story = { args: { modes: ["side", "blink"] } };

/** One side did not load: the product's words in its place, and the other side still works. */
export const OneMissing: Story = { args: { b: { ...auto, media: { ...auto.media, src: "/api/renderings/gone.svg" } } } };

/** While the requests are open: skeletons in the final shape, so nothing moves when they land. */
export const Loading: Story = { beforeEach: ({ msw }) => msw.use(renderingsLoading) };

/** On a phone the two sides stack, and the controls wrap. */
/** A height limit: the swipe frame narrows to fit the window's height (here with room for a vote bar), so the pair and the answer are on screen together. */
export const FitsTheScreen: Story = { args: { mode: "swipe", maxHeight: "viewport" }, tags: ["visual-wide"] };

export const Phone: Story = { tags: ["visual-phone"] };

const warm: Candidate = { id: "warm", label: "auto3", note: "11 s", media: { kind: "image", src: "/api/renderings/warm.svg", alt: "Celadon bowl, auto3", size: [400, 300] } };

/** Every candidate for one item at once, one zoom for all of them. What a tile offers beyond looking is the caller's (`actions`). */
export const Grid: StoryObj<typeof CompareGrid> = {
  render: () => (
    <CompareGrid
      label="Three versions of this photo"
      items={[final, auto, warm]}
      blind={false}
      missing="Picture not found"
      actions={(c) => <Button size="sm">{`Compare ${c.label}`}</Button>}
      className="max-w-5xl"
    />
  ),
};

/** Blind grid: tiles are only "A", "B" and "C". */
export const GridBlind: StoryObj<typeof CompareGrid> = {
  render: () => (
    <CompareGrid label="Three versions" items={[{ ...final, label: "A" }, { ...auto, label: "B" }, { ...warm, label: "C" }]} blind missing="Picture not found" className="max-w-5xl" />
  ),
};
