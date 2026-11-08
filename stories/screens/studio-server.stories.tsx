import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQueryClient } from "@tanstack/react-query";
import { serverStatus } from "../fixtures/server";
import { serverLoading, serverUnreachable } from "../mocks/handlers";
import { StudioServerScreen } from "./studio-server";

const meta = {
  title: "Screens/Studio server",
  component: StudioServerScreen,
  parameters: { layout: "fullscreen" },
  tags: ["visual-wide"],
} satisfies Meta<typeof StudioServerScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Loading: Story = { beforeEach: ({ msw }) => msw.use(serverLoading) };
export const Unreachable: Story = { beforeEach: ({ msw }) => msw.use(serverUnreachable) };
export const Phone: Story = { tags: ["visual-phone"] };

/** Puts readings taken at 13:50 on Saturday into the cache, as an earlier poll would have. */
function EarlierReadings({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  React.useState(() => client.setQueryData(["server"], serverStatus, { updatedAt: Date.UTC(2026, 10, 7, 13, 50) }));
  return children;
}

/** The status agent stopped answering after a good poll: the readings stay, with how old they are. */
export const ReadingsOld: Story = {
  name: "Readings old (poll failed)",
  beforeEach: ({ msw }) => msw.use(serverUnreachable),
  decorators: [(Story) => <EarlierReadings><Story /></EarlierReadings>],
};
