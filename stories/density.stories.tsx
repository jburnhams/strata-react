import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Lock, Trash2, Volume2 } from "lucide-react";
import { Button, Density, Dialog, Input, Menu, NativeSelect, NumberField, Toggle, Toolbar, type MenuEntry } from "../src";

// Density is how much a tool screen packs in (issue #117, from strata-vid). An app chooses it once,
// on the page (`ThemeProvider density` or `<Density page>`), which reaches the overlays that portal
// out of the app's root; `<Density value>` sets it for one region. Controls that sit together in a
// toolbar or a property row share one set of sizes, so a small one is the same height whichever
// control it is, in both densities.

const meta = {
  title: "Layout/Density",
  component: Density,
  parameters: { layout: "fullscreen" },
  args: { value: "compact", children: null },
} satisfies Meta<typeof Density>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A track header: mute and lock toggles, a delete icon button, a volume field, a rate select and an Apply button, all `sm`. */
function TrackHeader({ label }: { label: string }) {
  const [volume, setVolume] = React.useState<number | null>(80);
  return (
    <div className="grid gap-1.5">
      <p className="type-caption text-muted-foreground">{label}</p>
      <Toolbar label={`Track controls, ${label}`}>
        <Toggle label="Mute" icon={Volume2} iconOnly size="sm" />
        <Toggle label="Lock" icon={Lock} iconOnly size="sm" defaultPressed />
        <Button size="sm">Apply</Button>
        <NumberField aria-label={`Volume, ${label}`} value={volume} onChange={setVolume} min={0} max={100} unit="%" size="sm" className="w-24" />
        <NativeSelect aria-label={`Rate, ${label}`} size="sm" className="w-28" defaultValue="1">
          <option value="1">1×</option>
          <option value="2">2×</option>
        </NativeSelect>
        <Input aria-label={`Name, ${label}`} size="sm" defaultValue="Voice" className="w-28" />
      </Toolbar>
    </div>
  );
}

/** One row height across `IconButton`, an icon-only `Toggle`, `Button`, `NumberField`, `NativeSelect` and `Input`, in both densities. */
export const ToolbarRow: Story = {
  render: () => (
    <div className="grid gap-6 p-4">
      <Density value="default">
        <TrackHeader label="Default density" />
      </Density>
      <Density value="compact">
        <TrackHeader label="Compact density" />
      </Density>
    </div>
  ),
};

/** `IconButton` takes the same `sm` as `Toggle`, so a delete button sits level with the toggles beside it. */
export const IconButtonSizes: Story = {
  render: () => (
    <div className="grid gap-6 p-4">
      {(["default", "compact"] as const).map((d) => (
        <Density key={d} value={d} className="flex items-center gap-2">
          <Toggle label="Mute" icon={Volume2} iconOnly size="sm" />
          <Button variant="ghost" size="icon-sm" aria-label="Delete track">
            <Trash2 aria-hidden />
          </Button>
          <span className="type-caption text-muted-foreground">{d}</span>
        </Density>
      ))}
    </div>
  ),
};

const items: MenuEntry[] = [
  { id: "split", label: "Split at playhead", run: () => undefined },
  { id: "duplicate", label: "Duplicate", run: () => undefined },
  "separator",
  { id: "delete", label: "Delete", run: () => undefined },
];

/** App-wide compact density reaches a dialog, which portals out of the app's root. Its Close control and buttons are the compact heights. */
export const CompactDialog: Story = {
  render: () => (
    <Density page value="compact">
      <div className="grid h-96 content-start gap-2 p-4">
        <p className="type-heading">Kiln schedule</p>
        <p className="type-body text-muted-foreground">Fridays, out on Saturday after 10:00.</p>
      </div>
      <Dialog title="Export video" open description="Renders the whole project." actions={(close) => <Button variant="default" onPress={close}>Export</Button>}>
        <p className="type-body">moonbeam.mp4, 2:31 at 1080p.</p>
      </Dialog>
    </Density>
  ),
};

/** ...and a menu, whose items are --control-h-sm tall. */
export const CompactMenu: Story = {
  render: () => (
    <Density page value="compact">
      <div className="p-4">
        <Menu label="Edit" trigger={<Button variant="ghost">Edit</Button>} items={items} open />
      </div>
    </Density>
  ),
};
