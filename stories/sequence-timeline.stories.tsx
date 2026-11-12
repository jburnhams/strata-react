import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { SequenceTimeline, TimelineZoomControls, useTimelineZoom, type CutRoom, type SequenceItem } from "../src";

// Issue #191: a film as windows with no gaps, whose cuts are dragged. The room is the app's: here
// each window has only as much footage as its source file, so a cut stops with a reason.

const start: SequenceItem[] = [
  { id: "w1", label: "Start line", start: 0, end: 5 },
  { id: "w2", label: "First climb", start: 5, end: 12 },
  { id: "w3", label: "Summit", start: 12, end: 16 },
  { id: "w4", label: "Descent", start: 16, end: 24 },
  { id: "w5", label: "Finish", start: 24, end: 30 },
];
// The seconds of footage each window's file holds: a window cannot be longer than it.
const footage = [6, 9, 6, 10, 8];

function Strip({ initial, grid, selected }: { initial: SequenceItem[]; grid?: number | readonly number[]; selected?: string[] }) {
  const [items, setItems] = React.useState(initial);
  const [chosen, setChosen] = React.useState<readonly string[]>(selected ?? []);
  const room = (i: number): CutRoom => {
    const [a, b] = [items[i]!, items[i + 1]!];
    return {
      min: Math.max(a.start + 0.5, b.end - footage[i + 1]!),
      max: Math.min(b.end - 0.5, a.start + footage[i]!),
      minReason: `${b.label} has only ${footage[i + 1]} s of footage, so it cannot start earlier.`,
      maxReason: `${a.label} has only ${footage[i]} s of footage, so it cannot run longer.`,
    };
  };
  const zoom = useTimelineZoom({ initial: 36 });
  return (
    <div className="max-w-5xl space-y-3">
      <TimelineZoomControls zoom={{ ...zoom, fit: () => zoom.fit(900, 30) }} />
      <SequenceTimeline
        label="Film, windows in order"
        items={items}
        zoom={zoom.zoom}
        grid={grid}
        room={room}
        selected={chosen}
        onSelectRange={setChosen}
        onCutChange={(_, __, c) => setItems((cur) => cur.map((w) => (w.id === c.before.id ? c.before : w.id === c.after.id ? c.after : w)))}
      />
    </div>
  );
}

const meta = { title: "Data/SequenceTimeline", component: Strip, parameters: { layout: "padded" } } satisfies Meta<typeof Strip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Half-second beats drawn on the ruler; cuts snap to them. Shift+click a window to choose a run. */
export const BeatGrid: Story = { args: { initial: start, grid: 0.5, selected: ["w2", "w3"] } };

/** No grid: arrows step a tenth of a second, Shift a second. */
export const NoGrid: Story = { args: { initial: start } };
