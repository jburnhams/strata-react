import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActiveList, EmptyState, KeysLegend, format, useActiveItem, useHotkeys } from "../src";
import { bookings, type Booking } from "./fixtures/kiln";

// ActiveList and KeysLegend on their own. The whole pattern, with answers and Undo, is the
// "Screens/Bookings to check" story.

function Queue({ items, initial }: { items: Booking[]; initial?: string }) {
  const active = useActiveItem(items, (b) => b.id, { initial, noun: "booking" });
  useHotkeys(active.shortcuts);
  return (
    <div className="grid max-w-md gap-4">
      <ActiveList
        label="Bookings"
        active={active}
        empty={<EmptyState title="No bookings yet">Members book firings from the kiln room.</EmptyState>}
      >
        {(b) => (
          <div className="flex items-baseline justify-between gap-4">
            <span className="type-label">{b.member}</span>
            <span className="type-body-sm text-muted-foreground tabular-nums">{format.count(b.pieces, "piece")}</span>
          </div>
        )}
      </ActiveList>
      <KeysLegend shortcuts={active.shortcuts} />
    </div>
  );
}

const meta = {
  title: "Data/ActiveList",
  component: Queue,
  args: { items: bookings.slice(0, 5) },
} satisfies Meta<typeof Queue>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The first item is active until the person moves. j/k anywhere on the page, the arrow keys, Home and End in the list. */
export const FirstActive: Story = {};
export const SecondActive: Story = { args: { initial: "b-2042" } };
/** The list cannot be written without its empty state. */
export const Empty: Story = { args: { items: [] } };

/** Alternatives are read as "j or down arrow"; a shortcut that does nothing right now is muted. Hidden on touch screens. */
export const Legend: StoryObj = {
  render: () => (
    <KeysLegend
      shortcuts={[
        { keys: ["j", "ArrowDown"], label: "Next booking" },
        { keys: ["k", "ArrowUp"], label: "Previous booking" },
        { keys: ["a"], label: "Approve" },
        { keys: ["r"], label: "Return to member" },
        { keys: ["z"], label: "Undo", disabled: true },
        { keys: ["?"], label: "Show shortcuts" },
      ]}
    />
  ),
};
