import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Bird, Cat, Dog, Fish, type LucideIcon } from "lucide-react";
import { ChoiceGrid, ChoiceGridSkeleton, type ChoiceState } from "../src";

// A grid of large picture tiles for answering one question with a tap (Flashtap's rounds for
// young children). The app owns the answer and each tile's state; these stories fix the states.
// Flashtap draws emoji in a bundled emoji face; here the pictures are icons, so the screenshots
// need no emoji font (a system one would differ by machine).

type Choice = { id: string; picture: React.ReactNode; word: string };
const animal = (id: string, Icon: LucideIcon): Choice => ({
  id,
  picture: <Icon aria-hidden className="size-16" strokeWidth={1.5} />,
  word: id,
});
const animals: Choice[] = [animal("dog", Dog), animal("cat", Cat), animal("fish", Fish), animal("bird", Bird)];
const numbers: Choice[] = [5, 3, 9, 2, 7, 1].map((n) => ({ id: `n${n}`, picture: String(n), word: String(n) }));
const marks = { wrong: "Not this one", right: "Right", answer: "This one" };

function Round({
  items = animals,
  states = {},
  size,
  stretch,
  beckon,
}: {
  items?: Choice[];
  states?: Record<string, ChoiceState>;
  size?: "md" | "lg";
  stretch?: boolean;
  beckon?: boolean;
}) {
  const [chosen, setChosen] = React.useState(states);
  return (
    <ChoiceGrid
      label="Find the cat"
      items={items}
      itemKey={(c) => c.id}
      itemLabel={(c) => c.word}
      renderPicture={(c) => c.picture}
      state={(c) => chosen[c.id] ?? "open"}
      marks={marks}
      onChoose={(c) => setChosen((s) => ({ ...s, [c.id]: c.id === "cat" || c.id === "n3" ? "right" : "wrong" }))}
      size={size}
      stretch={stretch}
      beckon={beckon}
    />
  );
}

function PickRound({ states = {} }: { states?: Record<string, ChoiceState> }) {
  const [chosen, setChosen] = React.useState(states);
  return (
    <ChoiceGrid
      label="Which one next?"
      items={animals}
      itemKey={(c) => c.id}
      itemLabel={(c) => c.word}
      renderPicture={(c) => c.picture}
      state={(c) => chosen[c.id] ?? "open"}
      marks={{ picked: "Picked" }}
      onChoose={(c) => setChosen({ [c.id]: "picked" })}
    />
  );
}

const meta = { title: "Data/ChoiceGrid", component: Round, parameters: { layout: "padded" } } satisfies Meta<
  typeof Round
>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new round: four open tiles, nothing drawn but the pictures. Tap one (the cat is right). */
export const Open: Story = {};

/** A wrong tap: greyed, its word under it, never red; the other tiles stay open. */
export const Wrong: Story = { args: { states: { dog: "wrong" } } };

/** The right tap: the success border and tint with its word; every tile is closed. */
export const Right: Story = { args: { states: { dog: "wrong", cat: "right" } } };

/** The tries ran out: the answer is shown with its own word. */
export const Answer: Story = { args: { states: { bird: "wrong", cat: "answer" } } };

/** A choice with no answer key ("Which one next?"): the tile picked is neutral, with its word, and the grid is closed. */
export const Picked: Story = {
  args: { states: { fish: "picked" } },
  render: (args) => <PickRound {...args} />,
};

/** Numerals for a counting question, at the larger tile size. */
export const Numbers: Story = { args: { items: numbers, size: "lg", states: { n5: "wrong" } } };

/** Stretched to fill a wide screen: four tiles share the row instead of keeping to their minimum on its left. */
export const Stretched: Story = { tags: ["visual-wide"], args: { stretch: true, size: "lg" } };

/** Beckoning: the open tiles swell one at a time in a random order, never a tried one, until the round is answered. */
export const Beckoning: Story = { tags: ["no-visual"], args: { beckon: true, states: { dog: "wrong" } } };

/** While the round loads. */
export const Loading: Story = { render: () => <ChoiceGridSkeleton count={4} /> };

/** On a phone: two tiles a row, each still well over the touch minimum. */
export const Phone: Story = { tags: ["visual-phone"], args: { states: { dog: "wrong" } } };
