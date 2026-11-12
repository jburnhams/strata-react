import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Composer, Conversation, type ConversationTurn } from "../src";

// Issue #192: a question-and-answer thread. The resting stories are the visual baselines; the live
// one streams an answer on a timer and is tagged `no-visual`.

const meta = { title: "Actions/Conversation", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const ids = ["f-0412", "f-0412-b", "k-2"];
const at = "2026-11-12T09:30:00Z";
const question: ConversationTurn = { id: "q1", role: "person", time: at, text: "Which firing ran hottest this week, and was it kiln 2?" };

function Frame({ turns, answering = false }: { turns: ConversationTurn[]; answering?: boolean }) {
  const [opened, setOpened] = React.useState<string | null>(null);
  return (
    <div className="flex h-[30rem] max-w-2xl flex-col gap-3">
      <Conversation label="Questions about the kiln" answerName="Assistant" turns={turns} entities={ids} onOpen={setOpened} onRetry={() => {}} empty={<p className="type-body-sm text-muted-foreground">Ask about a firing or a kiln.</p>} />
      {opened && <p className="type-caption text-muted-foreground">Opened {opened}</p>}
      <Composer label="Ask about the kiln" onSend={() => {}} onStop={() => {}} answering={answering} answeringReason="Waiting for the answer. Stop it to ask something else." suggestions={["Which firing ran hot?", "What is booked next week?"]} />
    </div>
  );
}

export const WithEntityLinks: Story = {
  render: () => (
    <Frame
      turns={[
        question,
        { id: "a1", role: "answer", time: at, state: "done", text: "The hottest was **firing f-0412-b** at 1,243 °C, in kiln `k-2`.\n\n- f-0412 reached 1,198 °C\n- f-0412-b held the peak for 40 minutes\n\nRead [the schedule](https://example.com/schedule) for what follows.", lookedUp: <p className="type-body-sm">Read 3 firings and the kiln 2 log.</p> },
      ]}
    />
  ),
};

export const Streaming: Story = {
  render: () => <Frame answering turns={[question, { id: "a1", role: "answer", time: at, state: "streaming", text: "The hottest was **firing f-0412-b** at 1,243 °C, in" }]} />,
};

export const Failed: Story = {
  render: () => <Frame turns={[question, { id: "a1", role: "answer", time: at, state: "failed", text: "", error: "The firing log did not answer in time, so nothing was looked up." }]} />,
};

export const Empty: Story = { render: () => <Frame turns={[]} /> };

/** Streams an answer word by word, then finishes it. */
export const Live: Story = {
  tags: ["no-visual"],
  render: () => {
    const words = "The hottest was **firing f-0412-b** at 1,243 °C, in kiln `k-2`.".split(" ");
    const [n, setN] = React.useState(0);
    React.useEffect(() => {
      if (n >= words.length) return;
      const timer = setTimeout(() => setN(n + 1), 250);
      return () => clearTimeout(timer);
    }, [n, words.length]);
    return <Frame answering={n < words.length} turns={[question, { id: "a1", role: "answer", time: at, state: n < words.length ? "streaming" : "done", text: words.slice(0, n).join(" ") }]} />;
  },
};
