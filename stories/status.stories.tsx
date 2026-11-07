import type { Meta, StoryObj } from "@storybook/react-vite";
import { Status } from "../src";
import { states } from "./fixtures/columns";

const meta = {
  title: "Status and figures/Status",
  component: Status,
  args: { tone: "success", children: "Ready to collect" },
} satisfies Meta<typeof Status>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

/** A product maps its states onto tones once. Every status is a word; colour is never alone. */
export const ProductStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {Object.entries(states).map(([key, s]) => (
        <Status key={key} tone={s.tone} icon={s.icon}>
          {s.label}
        </Status>
      ))}
      <Status tone="info">Scheduled</Status>
    </div>
  ),
};
