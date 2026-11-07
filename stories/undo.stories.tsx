import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, HttpError, UndoBar, describeActionError, fetchJson, useUndoable, type PendingRemoval } from "../src";
import { api, withdrawServerError } from "./mocks/handlers";

// The bar has two states: a removal inside its window (Undo), and a removal whose commit failed
// (Try again, Dismiss). The item comes back on Undo and on failure; the hook tracks that, so the
// interactive stories filter by `isRemoved` instead of keeping their own flag.

const removal: PendingRemoval = {
  id: "b-2042",
  message: "Withdrew Tom Ellery's 3 pieces from kiln 2.",
  failure: "Tom Ellery's booking is back in kiln 2: the withdrawal did not go through.",
  commit: () => undefined,
};
const noop = () => undefined;
const resolved = () => Promise.resolve();

const meta = {
  title: "Feedback/UndoBar",
  component: UndoBar,
  args: {
    inline: true,
    undoable: { pending: removal, failed: null, undo: noop, retry: resolved, dismiss: noop },
  },
} satisfies Meta<typeof UndoBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Act at once, offer Undo for 8 s, commit after. A confirm dialog is for what cannot be undone. */
export const Pending: Story = {};

/** The commit failed: the item is back, and the bar says so in the product's words and the error's, until retried or dismissed. */
export const Failed: Story = {
  args: {
    undoable: {
      pending: null,
      failed: { removal, message: describeActionError(new HttpError(503, "Service Unavailable", api.bookings)) },
      undo: noop,
      retry: resolved,
      dismiss: noop,
    },
  },
};

function Live() {
  const undoable = useUndoable();
  const [log, setLog] = React.useState("");
  const withdrawn = undoable.isRemoved("b-2042");
  return (
    <div className="grid justify-items-start gap-4">
      <p className="type-body">{withdrawn ? "Tom Ellery's booking is withdrawn." : "Tom Ellery: 3 pieces in kiln 2."}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={withdrawn}
          onClick={() =>
            undoable.schedule({ ...removal, commit: () => fetchJson(`${api.bookings}/b-2042`, { method: "DELETE" }) })
          }
        >
          Withdraw
        </Button>
        <Button
          size="sm"
          disabled={!undoable.pending}
          onClick={() =>
            undoable.flush().then(
              () => setLog("Committed; the kiln list can be rebuilt now."),
              () => setLog("Not committed; the kiln list was left alone."),
            )
          }
        >
          Rebuild kiln list
        </Button>
      </div>
      {log && <p className="type-body-sm text-muted-foreground">{log}</p>}
      <UndoBar inline undoable={undoable} />
    </div>
  );
}

/** Withdraw, then Undo, wait out the window, or rebuild the list (which flushes first). */
export const Interactive: Story = { tags: ["no-visual"], render: () => <Live /> };

/** The same, with the server refusing the withdrawal: the booking comes back and the bar offers Try again. */
export const InteractiveServerError: Story = {
  tags: ["no-visual"],
  beforeEach: ({ msw }) => msw.use(withdrawServerError),
  render: () => <Live />,
};
