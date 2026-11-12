import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Menu, SaveStatus, Toolbar, useHistoryState, type SaveState } from "../src";

// Undo history and save state for a document edited over a long session (issue #81, from
// strata-vid). The history stories use a track's clip position as the "document"; the save stories
// are one `SaveStatus` per state. `useUndoable` (see Feedback/Undo) is for one removal that commits
// after a few seconds; this is for work the person keeps editing.

const meta = {
  title: "Feedback/History and save",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Editor({ steps, limit }: { steps: number; limit?: number }) {
  const { value, set, history } = useHistoryState({ at: 0 }, { limit });
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (let i = 0; i < steps; i++) set((v) => ({ at: v.at + 1 }), i % 2 ? "trim clip" : "move clip");
  }, [steps, set]);
  const [undo, redo] = history.commands;
  return (
    <div className="grid max-w-md gap-4">
      <Toolbar label="Edit">
        <Menu label="Edit" trigger={<Button variant="ghost">Edit</Button>} items={[undo, redo]} />
        <Button size="sm" onClick={() => set((v) => ({ at: v.at + 1 }), "move clip")}>Move clip</Button>
        <Button size="sm" disabled={!history.canUndo} onClick={history.undo}>{undo.label as string}</Button>
        <Button size="sm" disabled={!history.canRedo} onClick={history.redo}>{redo.label as string}</Button>
      </Toolbar>
      <p className="type-body">Clip is at {value.at} s.</p>
      <p className="type-caption text-muted-foreground">
        {history.past.length ? `${history.past.length} steps${history.atLimit ? ", the oldest dropped" : ""}: ${history.past.join(", ")}` : "No steps yet."}
      </p>
    </div>
  );
}

/** Nothing done yet: Undo says only "Undo" and is disabled. */
export const NoHistory: Story = { render: () => <Editor steps={0} /> };
/** Several steps: the buttons and menu name what Undo will take back. */
export const SeveralSteps: Story = { render: () => <Editor steps={4} /> };
/** At the limit, the oldest step is dropped and the screen can say so. */
export const AtTheLimit: Story = { render: () => <Editor steps={6} limit={3} /> };

const states: [string, SaveState][] = [
  ["Saved", { status: "saved", at: new Date("2026-11-12T10:42:00Z") }],
  ["Saving", { status: "saving" }],
  ["Unsaved", { status: "dirty" }],
  ["Failed", { status: "failed", reason: "The connection dropped." }],
];

/** Each state of the save sign, in the same fixed width: nothing beside it moves when it changes. */
export const SaveStates: Story = {
  render: () => (
    <div className="grid max-w-sm gap-3">
      {states.map(([name, state]) => (
        <div key={name} className="flex items-center justify-between gap-3 border-b border-border pb-2">
          <span className="type-label">{name}</span>
          <SaveStatus state={state} onRetry={() => undefined} />
        </div>
      ))}
    </div>
  ),
};
