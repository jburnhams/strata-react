import type { Meta, StoryObj } from "@storybook/react-vite";
import { PakExplorer } from "./pak-explorer";

const meta = {
  title: "Screens/Quake 2 explorer",
  component: PakExplorer,
  parameters: { layout: "fullscreen" },
  tags: ["visual-wide"],
} satisfies Meta<typeof PakExplorer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A tool screen from the issues that came out of rebuilding the Quake 2 explorer: a bar with the tool's name, status, the one filled action and the scheme choice; a file tree whose folders open when pressed; the chosen texture's bytes and details; a console. Drop a PAK file anywhere on the window to see the overlay. */
export const Texture: Story = { args: {} };

/** A folder is not chosen: nothing is selected, and each pane says what to do. */
export const NothingChosen: Story = { args: { initialFile: "" } };

/** At phone width the panes stack and the collapsible ones start folded to their headers. */
export const PhoneWidth: Story = { tags: ["visual-phone"], args: { narrow: 720 } };
