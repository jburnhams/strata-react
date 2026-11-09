import type * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Archive } from "lucide-react";
import {
  Button,
  EmptyState,
  IconButton,
  InfiniteList,
  Skeleton,
  UndoBar,
  fetchJson,
  format,
  useInfiniteLoad,
  useUndoable,
  type InfiniteLoad,
  type Load,
  type More,
} from "../src";
import { firingTypes, firings, kilns, minuteToDate, type Firing } from "./fixtures/kiln";
import { api, firingsEmpty, firingsLaterPageError, firingsLoading, firingsServerError, type FiringPage } from "./mocks/handlers";

// The co-op's firing log, 137 firings since March, served a page at a time by a cursor API
// (`after` = the last firing held). The state stories fix one InfiniteLoad each; the "From the
// API" stories run useInfiniteLoad against MSW, the same path a product runs.

function FiringRow({ f, action }: { f: Firing; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2 type-body-sm">
      <span className="w-28 shrink-0 text-muted-foreground tabular-nums">{format.shortDay.format(minuteToDate(f.endedMin))}</span>
      <span className="min-w-0 flex-1 truncate">
        {firingTypes[f.type].label} in {kilns[f.kiln].name.split(",")[0]}
      </span>
      <span className="w-20 text-right tabular-nums">{format.count(f.pieces, "piece")}</span>
      <span className="w-20 text-right tabular-nums">{format.celsius(f.peakC)}</span>
      {action}
    </div>
  );
}

/** Mirrors FiringRow: same heights and column widths, so nothing moves when rows arrive. */
function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-border py-3 first:border-t-0">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

function FiringLog({ state, keepAtLeast }: { state: InfiniteLoad<Firing>; keepAtLeast?: number }) {
  return (
    <InfiniteList
      state={state}
      label="Firing log, newest first"
      moreLabel="Show older firings"
      skeleton={<RowsSkeleton rows={6} />}
      moreSkeleton={<RowsSkeleton />}
      empty={
        <EmptyState title="No firings yet" action={<Button variant="default">Book a firing</Button>}>
          Each firing is logged here when its kiln cools below 200 °C, with its peak temperature and pieces.
        </EmptyState>
      }
      end="That is every firing since the co-op opened in March."
      height={360}
      estimateSize={37}
      keepAtLeast={keepAtLeast}
    >
      {(f) => <FiringRow f={f} />}
    </InfiniteList>
  );
}

const noop = () => undefined;
const more = (m: Partial<More> = {}): More => ({ hasMore: true, loadingMore: false, loadMore: noop, ...m });
const fixed = (load: Load<Firing[]>, m?: Partial<More>): InfiniteLoad<Firing> => ({
  ...load,
  more: more(m),
  itemKey: (f: Firing) => f.id,
  dismiss: noop,
  restore: noop,
});

function useFiringLog(limit = 20, isRemoved?: (id: string) => boolean) {
  return useInfiniteLoad({
    isRemoved,
    queryKey: ["firings", limit],
    queryFn: ({ cursor, signal }) =>
      fetchJson<FiringPage>(`${api.firings}?limit=${limit}${cursor ? `&after=${cursor}` : ""}`, { signal }),
    items: (page) => page.firings,
    itemKey: (f) => f.id,
    hasMore: (page) => page.hasMore,
  });
}

function FromApi({ limit }: { limit?: number }) {
  return <FiringLog state={useFiringLog(limit)} />;
}

// A queue someone works through: archiving a firing hides it at once with Undo in reach, and
// keepAtLeast refills the list before it runs dry. useUndoable owns what is out of view; the
// list reads it through `isRemoved`, so the cursor follows the last firing still shown and
// archiving never skips one.
function ArchiveQueue() {
  const undoable = useUndoable();
  const log = useFiringLog(8, undoable.isRemoved);
  const archive = (f: Firing) => {
    const day = format.day.format(minuteToDate(f.endedMin));
    undoable.schedule({
      id: f.id,
      message: `Archived the ${day} firing.`,
      failure: `The ${day} firing is back: archiving it did not go through.`,
      commit: noop,
    });
  };
  return (
    <div className="grid gap-4">
      <InfiniteList
        state={log}
        label="Firings to archive"
        moreLabel="Show older firings"
        skeleton={<RowsSkeleton rows={6} />}
        empty={<EmptyState title="Nothing left to archive" />}
        keepAtLeast={6}
        height={360}
      >
        {(f) => (
          <FiringRow f={f} action={<IconButton label={`Archive firing ${f.id}`} icon={Archive} onClick={() => archive(f)} />} />
        )}
      </InfiniteList>
      <UndoBar undoable={undoable} inline />
    </div>
  );
}

// The same log as cards in a grid that scrolls with the page (`scroll="page"`): no box of its own,
// the grid laid out by `listClassName`, and the same next-page row (`LoadMore`) after it.
function FiringCard({ f }: { f: Firing }) {
  return (
    <article className="grid gap-1 rounded-surface border border-border p-3">
      <p className="type-label">{firingTypes[f.type].label}</p>
      <p className="type-body-sm text-muted-foreground">
        {kilns[f.kiln].name.split(",")[0]}, {format.shortDay.format(minuteToDate(f.endedMin))}
      </p>
      <p className="type-body-sm tabular-nums">
        {format.count(f.pieces, "piece")} at {format.celsius(f.peakC)}
      </p>
    </article>
  );
}

function CardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

function FiringGrid({ state }: { state: InfiniteLoad<Firing> }) {
  return (
    <InfiniteList
      state={state}
      label="Firings, newest first"
      scroll="page"
      listClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      moreLabel="Show older firings"
      skeleton={<CardsSkeleton cards={6} />}
      moreSkeleton={<CardsSkeleton />}
      empty={<EmptyState title="No firings yet" />}
      end="That is every firing since the co-op opened in March."
    >
      {(f) => <FiringCard f={f} />}
    </InfiniteList>
  );
}

function GridFromApi() {
  return <FiringGrid state={useFiringLog(9)} />;
}

const meta = {
  title: "Data/InfiniteList",
  component: FiringLog,
  args: { state: fixed({ status: "loading" }) },
} satisfies Meta<typeof FiringLog>;
export default meta;
type Story = StoryObj<typeof meta>;

const first = firings.slice(0, 5);

export const MoreToCome: Story = { args: { state: fixed({ status: "ready", data: first }) } };
export const Loading: Story = { args: { state: fixed({ status: "loading" }) } };
export const Empty: Story = { args: { state: fixed({ status: "ready", data: [] }, { hasMore: false }) } };
export const Failed: Story = {
  args: {
    state: fixed({
      status: "error",
      message: "The firing log could not be reached (503). Kiln controllers keep logging and nothing was lost.",
      retry: noop,
    }),
  },
};
export const LoadingMore: Story = { args: { state: fixed({ status: "ready", data: first }, { loadingMore: true }) } };
export const LaterPageFailed: Story = {
  args: {
    state: fixed(
      { status: "ready", data: first },
      { error: "Older firings could not be loaded (503). The five above are current." },
    ),
  },
};
export const EveryFiring: Story = { args: { state: fixed({ status: "ready", data: firings.slice(-4) }, { hasMore: false }) } };

export const FromApiReady: Story = { name: "From the API: ready", render: () => <FromApi /> };
export const FromApiLoading: Story = {
  name: "From the API: loading",
  beforeEach: ({ msw }) => msw.use(firingsLoading),
  render: () => <FromApi />,
};
export const FromApiEmpty: Story = {
  name: "From the API: empty",
  beforeEach: ({ msw }) => msw.use(firingsEmpty),
  render: () => <FromApi />,
};
export const FromApiError: Story = {
  name: "From the API: server error",
  beforeEach: ({ msw }) => msw.use(firingsServerError),
  render: () => <FromApi />,
};
export const FromApiLaterPageError: Story = {
  name: "From the API: a later page fails",
  beforeEach: ({ msw }) => msw.use(firingsLaterPageError),
  render: () => <FromApi limit={5} />,
};
export const ArchiveQueueDemo: Story = { name: "Archive queue (interactive)", tags: ["no-visual"], render: () => <ArchiveQueue /> };

/** Cards in a responsive grid that scrolls with the page, with Show more after the last row. */
export const PageGrid: Story = {
  tags: ["visual-wide"],
  render: () => <FiringGrid state={fixed({ status: "ready", data: firings.slice(0, 6) })} />,
};
/** The grid with its next page on the way: card skeletons after the cards. */
export const PageGridLoadingMore: Story = {
  tags: ["visual-wide"],
  render: () => <FiringGrid state={fixed({ status: "ready", data: firings.slice(0, 6) }, { loadingMore: true })} />,
};
/** The grid from the API, loading the next page as the end nears the viewport. */
export const PageGridFromApi: Story = { name: "Page grid from the API (interactive)", tags: ["no-visual"], render: () => <GridFromApi /> };
