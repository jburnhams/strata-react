import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Bird } from "lucide-react";
import { Button, Glimpse } from "../src";

// Something shown for a moment after a 3-2-1, then hidden (Flashtap's "How many did you see?"). The pictures are
// icons, so the screenshots need no emoji font. The live story counts and shows; the fixed ones are a look that
// stays up (an hour) and one that has gone with a look again left, which are what a screenshot can hold still.

const birds = (n: number) => (
  <div className="flex gap-4" aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <Bird key={i} className="size-16" strokeWidth={1.5} />
    ))}
  </div>
);

function Live({ ms, peeks }: { ms: number; peeks: number }) {
  const [again, setAgain] = React.useState(0);
  return (
    <div className="grid gap-6">
      <Glimpse ms={ms} again={again} peeks={peeks} gone="The pictures have gone.">
        {birds(3)}
      </Glimpse>
      <Button className="justify-self-center" onPress={() => setAgain((n) => n + 1)}>
        Answer wrong
      </Button>
    </div>
  );
}

const meta = {
  title: "Data/Glimpse",
  component: Glimpse,
  parameters: { layout: "padded" },
  args: { ms: 1500, gone: "The pictures have gone.", children: birds(3) },
} satisfies Meta<typeof Glimpse>;
export default meta;
type Story = StoryObj<typeof meta>;

/** 3, 2, 1, then the birds for 1.5 seconds with the bar emptying; one look again once they go. "Answer wrong" shows them again. */
export const Playing: Story = { tags: ["no-visual"], render: () => <Live ms={1500} peeks={1} /> };

/** While it shows: the pictures and, under them, the time left (an empty track once animations are finished). */
export const Showing: Story = { args: { count: 0, ms: 3_600_000 } };

/** Gone, with a look again left: the button sits where the pictures were, so nothing under it moves. */
export const LookAgain: Story = { args: { count: 0, ms: 10, peeks: 1 } };

/** Gone, with no looks again: the room is kept, empty (not shot: a screenshot of nothing is refused). */
export const Gone: Story = { tags: ["no-visual"], args: { count: 0, ms: 10 } };
