import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, PageHeader } from "../src";

const meta = {
  title: "Page/PageHeader",
  component: PageHeader,
  args: {
    title: "Kiln room",
    scope: "Thursday 5 November, 14:10",
    actions: <Button variant="default">Book a firing</Button>,
  },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The finding: the one fact in today's data that most needs attention, beside its action. */
export const WithFinding: Story = {
  args: {
    finding: {
      text: "Kiln 2 is cooling at 212 °C and will be safe to open at about 14:50. 14 pieces from 4 members are inside.",
      action: <Button size="sm">Tell me when it's open</Button>,
    },
  },
};

export const TitleOnly: Story = { args: { actions: undefined, scope: undefined } };
