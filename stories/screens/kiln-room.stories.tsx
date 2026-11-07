import type { Meta, StoryObj } from "@storybook/react-vite";
import { bookingsLoading, bookingsServerError } from "../mocks/handlers";
import { KilnRoomScreen } from "./kiln-room";

const meta = {
  title: "Screens/Kiln room",
  component: KilnRoomScreen,
  parameters: { layout: "fullscreen" },
  tags: ["visual-wide"],
} satisfies Meta<typeof KilnRoomScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Loading: Story = { beforeEach: ({ msw }) => msw.use(bookingsLoading) };
export const ServerError: Story = { beforeEach: ({ msw }) => msw.use(bookingsServerError) };
export const Phone: Story = { tags: ["visual-phone"] };
