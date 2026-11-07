import type { Meta, StoryObj } from "@storybook/react-vite";
import { AsyncButton, useAsyncAction, type Phase } from "../src";

const labels = { idle: "Book firing", pending: "Booking…", done: "Booked" };

const meta = {
  title: "Actions/AsyncButton",
  component: AsyncButton,
  args: { phase: "idle", labels, variant: "default" },
  argTypes: { phase: { control: "inline-radio", options: ["idle", "pending", "done", "error"] } },
} satisfies Meta<typeof AsyncButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One object through its states; the width never changes because every label shares one cell. */
export const Phases: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {(["idle", "pending", "done", "error"] as Phase[]).map((p) => (
        <AsyncButton key={p} {...args} phase={p} />
      ))}
    </div>
  ),
};

export const Idle: Story = {};
export const Pending: Story = { args: { phase: "pending" } };
export const Done: Story = { args: { phase: "done" } };
export const Failed: Story = { args: { phase: "error" } };

function Live() {
  const [phase, run] = useAsyncAction(() => new Promise<void>((r) => setTimeout(r, 900)));
  return <AsyncButton variant="default" phase={phase} labels={labels} onClick={() => run()} />;
}

/** Click it: idle → pending → done → idle, with the outcome announced politely. */
export const Interactive: Story = { tags: ["no-visual"], render: () => <Live /> };
