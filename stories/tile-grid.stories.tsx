import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataView, EmptyState, Status, Thumbnail, TileGrid, TileGridSkeleton, type Load } from "../src";
import { bookPages, needsLook } from "./fixtures/book";

// Issue #240: a grid of picture tiles that each open something, with a caption, a detail line and a
// corner badge. A book's pages from the scan screen; a press goes to the page's route.

type Tile = (typeof bookPages)[number];
const detail = (p: Tile) => (needsLook.has(p.id) ? "The page finder was unsure" : `${120 + Number(p.scan) * 17} words`);
const name = (p: Tile) => `Page ${p.scan}${p.printed ? `, ${p.printed}` : ""}, ${detail(p)}`;

function Pages({ items = bookPages }: { items?: Tile[] }) {
  return (
    <TileGrid
      label="Pages of the Punch book"
      items={items}
      itemKey={(p) => p.id}
      itemLabel={name}
      renderImage={(p) => <Thumbnail src={p.src} alt="" aspect={2 / 3} eager missing="No picture" />}
      caption={(p) => `Page ${p.scan}${p.printed ? `, ${p.printed}` : ""}`}
      detail={detail}
      badge={(p) => (needsLook.has(p.id) ? <Status tone="warning">Look</Status> : null)}
      href={(p) => `/books/1/pages/${p.scan}`}
      aspect="portrait"
      tileSize="md"
    />
  );
}

const meta = { title: "Data/TileGrid", component: Pages, parameters: { layout: "padded" } } satisfies Meta<typeof Pages>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Each tile is a link to its page, named by one sentence; the arrow keys move across and down. */
export const Book: Story = {};

/** While the pages load: the same grid of picture boxes, so nothing moves. */
export const Loading: Story = {
  render: () => <TileGridSkeleton count={8} aspect="portrait" />,
};

/** With `DataView`, a book with no pages says what to do next. */
export const Empty: Story = {
  render: () => {
    const state: Load<Tile[]> = { status: "ready", data: [] };
    return (
      <DataView state={state} isEmpty={(r) => r.length === 0} skeleton={<TileGridSkeleton aspect="portrait" />} empty={<EmptyState title="No pages yet">Scan the book and its pages appear here.</EmptyState>}>
        {(rows) => <Pages items={rows} />}
      </DataView>
    );
  },
};
