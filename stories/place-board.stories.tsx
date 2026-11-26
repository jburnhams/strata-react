import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Apple, Bird, Cat, Dog, Fish, ShoppingBasket, type LucideIcon } from "lucide-react";
import { PlaceBoard, type PlaceState } from "../src";

// Pictures put into places with two taps (Flashtap's give-N, order, match and sort rounds). The app
// owns where each piece is and checks it; these stories keep the placement in state and fix the
// checked states. Icons and numerals rather than emoji, so the screenshots need no emoji font.

type Piece = { id: string; picture: React.ReactNode; word: string };
type Place = { id: string; name: string; picture?: React.ReactNode };
const icon = (Icon: LucideIcon) => <Icon aria-hidden className="size-12" strokeWidth={1.5} />;
const numbers: Piece[] = [5, 2, 9, 4].map((n) => ({ id: `n${n}`, picture: String(n), word: String(n) }));
const order: Place[] = ["first", "second", "third", "fourth"].map((name) => ({ id: name, name }));
const apples: Piece[] = Array.from({ length: 6 }, (_, i) => ({ id: `apple${i}`, picture: icon(Apple), word: "apple" }));
const basket: Place[] = [{ id: "basket", name: "the basket", picture: icon(ShoppingBasket) }];
const pets: Piece[] = [
  { id: "dog", picture: icon(Dog), word: "dog" },
  { id: "cat", picture: icon(Cat), word: "cat" },
  { id: "fish", picture: icon(Fish), word: "fish" },
  { id: "bird", picture: icon(Bird), word: "bird" },
];
const sounds: Place[] = [
  { id: "d", name: "d", picture: "d" },
  { id: "f", name: "f", picture: "f" },
];
const marks = { held: "Picked up", right: "Right", wrong: "Not yet" };

function Board({
  label = "Put the numbers in order",
  pieces = numbers,
  places = order,
  pileLabel = "Numbers",
  initial = {},
  states = {},
  locked,
}: {
  label?: string;
  pieces?: Piece[];
  places?: Place[];
  pileLabel?: string;
  initial?: Record<string, string>;
  states?: Record<string, PlaceState>;
  locked?: boolean;
}) {
  const [placement, setPlacement] = React.useState<Record<string, string | undefined>>(initial);
  return (
    <PlaceBoard
      label={label}
      pieces={pieces}
      pieceKey={(p) => p.id}
      pieceLabel={(p) => p.word}
      renderPiece={(p) => p.picture}
      places={places}
      placeKey={(s) => s.id}
      placeLabel={(s) => s.name}
      renderPlace={places.some((s) => s.picture) ? (s) => s.picture : undefined}
      placement={placement}
      onMove={(piece, place) => setPlacement((m) => ({ ...m, [piece]: place ?? undefined }))}
      pileLabel={pileLabel}
      placeState={(s) => states[s.id] ?? "open"}
      marks={marks}
      locked={locked}
    />
  );
}

const meta = { title: "Data/PlaceBoard", component: Board, parameters: { layout: "padded" } } satisfies Meta<
  typeof Board
>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new round: the pieces in the pile, the places waiting (named by their words). Tap a number, then a place. */
export const Order: Story = {};

/** Partway: two numbers placed, one picked up (thick border and its word), and the places that take it outlined. */
export const Holding: Story = {
  args: { initial: { n2: "first", n4: "second" } },
  play: async ({ canvasElement }) => {
    const nine = [...canvasElement.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "9");
    nine?.click();
  },
};

/** Checked: right places get the success border and word, wrong ones a neutral outline and "Not yet", never red. */
export const Checked: Story = {
  args: {
    initial: { n2: "first", n4: "second", n9: "third", n5: "fourth" },
    states: { first: "right", second: "right", third: "wrong", fourth: "wrong" },
  },
};

/** Give a number: one basket, a pile of the same picture; the app counts what is in it. */
export const GiveN: Story = {
  args: {
    label: "Put 4 apples in the basket",
    pieces: apples,
    places: basket,
    pileLabel: "Apples",
    initial: { apple0: "basket", apple3: "basket" },
  },
};

/** Sort: places drawn as letters, pictures sorted by their first sound; done and locked. */
export const Sort: Story = {
  args: {
    label: "Sort by the first sound",
    pieces: pets,
    places: sounds,
    pileLabel: "Pictures",
    initial: { dog: "d", fish: "f" },
    states: { d: "right", f: "right" },
    locked: true,
  },
};

/** On a phone: places stack, pieces three to a row. */
export const Phone: Story = { tags: ["visual-phone"], args: { initial: { n2: "first" } } };
