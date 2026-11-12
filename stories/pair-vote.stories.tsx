import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState, PairVote, Skeleton, type CompareMode, type PairAnswer } from "../src";
import { renderingsLoading } from "./mocks/handlers";

// A blind pairwise judgment: the pictures from MSW (`/api/renderings/:variant`), the answer keys in
// Compare's one legend, and a vote bar with no filled button.

const a = { id: "final", label: "A", media: { kind: "image", src: "/api/renderings/final.svg", alt: "", size: [400, 300] } } as const;
const b = { id: "auto", label: "B", media: { kind: "image", src: "/api/renderings/auto.svg", alt: "", size: [400, 300] } } as const;
const ready = { status: "ready", data: { label: "Pair 3 of 12, two versions of one photo", a, b } } as const;

function Stateful(args: React.ComponentProps<typeof PairVote>) {
  const [mode, setMode] = React.useState<CompareMode>(args.mode);
  const [last, setLast] = React.useState<string | null>(null);
  const say = (x: PairAnswer) => setLast(x.answer === "flag" ? `Flagged: ${x.reason}` : `Answered ${x.answer}`);
  return (
    <div className="max-w-3xl">
      <PairVote {...args} mode={mode} onModeChange={setMode} onAnswer={say} last={last ? { text: last, onUndo: () => setLast(null) } : args.last} />
    </div>
  );
}

const meta = {
  title: "Data/PairVote",
  component: PairVote,
  render: (args) => <Stateful {...args} />,
  args: {
    pair: ready,
    blind: true,
    missing: "Picture not found",
    mode: "side",
    onModeChange: () => undefined,
    onAnswer: () => undefined,
    pending: false,
    progress: "12 pairs left",
    skeleton: <Skeleton className="h-72 w-full" />,
    empty: <EmptyState title="Nothing left to judge">Every pair in this set has your answer. Pick another set to keep going.</EmptyState>,
  },
} satisfies Meta<typeof PairVote>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Choose with `a`, `b`, `t` (about the same) or `s` (can't tell), or the buttons under the pictures. */
export const Blind: Story = {};

/** The flag menu, for pairs that should not count. */
export const WithFlag: Story = { args: { flagReasons: ["Picture missing", "Not the same scene"] } };

/** Saving the answer: buttons and keys off, said in words. */
export const Pending: Story = { args: { pending: true } };

/** The pair is on its way. */
export const Loading: Story = { args: { pair: { status: "loading" } }, parameters: { msw: { handlers: [renderingsLoading] } } };

/** Nothing left. */
export const Empty: Story = { args: { pair: { status: "ready", data: null } } };

/** The last answer, with Undo and what it was (shown only after the answer, never during). */
export const AfterAnswer: Story = { args: { last: { text: "You preferred A.", onUndo: () => undefined, reveal: <span>A was your final.</span> } } };
