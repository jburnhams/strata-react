import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { RowAction, SortableList, Status, type DropTarget } from "../src";

// Kiln-room version of issue #76: a shelf plan whose pieces are reordered, and a pieces list
// that pieces are dragged from onto a shelf. Dragging needs a pointer or a keyboard, so the
// states with a drag in progress are the live stories (skipped by the visual suite); the visual
// stories show every resting state.

type Piece = { id: string; name: string; kind: "pot" | "tile" };
const all: Piece[] = [
  { id: "p1", name: "Moonbeam bowl", kind: "pot" },
  { id: "p2", name: "Tea jar", kind: "pot" },
  { id: "p3", name: "Glaze test tile 14", kind: "tile" },
  { id: "p4", name: "Celadon vase", kind: "pot" },
];

function move<T extends { id: string }>(list: T[], keys: string[], target: DropTarget): T[] {
  const moving = list.filter((i) => keys.includes(i.id));
  const rest = list.filter((i) => !keys.includes(i.id));
  const at = rest.findIndex((i) => i.id === target.key);
  if (target.position === "root" || at < 0) return [...rest, ...moving];
  return [...rest.slice(0, target.position === "after" ? at + 1 : at), ...moving, ...rest.slice(target.position === "after" ? at + 1 : at)];
}

function Row({ p }: { p: Piece }) {
  return (
    <span className="flex items-center gap-3 type-body">
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      <Status tone={p.kind === "pot" ? "info" : "neutral"}>{p.kind === "pot" ? "Pot" : "Tile"}</Status>
    </span>
  );
}

function Shelf({ initial = all, selected }: { initial?: Piece[]; selected?: string }) {
  const [items, setItems] = React.useState(initial);
  return (
    <div className="w-96">
      <SortableList
        label="Shelf order"
        items={items}
        getKey={(p) => p.id}
        getLabel={(p) => p.name}
        empty={<p className="type-body text-muted-foreground">No pieces on this shelf</p>}
        onReorder={(keys, target) => setItems((l) => move(l, keys, target))}
        selectionMode="single"
        selectedKeys={selected ? new Set([selected]) : undefined}
        renderActions={(p) => <RowAction label="Remove" subject={p.name} onClick={() => setItems((l) => l.filter((x) => x.id !== p.id))} />}
      >
        {(p) => <Row p={p} />}
      </SortableList>
    </div>
  );
}

const meta = { title: "Layout/Sortable list", component: Shelf } satisfies Meta<typeof Shelf>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Resting: a grip per row (the drag handle, named "Drag Moonbeam bowl"), a status word, and the row's own action. Click selects; the grip drags; the arrows and Enter move it from the keyboard. */
export const Reorder: Story = { args: { selected: "p2" } };

/** An empty list says what it is and, while something is dragged over it, "Drop here". */
export const Empty: Story = { args: { initial: [] } };

function TwoLists() {
  const [library, setLibrary] = React.useState(all);
  const [shelf, setShelf] = React.useState<Piece[]>([all[0]]);
  return (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="grid gap-2">
        <p className="type-heading">Pieces</p>
        <SortableList label="Pieces" items={library} getKey={(p) => p.id} getLabel={(p) => p.name} getKind={(p) => p.kind} empty={<p>All placed</p>} onReorder={(k, t) => setLibrary((l) => move(l, k, t))}>
          {(p) => <Row p={p} />}
        </SortableList>
      </div>
      <div className="grid gap-2">
        <p className="type-heading">Top shelf</p>
        <SortableList
          label="Top shelf"
          items={shelf}
          getKey={(p) => p.id}
          getLabel={(p) => p.name}
          getKind={(p) => p.kind}
          accepts={["pot"]}
          refuses={{ tile: "The top shelf takes pots, not test tiles. Tiles go on the bottom shelf." }}
          empty={<p className="type-body text-muted-foreground">Drag a pot here</p>}
          onReorder={(k, t) => setShelf((l) => move(l, k, t))}
          onInsert={(ids, t) => setShelf((l) => move([...l, ...library.filter((p) => ids.includes(p.id) && !l.some((x) => x.id === p.id))], ids, t))}
        >
          {(p) => <Row p={p} />}
        </SortableList>
      </div>
    </div>
  );
}

/** Live: two lists. Drag a pot from Pieces to the top shelf, or with the keyboard focus its grip, press Enter, Tab to the shelf and Enter again. A tile dragged over the shelf is refused, with the reason. Skipped by the visual suite. */
export const BetweenLists: Story = { tags: ["no-visual"], render: () => <TwoLists /> };

/** Phone width: the grip is a 44px target and rows keep their action. */
export const Phone: Story = { tags: ["visual-phone"], args: { selected: "p2" } };
