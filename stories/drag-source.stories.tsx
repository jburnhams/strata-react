import type { Meta, StoryObj } from "@storybook/react-vite";
import { DragSource, RowAction, Status } from "../src";

// Issue #286: rows that are dragged onto a target elsewhere (a timeline lane, a shelf). Kiln-room
// version: the pieces waiting to be loaded. A drag in progress needs a pointer or a keyboard, so it is
// shown live in Timeline's "Drop from outside" story; these are the resting states.

const pieces = [
  { id: "p1", name: "Moonbeam bowl", kind: "Pot" },
  { id: "p2", name: "Tea jar", kind: "Pot" },
  { id: "p3", name: "Glaze test tile 14", kind: "Tile" },
];

function Waiting({ disabledId }: { disabledId?: string }) {
  return (
    <ul aria-label="Waiting to load" className="grid w-96 gap-1">
      {pieces.map((p) => (
        <li key={p.id}>
          <DragSource
            label={p.name}
            items={() => [{ "application/x-piece": p.id, "text/plain": p.name }]}
            disabled={p.id === disabledId}
            className="rounded-control border border-border py-1 pe-1 ps-1"
          >
            <span className="flex items-center gap-3 type-body">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <Status tone={p.kind === "Pot" ? "info" : "neutral"}>{p.kind}</Status>
              <RowAction label="Remove" subject={p.name} />
            </span>
          </DragSource>
        </li>
      ))}
    </ul>
  );
}

const meta = { title: "Layout/Drag source", component: Waiting } satisfies Meta<typeof Waiting>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Rows ready to drag, each with its grip ("Drag Moonbeam bowl") and its own action. */
export const Rows: Story = {};

/** One row that cannot be dragged: its grip is disabled. */
export const Disabled: Story = { args: { disabledId: "p2" } };
