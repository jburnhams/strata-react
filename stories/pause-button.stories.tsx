import type { Meta, StoryObj } from "@storybook/react-vite";
import { PauseButton, type Poll } from "../src";

// The control of a screen that reads again on its own: a "Pause updates" toggle and when it was last
// read. The live demo is a polled screen (the status page); these fix the three states.

const poll = (over: Partial<Poll>): Poll => {
  const made: Poll = {
    every: 5000,
    paused: false,
    toggle: () => undefined,
    updatedAt: new Date("2026-11-24T12:00:00Z"),
    note: () => undefined,
    with: (override) => ({ ...made, ...override }),
    ...over,
  };
  return made;
};

const meta = { title: "Status and figures/PauseButton", component: PauseButton, args: { poll: poll({}) } } satisfies Meta<typeof PauseButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Reading every few seconds: the time of the last read, and the button not pressed. */
export const Running: Story = {};
/** Paused: the button is pressed, and the line says when the readings are from. */
export const Paused: Story = { args: { poll: poll({ paused: true }) } };
/** Before the first answer. */
export const NotReadYet: Story = { args: { poll: poll({ updatedAt: null }) } };
/** Without the line, for a header that shows the time elsewhere. */
export const ButtonOnly: Story = { args: { hideUpdated: true } };
