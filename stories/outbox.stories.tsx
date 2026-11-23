import type { Meta, StoryObj } from "@storybook/react-vite";
import { OutboxStatus, type Outbox, type OutboxSnapshot } from "../src";

// An outbox held in one state, so each story (and its baseline) shows that state with a fixed clock time. The
// real queue, its sending and its retries are tested in tests/unit/outbox.test.tsx.
function held(state: Partial<OutboxSnapshot>): Outbox {
  const snap: OutboxSnapshot = { waiting: 0, sending: false, problem: null, retryAt: null, refused: [], persisted: true, ...state };
  return {
    add: () => ({ id: "x", delivered: Promise.resolve("waiting") }),
    flush: () => Promise.resolve(),
    snapshot: () => snap,
    subscribe: () => () => {},
    dismiss: () => {},
    start: () => () => {},
  };
}

const at = new Date("2026-11-23T10:42:00Z");

const meta = {
  title: "Data/OutboxStatus",
  component: OutboxStatus,
  args: { noun: "firing booking", outbox: held({}) },
} satisfies Meta<typeof OutboxStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The server could not be reached: how many wait on this device, why, when it tries again, and Send now. */
export const Waiting: Story = {
  args: { outbox: held({ waiting: 3, problem: "The server could not be reached.", retryAt: at }) },
};

/** Sending what waited, once the connection is back. */
export const Sending: Story = {
  args: { outbox: held({ waiting: 3, sending: true }) },
};

/** No storage in this browser (a private window): said, because closing the page loses them. */
export const InThisPageOnly: Story = {
  args: { outbox: held({ waiting: 1, problem: "The server could not be reached.", retryAt: at, persisted: false }) },
};

/** The server refused one for good: listed with its reason until dismissed. */
export const Refused: Story = {
  args: {
    outbox: held({
      refused: [{ id: "a", label: "Kiln 2, Monday", reason: "Kiln 2 is already booked for Monday.", at: at.toISOString() }],
    }),
  },
};

/** Both at once: some still waiting, two refused. */
export const WaitingAndRefused: Story = {
  args: {
    outbox: held({
      waiting: 2,
      problem: "Sign in again to send them.",
      retryAt: at,
      refused: [
        { id: "a", label: "Kiln 2, Monday", reason: "Kiln 2 is already booked for Monday.", at: at.toISOString() },
        { id: "b", label: "Kiln 1, Tuesday", reason: "Kiln 1 is being repaired.", at: at.toISOString() },
      ],
    }),
  },
};
