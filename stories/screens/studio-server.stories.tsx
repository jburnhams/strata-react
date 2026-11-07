import type { Meta, StoryObj } from "@storybook/react-vite";
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
