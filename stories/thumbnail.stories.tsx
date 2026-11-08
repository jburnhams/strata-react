import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataView, EmptyState, Skeleton, Thumbnail, ThumbnailSkeleton, fetchJson, useLoad } from "../src";
import { piecePhotos, type PiecePhoto } from "./fixtures/kiln";
import { api, photosLoading, piecesLoading } from "./mocks/handlers";

// A Thumbnail has its shape before the photo arrives, a skeleton while it loads, and says
// "Photo not found" when it cannot be loaded or there is none. The photos come from MSW, so the
// loaded and missing stories run the real request; the loading story keeps it open.

const meta = {
  title: "Data/Thumbnail",
  component: Thumbnail,
  args: { src: piecePhotos[0].photo, alt: "Celadon bowl", missing: "Photo not found", aspect: "4/3", className: "w-56" },
} satisfies Meta<typeof Thumbnail>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The photo, cropped to fill a 4:3 box. */
export const Loaded: Story = {};

/** While the request is open: a skeleton in the final shape, so nothing moves when it lands. */
export const Loading: Story = { beforeEach: ({ msw }) => msw.use(photosLoading) };

/** The file has gone from the server (404): the product's words, not a broken-image icon. Named "Copper red bottle: Photo not found". */
export const Missing: Story = { args: { src: "/api/photos/p-305-moved.svg", alt: "Copper red bottle" } };

/** The record has no photo (`src={null}`): the same words, without a request. */
export const NoPhoto: Story = { args: { src: null, alt: "Raku dish", missing: "No photo yet" } };

/** The box takes `aspect`; `fit="contain"` shows the whole image inside it instead of cropping. */
export const Shapes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-start gap-4">
      <Thumbnail {...args} aspect={1} className="w-32" />
      <Thumbnail {...args} aspect="4/3" className="w-40" />
      <Thumbnail {...args} aspect="3/4" fit="contain" className="w-32" />
    </div>
  ),
};

// A list of pieces from the API: DataView's skeleton is made of ThumbnailSkeletons the same size as
// the thumbnails, so the list arrives without a jump, and each photo then loads on its own.
function Row({ piece }: { piece: PiecePhoto }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Thumbnail src={piece.photo} alt="" missing={piece.photo ? "Photo not found" : "No photo yet"} className="w-16 shrink-0" />
      <div className="min-w-0">
        <p className="type-body">{piece.title}</p>
        <p className="type-body-sm text-muted-foreground">{piece.member}</p>
      </div>
    </li>
  );
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 py-2">
      <ThumbnailSkeleton className="w-16 shrink-0" />
      <div className="grid gap-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </li>
  );
}

function Pieces() {
  const load = useLoad({ queryKey: ["pieces"], queryFn: () => fetchJson<PiecePhoto[]>(api.pieces) });
  return (
    <section aria-labelledby="pieces-title" className="max-w-sm">
      <h2 id="pieces-title" className="type-heading">Out of Thursday's glaze firing</h2>
      <DataView
        state={load}
        isEmpty={(pieces) => pieces.length === 0}
        skeleton={<ul aria-hidden className="divide-y divide-border">{[0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)}</ul>}
        empty={<EmptyState title="No pieces photographed yet">Members add photos from the booking once their work is out of the kiln.</EmptyState>}
      >
        {(pieces) => (
          <ul aria-labelledby="pieces-title" className="divide-y divide-border">
            {pieces.map((p) => <Row key={p.id} piece={p} />)}
          </ul>
        )}
      </DataView>
    </section>
  );
}

/** In a list from the API, with `alt=""` because the title beside each photo names it. One file is missing and one piece has no photo. */
export const InAList: Story = { render: () => <Pieces /> };

/** The list itself loading: thumbnail-shaped skeletons. */
export const InAListLoading: Story = { name: "In a list: loading", beforeEach: ({ msw }) => msw.use(piecesLoading), render: () => <Pieces /> };
