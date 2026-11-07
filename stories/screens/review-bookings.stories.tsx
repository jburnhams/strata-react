import type { Meta, StoryObj } from "@storybook/react-vite";
import { bookingsEmpty, bookingsLoading, bookingsServerError } from "../mocks/handlers";
import { ReviewBookingsScreen } from "./review-bookings";

const meta = {
  title: "Screens/Bookings to check",
  component: ReviewBookingsScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ReviewBookingsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

/** j/k move, a approves, r returns, z undoes. Answering moves straight on to the next booking. */
export const Ready: Story = {};
/** The third booking is active: a rule in ink and a tint, and aria-current. */
export const ThirdActive: Story = { args: { initial: "b-2043" } };
export const Loading: Story = { beforeEach: ({ msw }) => msw.use(bookingsLoading) };
export const AllChecked: Story = { beforeEach: ({ msw }) => msw.use(bookingsEmpty) };
export const ServerError: Story = { beforeEach: ({ msw }) => msw.use(bookingsServerError) };
