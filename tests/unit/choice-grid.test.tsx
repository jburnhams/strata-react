import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoiceGrid, ChoiceGridSkeleton, cn, type ChoiceState } from "../../src";
import { renderWithStrata } from "../../src/testing";

// A grid of picture tiles for answering one question with a tap (Flashtap's rounds).

type Animal = { id: string; picture: string; word: string };
const animals: Animal[] = [
  { id: "pig", picture: "🐖", word: "pig" },
  { id: "cow", picture: "🐄", word: "cow" },
  { id: "duck", picture: "🦆", word: "duck" },
  { id: "lion", picture: "🦁", word: "lion" },
];
const marks = { wrong: "Not this one", right: "Right", answer: "This one" };

// The app's side of a round: it knows the answer and keeps each tile's state.
function Round({ answer = "cow", tries, onChoose = () => {} }: { answer?: string; tries?: number; onChoose?: (a: Animal) => void }) {
  const [tapped, setTapped] = React.useState<string[]>([]);
  const missed = tries !== undefined && !tapped.includes(answer) && tapped.length >= tries;
  const state = (a: Animal): ChoiceState =>
    tapped.includes(a.id) ? (a.id === answer ? "right" : "wrong") : missed && a.id === answer ? "answer" : "open";
  return (
    <ChoiceGrid
      label="Find the cow"
      items={animals}
      itemKey={(a) => a.id}
      itemLabel={(a) => a.word}
      renderPicture={(a) => a.picture}
      state={state}
      marks={marks}
      onChoose={(a) => {
        onChoose(a);
        setTapped((t) => [...t, a.id]);
      }}
    />
  );
}

const grid = () => screen.getByRole("grid", { name: "Find the cow" });
const tile = (name: string) => within(grid()).getByRole("row", { name });

describe("ChoiceGrid", () => {
  it("is a named grid of tiles named by what they show, with no word drawn on an open tile", () => {
    renderWithStrata(<Round />);
    expect(within(grid()).getAllByRole("row")).toHaveLength(4);
    expect(tile("cow")).toHaveTextContent("🐄");
    expect(tile("cow")).not.toHaveTextContent("cow");
    expect(within(grid()).queryByRole("checkbox")).toBeNull();
  });

  it("marks a wrong tap with its word, and that tile cannot be pressed again", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    renderWithStrata(<Round onChoose={onChoose} />);
    await user.click(tile("pig"));
    const pig = tile("pig, not this one");
    expect(pig).toHaveTextContent("Not this one");
    expect(pig).toHaveAttribute("aria-disabled", "true");
    await user.click(pig);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(tile("cow")).not.toHaveAttribute("aria-disabled");
  });

  it("closes every tile once the right one is tapped", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    renderWithStrata(<Round onChoose={onChoose} />);
    await user.click(tile("cow"));
    expect(tile("cow, right")).toHaveTextContent("Right");
    for (const row of within(grid()).getAllByRole("row")) expect(row).toHaveAttribute("aria-disabled", "true");
    await user.click(tile("duck"));
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it("shows the answer when the app says the tries ran out, and closes the rest", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Round tries={1} />);
    await user.click(tile("lion"));
    expect(tile("cow, this one")).toHaveTextContent("This one");
    expect(tile("duck")).toHaveAttribute("aria-disabled", "true");
  });

  it("answers from the keyboard: arrows move across, Enter taps", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    renderWithStrata(<Round onChoose={onChoose} />);
    await user.tab();
    expect(tile("pig")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(tile("cow")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChoose).toHaveBeenCalledWith(animals[1]);
  });

  it("skips answered tiles when moving by keyboard", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Round />);
    await user.click(tile("cow"));
    // cow is right: everything is closed, so nothing in the grid takes focus.
    await user.tab();
    expect(grid().contains(document.activeElement)).toBe(false);
  });

  it("has a skeleton of the same tiles, hidden from assistive technology", () => {
    const { container } = renderWithStrata(<ChoiceGridSkeleton count={6} size="lg" />);
    const skeleton = container.querySelector("[aria-hidden]")!;
    expect(skeleton.children).toHaveLength(6);
    expect((skeleton as HTMLElement).style.gridTemplateColumns).toContain("160px");
  });

  it("teaches cn that type-picture is a type step", () => {
    expect(cn("type-body", "type-picture")).toBe("type-picture");
  });
});
