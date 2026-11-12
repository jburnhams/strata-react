import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Density, Pane, Split, Workspace, useWorkspaceState } from "../src";

// A screen of panes for a tool (issue #68, from strata-vid): library, stage and inspector across,
// a timeline along the bottom. Sizes here are in the stories' own state; an app passes `persist`
// to `useWorkspaceState` to remember them.

const meta = {
  title: "Layout/Workspace",
  parameters: { layout: "fullscreen" },
  tags: ["visual-wide"],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const Lines = ({ items }: { items: string[] }) => (
  <ul className="grid gap-1 p-3">
    {items.map((i) => (
      <li key={i} className="type-body-sm">{i}</li>
    ))}
  </ul>
);

function Editor({ collapsed = [], narrow }: { collapsed?: string[]; narrow?: number }) {
  const ws = useWorkspaceState();
  React.useEffect(() => {
    for (const id of collapsed) ws.setCollapsed(id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="h-140">
      <Workspace label="Video editor" state={ws} narrowBelow={narrow}>
        <div className="flex h-(--control-h) shrink-0 items-center justify-between border-b border-border px-3">
          <span className="type-label">Kiln reel</span>
          <Button size="sm" variant="default">Export</Button>
        </div>
        <Split direction="column">
          <Split direction="row">
            <Pane id="library" name="Library" size={260} min={180} max={420} collapsible>
              <Lines items={["Moonbeam.mp4", "Bisque load.mp4", "Glaze test.mp4", "Kiln 2 door.mp4"]} />
            </Pane>
            <Pane id="stage" name="Preview" grow>
              <div className="grid h-full place-items-center type-body text-muted-foreground">Frame 00:12:04</div>
            </Pane>
            <Pane id="inspector" name="Inspector" size={260} min={200} collapsible actions={<Button size="sm" variant="ghost">Reset</Button>}>
              <Lines items={["Position 12.0 s", "Duration 4.5 s", "Volume 80%"]} />
            </Pane>
          </Split>
          <Pane id="timeline" name="Timeline" size={180} min={120} collapsible>
            <Lines items={["Video 1: Moonbeam, Bisque load", "Audio 1: Voice"]} />
          </Pane>
        </Split>
      </Workspace>
    </div>
  );
}

/** Library, preview and inspector across, timeline below. Each pane is a region with the same header. */
export const ThreeColumnsAndBottom: Story = { render: () => <Editor /> };
/** A folded side pane leaves a rail with a visible Show button; the stage takes its space. */
export const CollapsedSidePane: Story = { render: () => <Editor collapsed={["library"]} /> };
/** A folded bottom pane is its header bar. */
export const CollapsedBottomPane: Story = { render: () => <Editor collapsed={["timeline"]} /> };
/** Compact density shrinks the headers and rails with every other control. */
export const CompactDensity: Story = { render: () => <Density value="compact"><Editor /></Density> };
/** Below 720px the splits stack and the collapsible panes start folded to their headers. */
export const PhoneWidth: Story = { tags: ["visual-phone"], render: () => <Editor narrow={720} /> };
