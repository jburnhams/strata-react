import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, Scissors } from "lucide-react";
import { Button, CommandLegend, CommandMenu, ContextMenu, Menu, Toolbar, useCommands, type Command, type MenuEntry } from "../src";

// One list of commands drives every surface: a menu bar, a dropdown, a context menu, the command
// menu, the key handler and the legend. Change a label or its keys here and they all change. The
// shortcuts are shown for Windows and Linux (`platform="other"`) so the baselines are stable; the
// same list shows ⌘Z on macOS.

const noop = () => undefined;
const platform = "other" as const;

const commands: Command[] = [
  { id: "undo", label: "Undo move clip", keys: ["Mod+Z"], run: noop },
  { id: "redo", label: "Redo", keys: ["Mod+Shift+Z"], disabled: "Nothing to redo", run: noop },
  { id: "split", label: "Split clip", keys: ["s"], icon: Scissors, run: noop },
  { id: "duplicate", label: "Duplicate clip", keys: ["Mod+D"], claim: true, icon: Copy, run: noop },
  { id: "save", label: "Save project", keys: ["Mod+S"], claim: true, run: noop },
  { id: "delete", label: "Delete clip", keys: ["Delete"], destructive: true, run: noop },
];
const byId = (id: string) => commands.find((c) => c.id === id)!;

const editMenu: MenuEntry[] = [byId("undo"), byId("redo"), "separator", byId("split"), byId("duplicate"), "separator", byId("delete")];

const meta = {
  title: "Actions/Commands",
  component: Menu,
  parameters: { layout: "fullscreen" },
  tags: ["visual-phone"],
  args: { label: "Edit", trigger: <Button>Edit</Button>, items: editMenu, platform, open: true },
  decorators: [(Story) => <div className="grid h-80 content-start p-4"><Story /></div>],
} satisfies Meta<typeof Menu>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A dropdown with shortcuts, a disabled item that says why, and a destructive item with an icon as well as its colour. */
export const Dropdown: Story = {};

/** A titled group of checkable items (`checked` on every command in the group) and a submenu. */
export const CheckableAndSubmenu: Story = {
  args: {
    label: "View",
    trigger: <Button>View</Button>,
    items: [
      { group: "Overlays", items: [
        { id: "grid", label: "Show grid", checked: true, run: noop },
        { id: "safe", label: "Show safe areas", checked: false, run: noop },
      ] },
      "separator",
      { submenu: "Zoom", items: [{ id: "fit", label: "Fit to window", run: noop }, { id: "100", label: "Actual size", keys: ["Mod+0"], run: noop }] },
    ],
  },
};

/** A menu bar is a toolbar of menus: one tab stop, arrows move between File, Edit and View. */
export const MenuBar: Story = {
  render: () => (
    <Toolbar label="Menu bar">
      <Menu label="File" trigger={<Button variant="ghost">File</Button>} items={[byId("save")]} platform={platform} />
      <Menu label="Edit" trigger={<Button variant="ghost">Edit</Button>} items={editMenu} platform={platform} open />
      <Menu label="View" trigger={<Button variant="ghost">View</Button>} items={[]} platform={platform} />
    </Toolbar>
  ),
};

/** The legend is built from the same commands the key handler runs. */
export const Legend: Story = {
  render: () => <CommandLegend commands={commands} platform={platform} />,
};

/** The command menu searches every command; an unavailable one stays listed with its reason. */
export const CommandMenuOpen: Story = {
  render: () => <CommandMenu commands={editMenu} open shortcut={null} platform={platform} />,
};

/** A context menu opens on right-click and with the context-menu key or Shift+F10 on the focused clip. */
export const ContextMenuLive: Story = {
  tags: ["no-visual"],
  render: () => (
    <ContextMenu label="Clip actions" items={[byId("split"), byId("duplicate"), "separator", byId("delete")]} platform={platform}>
      <div role="button" tabIndex={0} aria-label="Clip run.mp4" className="w-64 rounded-surface border border-border p-3 type-body">
        run.mp4 (right-click me)
      </div>
    </ContextMenu>
  ),
};

function EditorScreen() {
  const [log, setLog] = React.useState<string[]>([]);
  const live = commands.map((c) => ({ ...c, run: () => setLog((l) => [...l, c.id]) }));
  useCommands(live, { platform });
  return (
    <div className="grid gap-3">
      <Toolbar label="Menu bar">
        <Menu label="Edit" trigger={<Button variant="ghost">Edit</Button>} items={live} platform={platform} />
      </Toolbar>
      <p className="type-body">Ran: {log.join(", ") || "nothing yet"}</p>
      <CommandLegend commands={live} platform={platform} />
      <CommandMenu commands={live} platform={platform} />
    </div>
  );
}

/** Try it: press Ctrl+Z, S or Ctrl+K, or open the Edit menu. */
export const Live: Story = { tags: ["no-visual"], render: () => <EditorScreen /> };
