import type { Meta, StoryObj } from "@storybook/react-vite";
import { SystemPanel, type Load, type SystemInfoLike } from "../src";
import { systemInfo, systemInfoPlain, systemNow } from "./fixtures/system";

// About this server, from strata-python's `GET /api/system`: every strata app answers it alike, so
// every app can draw it alike. Each story fixes the read at one state.

const ready = (data: SystemInfoLike): Load<SystemInfoLike> => ({ status: "ready", data });

const meta = {
  title: "Status and figures/SystemPanel",
  component: SystemPanel,
  args: { load: ready(systemInfo), now: systemNow },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof SystemPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A healthy-looking server with its trouble named: a disk filling up and nearly full, a folder that is missing, a service down with the server's reason. */
export const WithTrouble: Story = { tags: ["visual-wide"] };
/** Nothing to report: one folder, no services, installed as a package so there is no commit. */
export const Plain: Story = { args: { load: ready(systemInfoPlain) } };
/** The app's own numbers beside the server's. */
export const WithFacts: Story = { args: { load: ready(systemInfoPlain), facts: [{ term: "Pieces kept", value: <span className="tabular-nums">1,284</span> }] } };
/** The first read has not come back: a skeleton shaped like the panel. */
export const Loading: Story = { args: { load: { status: "loading" } } };
/** The server did not answer and there is nothing to show yet. */
export const Failed: Story = { args: { load: { status: "error", message: "The server could not answer (503). Nothing was changed.", retry: () => undefined } } };
/** A refresh failed after a good read: the readings stay, with how old they are. */
export const Stale: Story = {
  args: { load: { status: "ready", data: systemInfo, stale: { message: "The server could not answer (503).", readAt: new Date("2026-11-24T09:41:00Z"), retry: () => undefined } } },
};
