import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Console, type ConsoleLine } from "../src";

// Issue #369: a console moved from the Quake 2 explorer. The first three stories rest (baselines); the
// last is the working one, with history and Tab.

const meta = { title: "Operate/Console", component: Console, parameters: { layout: "padded" }, args: { label: "Console", lines: [], onCommand: () => {} } } satisfies Meta<typeof Console>;
export default meta;
type Story = StoryObj<typeof meta>;

const session: ConsoleLine[] = [
  { id: 1, text: "Quake 2 0.9.4 ready" },
  { id: 2, level: "echo", text: "map base1" },
  { id: 3, text: "Loading maps/base1.bsp (1.1 MB)" },
  { id: 4, level: "warning", text: "Lightmap atlas is 4096 wide: some GPUs will scale it down" },
  { id: 5, level: "echo", text: "give railgun" },
  { id: 6, level: "error", text: "Unknown item “railgun”. Items: blaster, shotgun, machinegun, rocketlauncher" },
];

/** Output, a warning, an error and the echo of two commands. Warnings and errors start with a word; an echo starts with a prompt mark and is read as “Command:”. */
export const Session: Story = { args: { label: "Game console", lines: session, className: "max-w-3xl", lineHeight: 24 } };

/** Nothing written yet. */
export const Empty: Story = { args: { label: "Game console", lines: [], className: "max-w-3xl" } };

/** A long line wraps (lines are measured) instead of running off the edge. */
export const LongLine: Story = {
  args: {
    label: "Server console",
    lines: [{ id: 1, level: "info", text: "cvars: " + Array.from({ length: 40 }, (_, i) => `sv_option_${i}=${i * 3}`).join(" ") }],
    className: "max-w-xl",
  },
};

const COMMANDS = ["map", "maplist", "give", "noclip", "quit", "echo", "cvarlist"];
/** Working: Enter or Run sends, Up and Down walk the history, Tab completes (`ma` lists `map` and `maplist`). The history is kept under `historyKey`. Interactive. */
export const Working: Story = {
  tags: ["no-visual"],
  render: () => {
    const [lines, setLines] = React.useState<ConsoleLine[]>(session.slice(0, 1));
    return (
      <Console
        label="Game console"
        className="max-w-3xl"
        lines={lines}
        historyKey="strata-story-console"
        complete={(text) => COMMANDS.filter((c) => c.startsWith(text))}
        onCommand={(text) =>
          setLines((l) => [
            ...l,
            { id: l.length, level: "echo", text },
            COMMANDS.includes(text.split(" ")[0]!) ? { id: l.length + 1, text: `ok: ${text}` } : { id: l.length + 1, level: "error", text: `Unknown command “${text}”` },
          ])
        }
      />
    );
  },
};
