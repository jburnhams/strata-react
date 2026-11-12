import type { Meta, StoryObj } from "@storybook/react-vite";
import { Trash2, Undo2 } from "lucide-react";
import { Button, IconButton, Tooltip } from "../src";

// A tooltip names or explains a control and never holds anything interactive. `open` pins it shown
// so the visual suite can see it; in use it opens on hover (after a short delay) and on keyboard focus.

const meta = {
  title: "Overlays/Tooltip",
  component: Tooltip,
  args: { label: "Delete clip", open: true, children: <Button>Clip</Button> },
  decorators: [(Story) => <div className="grid h-24 place-items-center pt-8"><Story /></div>],
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A label on any pressable. */
export const Label: Story = {};

/** `hint` adds a muted aside after the label, such as a shortcut. */
export const WithShortcut: Story = { args: { hint: "Del" } };

/** `IconButton` shows its required `label` this way, so the name and the visible hint come from one string. */
export const OnIconButton: Story = {
  args: { children: <IconButton icon={Undo2} label="Undo move clip" />, label: "Undo move clip", hint: "Ctrl+Z" },
};

/** Opens below when there is no room above. */
export const Below: Story = { args: { side: "bottom", label: "Delete clip", children: <IconButton icon={Trash2} label="Delete clip" /> } };
