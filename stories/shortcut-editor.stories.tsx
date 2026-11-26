import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeysLegend, ShortcutEditor, useHotkeys, useRebindableShortcuts, type Shortcut } from "../src";

// Issue #361: one list drives the keys that run, the legend that shows them and the editor that changes
// them. The resting stories show the editor; the working one is the whole loop.

const meta = { title: "Keyboard/ShortcutEditor", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const make = (log?: (s: string) => void): Shortcut[] => [
  { id: "accept", keys: ["a"], label: "Accept booking", run: () => log?.("Accepted") },
  { id: "reject", keys: ["r"], label: "Reject booking", run: () => log?.("Rejected") },
  { id: "next", keys: ["j", "ArrowDown"], label: "Next booking", run: () => log?.("Next"), repeat: true },
  { id: "previous", keys: ["k", "ArrowUp"], label: "Previous booking", run: () => log?.("Previous"), repeat: true },
  { id: "help", keys: ["?"], label: "Show shortcuts", run: () => log?.("Help"), disabled: true },
];
const defaults = make();

function Editor({ initial }: { initial?: Record<string, string[]> }) {
  const rebinding = useRebindableShortcuts(defaults, { initial });
  return <ShortcutEditor rebinding={rebinding} className="max-w-xl" />;
}

/** The defaults. “Change” records the next key; Escape cancels. The disabled shortcut is muted and cannot be changed. */
export const Defaults: Story = { render: () => <Editor /> };

/** Two actions changed: each shows “Reset”, and “Reset all” appears under the list. */
export const Changed: Story = { render: () => <Editor initial={{ accept: ["y"], reject: ["n"] }} /> };

/** Working: change a key, then press it. The legend and the handler follow at once, and a key already taken asks “swap?”. Interactive. */
export const Working: Story = {
  tags: ["no-visual"],
  render: () => {
    const [said, setSaid] = React.useState("Press a key");
    const shortcuts = React.useMemo(() => make(setSaid), []);
    const rebinding = useRebindableShortcuts(shortcuts, { storageKey: "strata-story-keys" });
    useHotkeys(rebinding.shortcuts);
    return (
      <div className="grid max-w-xl gap-4">
        <p role="status" className="type-body">
          {said}
        </p>
        <KeysLegend shortcuts={rebinding.shortcuts} />
        <ShortcutEditor rebinding={rebinding} />
      </div>
    );
  },
};
