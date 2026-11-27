import { describe, expect, it, vi } from "vite-plus/test";
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
function Round({
  answer = "cow",
  tries,
  onChoose = () => {},
  beckon,
  stretch,
}: {
  answer?: string;
  tries?: number;
  onChoose?: (a: Animal) => void;
  beckon?: boolean;
  stretch?: boolean;
}) {
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
      beckon={beckon}
      beckonMs={100}
      stretch={stretch}
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

  it("draws a picked tile neutrally with its word and closes the grid, for a choice with no answer key (#306)", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    function Pick() {
      const [picked, setPicked] = React.useState<string | null>(null);
      return (
        <ChoiceGrid
          label="Which one next?"
          items={animals.slice(0, 2)}
          itemKey={(a) => a.id}
          itemLabel={(a) => a.word}
          renderPicture={(a) => a.picture}
          state={(a) => (picked === a.id ? "picked" : "open")}
          marks={{ picked: "Picked" }}
          onChoose={(a) => {
            onChoose(a);
            setPicked(a.id);
          }}
        />
      );
    }
    renderWithStrata(<Pick />);
    const g = screen.getByRole("grid", { name: "Which one next?" });
    await user.click(within(g).getByRole("row", { name: "pig" }));
    const pig = within(g).getByRole("row", { name: "pig, picked" });
    expect(pig).toHaveTextContent("Picked");
    expect(pig).toHaveAttribute("data-choice", "picked");
    expect(pig.className).not.toMatch(/success/);
    // A second tap cannot land while the app's request runs.
    expect(within(g).getByRole("row", { name: "cow" }).getAttribute("aria-disabled")).toBe("true");
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it("stretches its tiles to share the row only when asked", () => {
    const { unmount } = renderWithStrata(<Round />);
    expect(grid().style.gridTemplateColumns).toContain("auto-fill");
    unmount();
    renderWithStrata(<Round stretch />);
    expect(grid().style.gridTemplateColumns).toContain("auto-fit");
    renderWithStrata(<ChoiceGridSkeleton stretch />);
    expect(document.querySelector("[aria-hidden] > span")?.parentElement?.style.gridTemplateColumns).toContain(
      "auto-fit",
    );
  });

  it("beckons with one open tile at a time, never the same twice running, and never a tried one", async () => {
    const lit = () =>
      within(grid())
        .queryAllByRole("row")
        .filter((r) => r.hasAttribute("data-beckon"));
    const user = userEvent.setup();
    renderWithStrata(<Round beckon />);
    expect(lit()).toHaveLength(0); // the first pulse waits a beat
    await user.click(tile("duck"));
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      await vi.waitFor(() => {
        expect(lit()).toHaveLength(1);
        expect(lit()[0]?.getAttribute("aria-label")).not.toBe(seen.at(-1));
      });
      seen.push(lit()[0]?.getAttribute("aria-label") ?? "");
      expect(lit()[0]?.className).toMatch(/\bbeckon(-again)?\b/);
    }
    expect(seen).not.toContain("duck, not this one");
    expect(new Set(seen).size).toBeGreaterThan(1);
    await user.click(tile("cow"));
    expect(lit()).toHaveLength(0); // closed: no more pulses
    await new Promise((r) => setTimeout(r, 250));
    expect(lit()).toHaveLength(0);
  });

  it("beckons the last open tile again and again, and not at all unless asked", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithStrata(<Round beckon />);
    for (const name of ["pig", "duck", "lion"]) await user.click(tile(name));
    // Lit beat after beat, it alternates the pulse's two names, so the animation runs again each time.
    const names = new Set<string>();
    for (let i = 0; i < 4; i++) {
      await vi.waitFor(() => expect(grid().querySelector("[data-beckon]")).toBe(tile("cow")));
      names.add(tile("cow").classList.contains("beckon-again") ? "beckon-again" : "beckon");
      await new Promise((r) => setTimeout(r, 110));
    }
    expect(names).toEqual(new Set(["beckon", "beckon-again"]));
    unmount();
    renderWithStrata(<Round />);
    await new Promise((r) => setTimeout(r, 250));
    expect(grid().querySelector("[data-beckon]")).toBeNull();
  });

  it("caps each picture at its tile, so a large picture step cannot push it out", () => {
    renderWithStrata(<Round />);
    expect((tile("cow").querySelector("span[aria-hidden]") as HTMLElement).style.fontSize).toContain("75cqi");
    expect(tile("cow")).toHaveClass("@container");
  });
});
