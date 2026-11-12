import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Grid2x2, List, Magnet, ScanLine, Square } from "lucide-react";
import { Button, Switch, Toggle, ToggleGroup, Toolbar, ToolbarSeparator } from "../src";

// Controls that act on what is shown: pressed or not, one of a few, on or off at once. Chosen is an
// ink border on a tint, so it is seen without colour and never reads as the view's one filled
// button. The toolbar is one tab stop with arrow keys inside it.

const meta = {
  title: "Actions/Toolbar and toggles",
  component: Toolbar,
  args: { label: "Preview options", children: null },
} satisfies Meta<typeof Toolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

function PreviewBar({ density }: { density?: "compact" }) {
  const [quality, setQuality] = React.useState("half");
  const [view, setView] = React.useState("grid");
  return (
    <div data-density={density} className="grid gap-3">
      <Toolbar label="Preview options">
        <Toggle label="Safe areas" icon={ScanLine} defaultPressed />
        <Toggle label="Grid" icon={Grid2x2} />
        <Toggle label="Snap to edges" icon={Magnet} iconOnly defaultPressed />
        <ToolbarSeparator />
        <ToggleGroup
          label="Preview quality"
          value={quality}
          onChange={setQuality}
          options={[{ value: "full", label: "Full" }, { value: "half", label: "Half" }, { value: "quarter", label: "Quarter" }]}
        />
        <ToolbarSeparator />
        <ToggleGroup
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: "Grid view", icon: Grid2x2, iconOnly: true },
            { value: "list", label: "List view", icon: List, iconOnly: true },
          ]}
        />
        <ToolbarSeparator />
        <Button>Fit to window</Button>
      </Toolbar>
      <Switch label="Show elevation profile" defaultOn />
    </div>
  );
}

/** A preview toolbar: toggles, two single-choice groups and a plain action, with a switch for an immediate setting below. */
export const Preview: Story = { render: () => <PreviewBar /> };

/** At `data-density="compact"` every control takes the compact height. */
export const Compact: Story = { render: () => <PreviewBar density="compact" /> };

/** At phone width the toolbar wraps onto more lines rather than hiding controls. */
export const Phone: Story = { tags: ["visual-phone"], render: () => <PreviewBar /> };

/** Toggle in each state: off, on, disabled off and on, with text, icon and text, and icon only. */
export const ToggleStates: Story = {
  render: () => (
    <div className="grid gap-3">
      <Toolbar label="Off">
        <Toggle label="Grid" />
        <Toggle label="Grid" icon={Grid2x2} />
        <Toggle label="Grid" icon={Grid2x2} iconOnly />
        <Toggle label="Grid" disabled />
      </Toolbar>
      <Toolbar label="On">
        <Toggle label="Grid" defaultPressed />
        <Toggle label="Grid" icon={Grid2x2} defaultPressed />
        <Toggle label="Grid" icon={Grid2x2} iconOnly defaultPressed />
        <Toggle label="Grid" disabled defaultPressed />
      </Toolbar>
      <Toolbar label="With one filled button">
        <Toggle label="Grid" defaultPressed />
        <Button variant="default">Export</Button>
        <Toggle label="Square" icon={Square} size="sm" defaultPressed />
      </Toolbar>
    </div>
  ),
};

/** Switch: off, on, with a detail line, disabled. */
export const SwitchStates: Story = {
  render: () => (
    <div className="grid gap-3">
      <Switch label="Enable heatmap" />
      <Switch label="Enable heatmap" defaultOn />
      <Switch label="Show speed" detail="Metres per second along the route." defaultOn />
      <Switch label="Show distance" disabled />
      <Switch label="Show elevation" disabled defaultOn />
    </div>
  ),
};
