import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Timeline, TimelineZoomControls, noOverlap, useTimelineZoom, type TimelineChange, type TimelineItem, type TimelineLane, type TimelineProps } from "../src";

// Issue #77. Two subjects on one component, because they are one picture: kiln bookings across a
// working day (hours on the axis, no current-time rule) and a media edit (seconds, a current time,
// markers, content in the items). The resting stories are the visual baselines; "Live" runs the
// real rules (snapping, overlap) and needs a pointer or the keyboard.

const kilns: TimelineLane[] = [
  { id: "k1", label: "Kiln 1, electric" },
  { id: "k2", label: "Kiln 2, electric" },
  { id: "k3", label: "Raku kiln" },
];
const bookings: TimelineItem[] = [
  { id: "b1", lane: "k1", start: 8, length: 5.5, label: "Glaze firing, cone 6", kind: "Glaze" },
  { id: "b2", lane: "k1", start: 14, length: 3, label: "Test tiles", kind: "Test" },
  { id: "b3", lane: "k2", start: 9, length: 8, label: "Bisque firing", kind: "Bisque" },
  { id: "b4", lane: "k3", start: 11, length: 2.5, label: "Raku, Ana R.", kind: "Raku" },
];
const clock = (t: number) => `${String(Math.floor(t)).padStart(2, "0")}:${String(Math.round((t % 1) * 60)).padStart(2, "0")}`;

const tracks: TimelineLane[] = [
  { id: "v1", label: "Video 1" },
  { id: "v2", label: "Video 2" },
  { id: "a1", label: "Audio" },
];
const clips: TimelineItem[] = [
  { id: "c1", lane: "v1", start: 2, length: 24, label: "run-02.mp4", kind: "Video" },
  { id: "c2", lane: "v1", start: 28, length: 31, label: "run-03.mp4", kind: "Video" },
  { id: "c3", lane: "v2", start: 8, length: 10, label: "Title card", kind: "Text" },
  { id: "c4", lane: "a1", start: 0, length: 90, label: "ambience.wav", kind: "Audio" },
];

/** A waveform stand-in for the app's own item content, drawn from fixed numbers. */
function Wave({ width }: { width: number }) {
  const bars = Math.min(Math.floor(width / 4), 200);
  return (
    <span aria-hidden className="flex h-full items-center gap-px">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className="w-0.5 shrink-0 bg-muted-foreground" style={{ height: `${20 + ((i * 37) % 60)}%` }} />
      ))}
    </span>
  );
}

function Stage(props: Partial<TimelineProps> & { compact?: boolean; widthClass?: string }) {
  const { compact, widthClass = "w-full max-w-3xl", ...rest } = props;
  const z = useTimelineZoom({ initial: props.zoom ?? 10 });
  return (
    <div data-density={compact ? "compact" : undefined} className={widthClass}>
      <Timeline label="Timeline" lanes={tracks} items={clips} to={90} zoom={props.zoom ?? z.zoom} {...rest} />
    </div>
  );
}

const meta = { title: "Layout/Timeline", component: Stage } satisfies Meta<typeof Stage>;
export default meta;
type Story = StoryObj<typeof meta>;

/** No lanes: the empty content says what to do. */
export const Empty: Story = { args: { lanes: [], items: [], empty: <p className="type-body text-muted-foreground">Add a track to begin editing.</p> } };

/** A schedule: bookings across resources, hours on the axis, no current-time rule. Item kind is a word as well as a stripe. */
export const Schedule: Story = {
  render: () => (
    <div className="w-full max-w-3xl">
      <Timeline label="Kiln bookings" lanes={kilns} items={bookings} from={8} to={18} zoom={72} formatTime={clock} step={0.25} />
    </div>
  ),
};

/** A media edit: a current time with its slider, markers, selection, and the app's own content (a waveform) in an item. */
export const MediaEdit: Story = {
  args: {
    position: 20,
    selectedIds: new Set(["c2"]),
    markers: [
      { id: "m1", time: 12, label: "Take 2" },
      { id: "m2", time: 46, label: "Cut here" },
    ],
    renderItem: (item, { width }) => (item.kind === "Audio" ? <Wave width={width} /> : <span className="flex h-full items-center truncate">{item.label}</span>),
  },
};

/** Zoomed in, the ruler steps down to seconds and tenths; the items keep their positions. */
export const ZoomedIn: Story = { args: { zoom: 60, position: 4.5 } };

/** Zoomed out, labels thin to minutes rather than colliding. */
export const ZoomedOut: Story = { args: { zoom: 4 } };

/** Compact density: lanes follow `--control-h`. */
export const Compact: Story = { args: { compact: true, position: 20 } };

/** Many items: only those near the view are rendered, so 3,000 clips cost what is on screen. */
export const ManyItems: Story = {
  args: {
    lanes: [{ id: "t", label: "Clips" }],
    items: Array.from({ length: 3000 }, (_, i): TimelineItem => ({ id: `i${i}`, lane: "t", start: i * 12, length: 10, label: `Clip ${i + 1}`, kind: i % 2 ? "Video" : "Audio" })),
    to: 36000,
  },
};

/** Phone width: the timeline scrolls sideways inside its own area; the lane names stay put. */
export const Phone: Story = { tags: ["visual-phone"], args: { widthClass: "w-full", position: 20 } };

function LiveStage() {
  const [items, setItems] = React.useState(clips);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [position, setPosition] = React.useState(0);
  const z = useTimelineZoom({ initial: 10 });
  const change = (id: string, c: TimelineChange) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...c } : i)));
  return (
    <div className="grid w-full max-w-3xl gap-2">
      <TimelineZoomControls zoom={{ ...z, fit: () => z.fit(560, 90) }} />
      <Timeline
        label="Edit"
        lanes={tracks}
        items={items}
        to={90}
        zoom={z.zoom}
        onZoomChange={z.setZoom}
        position={position}
        onPositionChange={setPosition}
        markers={[{ id: "m1", time: 12, label: "Take 2" }]}
        selectedIds={new Set(selected)}
        onSelect={setSelected}
        onItemChange={change}
        onDelete={(ids) => setItems((all) => all.filter((i) => !ids.includes(i.id)))}
        validate={noOverlap(items)}
      />
      <p className="type-body-sm text-muted-foreground">Drag a clip (it snaps to edges, the marker and the current time) or an edge. Keys: arrows move, Enter selects, Ctrl+arrows nudge, Alt+arrows trim, +/-/0 zoom.</p>
    </div>
  );
}

/** Live: the real rules. A move that would overlap shows its reason and is not applied. Skipped by the visual suite. */
export const Live: Story = { tags: ["no-visual"], render: () => <LiveStage /> };
