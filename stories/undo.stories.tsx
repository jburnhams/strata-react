import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, UndoBar, useUndoable } from "../src";

const meta = {
  title: "Feedback/UndoBar",
  component: UndoBar,
  args: {
    inline: true,
    onUndo: () => undefined,
    pending: { id: "b-2042", message: "Withdrew Tom Ellery's 3 pieces from kiln 2.", commit: () => undefined },
  },
} satisfies Meta<typeof UndoBar>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Act at once, offer Undo for 8 s, commit after. A confirm dialog is for what cannot be undone. */
export const Pending: Story = {};

function Live() {
  const [withdrawn, setWithdrawn] = React.useState(false);
  const { pending, schedule, undo } = useUndoable();
  return (
    <div className="grid justify-items-start gap-4">
      <p className="type-body">{withdrawn ? "Tom Ellery's booking is withdrawn." : "Tom Ellery: 3 pieces in kiln 2."}</p>
      <Button
        size="sm"
        disabled={withdrawn}
        onClick={() => {
          setWithdrawn(true);
          schedule({ id: "b-2042", message: "Withdrew Tom Ellery's 3 pieces from kiln 2.", commit: () => undefined });
        }}
      >
        Withdraw
      </Button>
      <UndoBar
        inline
        pending={pending}
        onUndo={() => {
          undo();
          setWithdrawn(false);
        }}
      />
    </div>
  );
}

export const Interactive: Story = { tags: ["no-visual"], render: () => <Live /> };
