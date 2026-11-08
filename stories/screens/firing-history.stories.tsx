import type { Meta, StoryObj } from "@storybook/react-vite";
import { firingWorkLoading, firingWorkServerError, firingsLoading } from "../mocks/handlers";
import { FiringHistoryScreen } from "./firing-history";

// The firing history opened from a link that names one firing (?open=f-0411): the URL is the
// open state, so the shot shows that firing's work under its row.
const meta = {
  title: "Screens/Firing history",
  component: FiringHistoryScreen,
  parameters: { layout: "fullscreen", route: "/firings?open=f-0411" },
  tags: ["visual-wide"],
} satisfies Meta<typeof FiringHistoryScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
/** Nothing open: no detail request has been made. */
export const AllClosed: Story = { parameters: { route: "/firings" } };
export const Loading: Story = { beforeEach: ({ msw }) => msw.use(firingsLoading) };
/** The firings arrived; the open firing's work is still on its way, so its detail row shows a skeleton. */
export const DetailLoading: Story = { beforeEach: ({ msw }) => msw.use(firingWorkLoading) };
/** The open firing's work failed: the error and Try again sit in its detail row, the rest of the table works. */
export const DetailError: Story = { beforeEach: ({ msw }) => msw.use(firingWorkServerError) };
export const Phone: Story = { tags: ["visual-phone"] };
