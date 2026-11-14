import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { RegionEditor, type EditableRegion, type RegionEditorProps, type Rect } from "../src";
import { bookPages } from "./fixtures/book";
import { shelfPhotos } from "./fixtures/kiln";
import { piecePictureUrl } from "./fixtures/piece-photo";

// Issue #190: one or two windows on a picture. A crop, and a pan from one window to another with
// Watch. The picture is the kiln-shelf photo; its coordinates are 1500 x 1000.

const picture = piecePictureUrl(shelfPhotos()[2]!);
const Picture = () => (
  <>
    <img src={picture} alt="" className="size-full object-cover" />
  </>
);

function Editor(props: Partial<RegionEditorProps> & { initial: EditableRegion[] }) {
  const [regions, setRegions] = React.useState<readonly EditableRegion[]>(props.initial);
  const [preview, setPreview] = React.useState<Rect | null>(null);
  return (
    <div className="max-w-2xl space-y-3">
      <RegionEditor label="Window on the photo" size={[1500, 1000]} regions={regions} onChange={setRegions} defaults={props.initial} onPreview={(r) => setPreview(r)} {...props}>
        <Picture />
      </RegionEditor>
      {preview && <p className="type-caption tabular-nums text-muted-foreground">Preview at {Math.round(preview.x)}, {Math.round(preview.y)}, {Math.round(preview.w)} wide</p>}
    </div>
  );
}

const meta = { title: "Data/RegionEditor", component: Editor, parameters: { layout: "padded" } } satisfies Meta<typeof Editor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A 3:2 crop, locked to its shape. Drag it, pull a handle, or use the arrow keys; the numbers follow. */
export const Crop: Story = { args: { aspect: 3 / 2, initial: [{ id: "crop", label: "Crop", x: 300, y: 200, w: 900, h: 600, tone: "info" }] } };

/** A pan from one window to another: the line joins their centres; Watch plays the move. */
export const PanFromTo: Story = {
  args: {
    mode: "move",
    aspect: 3 / 2,
    initial: [
      { id: "from", label: "From", x: 100, y: 100, w: 600, h: 400, tone: "success" },
      { id: "to", label: "To", x: 800, y: 500, w: 450, h: 300, tone: "danger" },
    ],
  },
};

/** Drawing new windows on the empty picture is on when the app gives `onDraw`. */
export const DrawNew: Story = {
  args: { initial: [] },
  tags: ["no-visual"],
  render: () => {
    const [regions, setRegions] = React.useState<readonly EditableRegion[]>([]);
    return (
      <div className="max-w-2xl">
        <RegionEditor label="Faces" size={[1500, 1000]} regions={regions} onChange={setRegions} onDraw={(r) => setRegions([...regions, { ...r, id: `r${regions.length + 1}`, label: `Face ${regions.length + 1}`, tone: "warning" }])}>
          <Picture />
        </RegionEditor>
      </div>
    );
  },
};

// Issue #241: a scan turned by an angle, and a spread of two windows with a gutter. The picture is
// a page of the scanned book, 1200 by 1800; windows are in the turned canvas's units.
function Turned({ initialAngle = 0, initial }: { initialAngle?: number; initial: EditableRegion[] }) {
  const [angle, setAngle] = React.useState(initialAngle);
  const [regions, setRegions] = React.useState<readonly EditableRegion[]>(initial);
  return (
    <div className="max-w-md">
      <RegionEditor label="Crop of the scan" size={[1200, 1800]} regions={regions} onChange={setRegions} angle={angle} onAngleChange={setAngle} guide>
        <img src={bookPages[6]!.src} alt="" className="size-full object-cover" />
      </RegionEditor>
    </div>
  );
}

/** The scan turned 1.5° in the browser: the page crop turns with it, and the slider, quarter turns and Level are the control. */
export const TurnedScan: StoryObj<typeof Turned> = {
  render: (args) => <Turned {...args} />,
  args: { initialAngle: 1.5, initial: [{ id: "page", label: "Page", x: 200, y: 260, w: 840, h: 1250, tone: "info" }] },
};

function Spread() {
  const [regions, setRegions] = React.useState<readonly EditableRegion[]>([
    { id: "page", label: "Left page", x: 100, y: 120, w: 1000, h: 1200, tone: "success" },
    { id: "page-right", label: "Right page", x: 1100, y: 120, w: 1000, h: 1200, tone: "info" },
  ]);
  return (
    <div className="max-w-2xl">
      <RegionEditor label="Cut of the scan" size={[2400, 1500]} regions={regions} onChange={setRegions} mode="spread" fields={false}>
        <div className="size-full bg-muted" />
      </RegionEditor>
    </div>
  );
}

/** Two windows of one scan: drag the gutter (or use the arrows on it) and both pages resize. Split into two, Make one. */
export const SpreadOfTwo: StoryObj = { render: () => <Spread /> };
