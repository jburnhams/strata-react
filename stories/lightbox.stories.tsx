import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { BoxOverlay, Button, Lightbox, PropertyList, SelectableGrid, useBoxes, useSelection, format, pageName, type LightboxItem } from "../src";
import { bookPages, pageLines, PAGE_SIZE } from "./fixtures/book";
import { glazeNames, shelfPhotos } from "./fixtures/kiln";
import { PiecePicture, piecePictureUrl } from "./fixtures/piece-photo";

// Issue #189: the viewer between a grid of pictures and the picture itself. The story opens it
// from a SelectableGrid; the resting shot is the lightbox already open on one picture.

const photos = shelfPhotos();
const items: LightboxItem[] = photos.map((p) => ({ id: p.id, src: piecePictureUrl(p), label: `${p.member}, ${p.piece}`, natural: [1500, 1000] }));
const byId = new Map(photos.map((p) => [p.id, p]));

function Gallery({ startOpen = false, start = 0 }: { startOpen?: boolean; start?: number }) {
  const [open, setOpen] = React.useState(startOpen);
  const [index, setIndex] = React.useState(start);
  const [compared, setCompared] = React.useState<readonly string[]>([]);
  const selection = useSelection(photos, (p) => p.id);
  return (
    <div className="space-y-3">
      <SelectableGrid
        label="Pieces from kiln 2"
        rows={photos}
        rowKey={(p) => p.id}
        renderImage={(p) => (
          <button type="button" aria-label={`Open ${p.member}, ${p.piece}`} className="block size-full" onClick={() => { setIndex(photos.indexOf(p)); setOpen(true); }}>
            <PiecePicture photo={p} />
          </button>
        )}
        detail={(p) => `${p.piece} · ${glazeNames[p.glaze]}`}
        selection={{ selected: selection.selected, onChange: selection.onChange, rowLabel: (p) => `${p.member}, ${p.piece}` }}
        tileSize="sm"
      />
      {compared.length > 0 && <p className="type-body-sm">Comparing {compared.map((id) => byId.get(id)?.piece).join(" and ")}</p>}
      <Lightbox
        title="Pieces from kiln 2"
        items={items}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
        missing="This photo could not be loaded."
        ticked={[...selection.selected]}
        onCompare={setCompared}
        details={(item) => {
          const p = byId.get(item.id)!;
          return (
            <PropertyList
              label="Photo details"
              items={[
                { term: "Member", value: p.member },
                { term: "Piece", value: p.piece },
                { term: "Glaze", value: glazeNames[p.glaze] },
                { term: "Glaze thickness", value: p.thin ? "Thin" : "Even" },
                { term: "Collected", value: p.collected ? "Yes" : "Not yet" },
                { term: "Taken", value: format.dateTime("2026-11-10T08:20:00Z") },
              ]}
            />
          );
        }}
      />
    </div>
  );
}

const meta = { title: "Data/Lightbox", component: Gallery, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Gallery>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Open on the third picture, with its details beside it. */
export const Open: Story = { args: { startOpen: true, start: 2 }, tags: ["visual-wide"] };

/** Closed: the grid, whose tiles open it. Focus returns to the tile on close. */
export const FromGrid: Story = { tags: ["no-visual"] };

// Issue #239: a book's pages. The position has two names, the item has its own actions, an overlay
// of the reader's lines zooms with the page, and a strip along the bottom jumps through the set.
function BookPages() {
  const [open, setOpen] = React.useState(true);
  const [index, setIndex] = React.useState(5);
  const state = useBoxes();
  const pages: LightboxItem[] = bookPages.map((p) => ({ id: p.id, src: p.src, thumb: p.thumb, label: p.label, natural: p.natural, position: pageName(p) }));
  return (
    <>
      <p className="type-body-sm text-muted-foreground">The book opens in the viewer.</p>
      <Lightbox
      title="Pages of the Punch book"
      items={pages}
      index={index}
      onIndexChange={setIndex}
      open={open}
      onOpenChange={setOpen}
      missing="This page could not be loaded."
      aspect={2 / 3}
      strip
      actions={(item) => <Button size="sm" variant="outline">Edit {item.position}</Button>}
      overlay={(item) => <BoxOverlay label="Lines the reader found" of={{ w: PAGE_SIZE[0], h: PAGE_SIZE[1] }} boxes={pageLines(Number(item.id.replace("scan-", "")))} state={state} />}
      />
    </>
  );
}

/** A page of a scanned book: "Page 6 (iv) of 12", its own Edit action, the lines drawn over it, and a strip of the other pages. */
export const BookPage: StoryObj = { render: () => <BookPages />, tags: ["visual-wide"] };
