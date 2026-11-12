import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataView, EmptyState, Skeleton, Thumbnail, ThumbnailSkeleton, fetchJson, format, useLoad } from "../src";
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
/** A list of sources is tried in order (the first size does not exist for every item): here the first is missing, the second loads. `onLoad` can reject a picture that loaded (a host's grey placeholder), and `onMissing` is told once when none worked. */
export const SourcesInOrder: Story = { args: { src: ["/api/photos/p-305-moved.svg", "/api/photos/p-301.svg"], alt: "Celadon bowl, front" } };

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

// A card's corners carry badges (a running time, "Saved"). They are the Thumbnail's children, so
// they keep their place while the image loads, after it fails, and with no image at all.
function Badge({ children, className }: { children: string; className: string }) {
  return <span className={`absolute rounded-control bg-background px-1.5 py-0.5 type-caption tabular-nums text-foreground ${className}`}>{children}</span>;
}

/** Badges in the corners, over a loaded photo, one that is missing, and one still loading. */
export const WithBadges: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <Thumbnail src={piecePhotos[1].photo} alt="Throwing a tea bowl" missing="Picture not found" aspect="16/9" className="w-56">
        <Badge className="right-1.5 bottom-1.5">{format.runningTime(754)}</Badge>
        <Badge className="top-1.5 left-1.5">Saved</Badge>
      </Thumbnail>
      <Thumbnail src="/api/photos/p-305-moved.svg" alt="Glazing a bottle" missing="Picture not found" aspect="16/9" className="w-56">
        <Badge className="right-1.5 bottom-1.5">{format.runningTime(3729)}</Badge>
      </Thumbnail>
      <Thumbnail src={null} alt="Raku firing in the yard" missing="No picture yet" aspect="16/9" className="w-56">
        <Badge className="top-1.5 left-1.5">Fetching</Badge>
      </Thumbnail>
    </div>
  ),
};

function Initial({ name }: { name: string }) {
  return <span className="grid place-items-center bg-muted type-label text-muted-foreground">{name[0]}</span>;
}

/** Avatars: `aspect={1}` and `rounded-pill`, with the member's initial as the `fallback` when there is no picture. Each is named by `alt`. */
export const Avatars: Story = {
  render: () => (
    <ul className="flex items-center gap-3">
      {piecePhotos.slice(2, 6).map((p) => (
        <li key={p.id}>
          <Thumbnail src={p.photo} alt={p.member} aspect={1} className="w-10 rounded-pill" fallback={<Initial name={p.member} />} />
        </li>
      ))}
    </ul>
  ),
};
