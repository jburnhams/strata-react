import type { Meta, StoryObj } from "@storybook/react-vite";
import { AsyncButton, fetchJson, useAsyncAction, type Phase } from "../src";
import { api, bookingConflict } from "./mocks/handlers";

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
  const { phase, run } = useAsyncAction(() => new Promise<void>((r) => setTimeout(r, 900)));
  return <AsyncButton variant="default" phase={phase} labels={labels} onClick={() => run()} />;
}

/** Click it: idle → pending → done → idle, with the outcome announced politely. */
export const Interactive: Story = { tags: ["no-visual"], render: () => <Live /> };

function LiveFailure() {
  const { phase, run, error } = useAsyncAction(() => fetchJson(api.bookings, { method: "POST", body: "{}" }));
  return (
    <div className="grid justify-items-start gap-2">
      <AsyncButton variant="default" phase={phase} labels={labels} error={error} onClick={() => run()} />
      {error && <p className="type-body-sm text-danger">{error}</p>}
    </div>
  );
}

/** Click it: the server answers 409, and the hook's `error` ("The request was refused (409): Conflict.") is announced with "Try again" and shown beside the button. */
export const InteractiveFailure: Story = {
  tags: ["no-visual"],
  beforeEach: ({ msw }) => msw.use(bookingConflict),
  render: () => <LiveFailure />,
};
