import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkBar, Button, SelectableGrid, Tree, ViewOptions, format, useChoices, useExpanded, useSelection, useViewOptions, type Load } from "../src";
import { glazeNames, shelfPhotos, type ShelfPhoto } from "./fixtures/kiln";
import { PiecePicture } from "./fixtures/piece-photo";

// The kiln room's photo archive as strata-stills' Browser draws it (issues #245 to #247): a tree of
// firings with the open one's pictures in a grid beside it, one toolbar for how they are looked at,
// and the grid zoomable, sortable, grouped and chosen from.

const meta = { title: "Data/Photo browser", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const label = (p: ShelfPhoto) => `${p.member}, ${p.piece}`;
// Each picture was taken in a minute of a firing day, so there is a time to sort and group by.
const taken = (p: ShelfPhoto) => {
  const n = Number(p.id.slice(2));
  return new Date(Date.UTC(2026, 2, 1 + (n % 5), 8 + (n % 7), (n * 7) % 60));
};
const hourOf = (p: ShelfPhoto) => `${String(taken(p).getUTCHours()).padStart(2, "0")}:00`;

function Browser({ count, grouped = false, selectionBehavior }: { count: number; grouped?: boolean; selectionBehavior?: "toggle" | "replace" }) {
  const all = React.useMemo(() => shelfPhotos(count), [count]);
  const view = useViewOptions<ShelfPhoto>({
    id: `story-browser-${count}`,
    sorts: [
      { key: "taken", label: "Date taken", value: taken, directions: ["Oldest first", "Newest first"], defaultDescending: true },
      { key: "name", label: "Name", value: (p) => p.piece },
      { key: "glaze", label: "Glaze", value: (p) => glazeNames[p.glaze] },
    ],
    groups: [{ key: "hour", label: "Hour", of: hourOf }],
    defaultGroup: grouped ? "hour" : null,
    size: { min: 64, max: 320, step: 16, default: 144 },
    aspects: ["square", "landscape"],
    filterText: (p) => `${p.member} ${p.piece} ${glazeNames[p.glaze]}`,
  });
  const selection = useSelection(all, (p) => p.id);
  const rows = view.apply(all);
  return (
    <div className="grid min-w-0 gap-3">
      <ViewOptions view={view} shown={rows.length} total={all.length} />
      <BulkBar count={selection.count} noun="picture" onClear={selection.clear}>
        <Button variant="default">Add {selection.count} to project</Button>
      </BulkBar>
      <SelectableGrid
        label="Pictures in this firing"
        rows={rows}
        rowKey={(p) => p.id}
        renderImage={(p) => <PiecePicture photo={p} />}
        detail={(p) => `${format.dateTime(taken(p))}`}
        selection={{ ...selection, rowLabel: label }}
        tileSize={view.size}
        onTileSizeChange={view.setSize}
        aspect={view.aspect}
        selectionBehavior={selectionBehavior}
        groupBy={view.group ? hourOf : undefined}
        groupHeading={(g) => g}
        maxHeight={520}
      />
    </div>
  );
}

/** 2,000 pictures in one scroll box, drawn only as far as the window. Sorted newest first; the size slider, `-` and `+` and Ctrl+wheel zoom; the filter says "N of 2,000". */
export const TwoThousand: Story = { render: () => <Browser count={2000} />, tags: ["no-visual"] };

/** 120 pictures grouped by hour under sticky headings (with the count beside each), each with a box for the group (mixed when part of it is chosen) and a fold button. */
export const Grouped: Story = { render: () => <Browser count={120} grouped />, tags: ["visual-wide"] };

/** Finder rules: a click chooses one picture, Ctrl or Cmd adds, Shift extends, Ctrl/Cmd+A chooses all and Escape clears. */
export const ReplaceBehavior: Story = { render: () => <Browser count={40} selectionBehavior="replace" />, tags: ["no-visual"] };

type Folder = { id: string; name: string; pictures: number; inProject?: boolean };
const years: Folder[] = [
  { id: "2025", name: "2025", pictures: 412 },
  { id: "2026", name: "2026", pictures: 1180, inProject: true },
];
const datesOf = (year: string): Folder[] => [3, 2, 1].map((d) => ({ id: `${year}/${year}-03-0${d}`, name: `${year}-03-0${d}`, pictures: d * 70, inProject: year === "2026" && d === 2 }));
const ready = (data: Folder[]) => ({ status: "ready", data, refreshing: false }) as unknown as Load<readonly Folder[]>;

function Archive() {
  const choices = useChoices({ initial: [] });
  const expanded = useExpanded({ initial: ["2026"] });
  const [current, setCurrent] = React.useState<string | null>("2026/2026-03-02");
  return (
    <div className="grid max-w-md gap-2">
      <Tree<Folder>
        label="Archive"
        roots={ready(years)}
        useChildren={(n) => ready(datesOf(n.id))}
        nodeKey={(n) => n.id}
        nodeLabel={(n) => n.name}
        isBranch={(n) => !n.id.includes("/")}
        expanded={expanded}
        emptyRow="No folders"
        choices={choices}
        current={current}
        onCurrentChange={(k) => setCurrent(k)}
        count={(n) => `${format.integer(n.pictures)} pictures`}
        badge={(n) => (n.inProject ? { label: "in project", tone: "success" } : null)}
        sortChildren={(a, b) => b.name.localeCompare(a.name)}
        resolveBranch={async (n) => datesOf(n.id).map((d) => d.id)}
        coverNoun={["folder", "folders"]}
        height="16rem"
      />
      <p className="type-body-sm text-muted-foreground">Looking at {current ?? "nothing"}. {choices.count} ticked.</p>
    </div>
  );
}

/** The folder in view is highlighted (a press on its name); the boxes tick folders to add. Counts are right aligned, "in project" is a badge, dates read newest first, and ticking a year says what it covers without opening it. */
export const CurrentAndTicked: Story = { render: () => <Archive /> };
