import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkBar, Button, SelectableGrid, format, useSelection, type SelectableGridProps, type TileAspect } from "../src";
import { glazeNames, shelfPhotos, type ShelfPhoto } from "./fixtures/kiln";
import { PiecePicture } from "./fixtures/piece-photo";

// Kiln 2's glaze firing, photographed shelf by shelf as it was unloaded. The bottom shelf ran
// cool, so some pieces came out thin; the member chooses which go back for a second glaze.

const photos = shelfPhotos();
const rowLabel = (p: ShelfPhoto) => `${p.member}, ${p.piece}`;
const uncollected = (p: ShelfPhoto) => !p.collected;

function PieceGrid(props: Partial<Omit<SelectableGridProps<ShelfPhoto>, "aspect" | "naturalAspect">> & { aspect?: TileAspect }) {
  return (
    <SelectableGrid
      label="Pieces from kiln 2, Tuesday's glaze firing"
      rows={photos}
      rowKey={(p) => p.id}
      renderImage={(p) => <PiecePicture photo={p} />}
      detail={(p) => `${p.piece} · ${glazeNames[p.glaze]}`}
      selection={{
        selected: new Set(photos.filter((p) => p.thin && uncollected(p)).map((p) => p.id)),
        onChange: () => undefined,
        rowLabel,
        isSelectable: uncollected,
      }}
      {...props}
    />
  );
}

const meta = { title: "Data/SelectableGrid", component: PieceGrid } satisfies Meta<typeof PieceGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Thin-glazed pieces chosen; collected pieces (gone home) cannot be chosen and are dimmed. "Select all shown" is mixed. */
export const Default: Story = {};

/** Nothing chosen yet. */
export const NoneChosen: Story = {
  args: { selection: { selected: new Set(), onChange: () => undefined, rowLabel, isSelectable: uncollected } },
};

/** Small tiles in a portrait frame, for dense crops. */
export const SmallPortrait: Story = { args: { tileSize: "sm", aspect: "portrait" } };

/** 400 tiles: from 100 only the visible rows of tiles are in the DOM, inside a labelled scroll region. */
export const Virtualised: Story = { args: { rows: shelfPhotos(400), maxHeight: 420 } };

/** At phone width the tiles still fill the row, two or three across. */
export const Phone: Story = { tags: ["visual-phone"], args: { tileSize: "sm" } };

function ChooseThenAct() {
  // The thin-glazed pieces start chosen: `initial` picks each row the first time it appears.
  const selection = useSelection(photos, (p) => p.id, (p) => p.thin && uncollected(p));
  return (
    <div className="grid gap-3">
      <BulkBar count={selection.count} noun="piece" onClear={selection.clear}>
        <Button size="sm" variant="default">
          Book {format.integer.format(selection.count)} for a second glaze
        </Button>
      </BulkBar>
      <PieceGrid selection={{ ...selection, rowLabel, isSelectable: uncollected }} />
    </div>
  );
}

/** With useSelection and a BulkBar. Click a picture to choose it, Shift-click to choose the run from the last one clicked, or Select all shown. The thin pieces start chosen. */
export const WithBulkBar: Story = { render: () => <ChooseThenAct /> };
