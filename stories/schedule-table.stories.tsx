import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScheduleTable } from "../src";
import { schedule, systemNow } from "./fixtures/system";

// A machine's scheduled jobs (systemd timers, cron) on a status page: each one's last result as a
// word, when it last ran and when it runs next. Not the queue's `JobsTable`.

const meta = {
  title: "Status and figures/ScheduleTable",
  component: ScheduleTable,
  args: { caption: "Scheduled jobs", rows: schedule, now: systemNow },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScheduleTable>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Done, running, failed, never run, and a result word the table does not know. */
export const Default: Story = {};
/** On a phone the last-run and next-run columns drop, header and cells together. */
export const Phone: Story = { tags: ["visual-phone"] };
