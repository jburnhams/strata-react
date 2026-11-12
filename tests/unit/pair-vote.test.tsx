import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { filledButtons, renderWithStrata } from "../../src/testing";
import { PairVote, type Candidate, type CompareMode, type Pair, type PairAnswer } from "../../src";

const a: Candidate = { id: "model-x", label: "A", note: "secret-a", media: { kind: "image", src: "/api/renderings/final.svg", alt: "secret alt a", size: [400, 300] } };
const b: Candidate = { id: "model-y", label: "B", note: "secret-b", media: { kind: "image", src: "/api/renderings/auto.svg", alt: "secret alt b", size: [400, 300] } };
const pair: Pair = { label: "Pair 1 of 12", a, b };

function Harness({ pair: state = { status: "ready", data: pair } as const, pending = false, onAnswer = () => undefined, ...rest }: Partial<React.ComponentProps<typeof PairVote>>) {
  const [mode, setMode] = React.useState<CompareMode>("side");
  return (
    <PairVote
      pair={state}
      blind
      missing="Picture not found"
      mode={mode}
      onModeChange={setMode}
      skeleton={<p>Loading the next pair</p>}
      empty={<p>Nothing left to judge</p>}
      pending={pending}
      onAnswer={onAnswer}
      {...rest}
    />
  );
}

describe("PairVote", () => {
  it("answers with a side, about the same, can't tell, from buttons named by label only", async () => {
    const answers: PairAnswer[] = [];
    renderWithStrata(<Harness onAnswer={(x) => answers.push(x)} />);
    await userEvent.click(screen.getByRole("button", { name: "Prefer A" }));
    await userEvent.click(screen.getByRole("button", { name: "Prefer B" }));
    await userEvent.click(screen.getByRole("button", { name: "About the same" }));
    await userEvent.click(screen.getByRole("button", { name: "Can't tell" }));
    expect(answers).toEqual([{ answer: "a" }, { answer: "b" }, { answer: "tie" }, { answer: "skip" }]);
  });

  it("answers from the keyboard, and shows the keys in Compare's one legend", async () => {
    const answers: PairAnswer[] = [];
    renderWithStrata(<Harness onAnswer={(x) => answers.push(x)} />);
    await userEvent.keyboard("abts");
    expect(answers.map((x) => x.answer)).toEqual(["a", "b", "tie", "skip"]);
    // The answer keys and Compare's own sit in the same legend: "Prefer A" is there once as a key (and once as the button).
    expect(screen.getAllByText("Prefer A")).toHaveLength(2);
    expect(screen.getByText("Full screen")).toBeInTheDocument();
  });

  it("leaves the view, zoom and full-screen keys alone", async () => {
    const answers: PairAnswer[] = [];
    renderWithStrata(<Harness onAnswer={(x) => answers.push(x)} />);
    await userEvent.keyboard("12345+-0f{ArrowLeft}{ArrowRight}x");
    expect(answers).toEqual([]);
  });

  it("is off while an answer is pending, buttons and keys, and says so", async () => {
    const onAnswer = vi.fn();
    renderWithStrata(<Harness pending onAnswer={onAnswer} />);
    expect(screen.getByRole("button", { name: "Prefer A" })).toBeDisabled();
    await userEvent.keyboard("abts");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText("Saving your answer…")).toBeInTheDocument();
  });

  it("never writes the id, note or alt of a blind pair", () => {
    const { container } = renderWithStrata(<Harness flagReasons={["Picture missing"]} />);
    for (const secret of ["model-x", "model-y", "secret-a", "secret-b", "secret alt"]) expect(container.innerHTML).not.toContain(secret);
  });

  it("fills no button while either side can win", () => {
    renderWithStrata(<Harness />);
    expect(filledButtons()).toEqual([]);
  });

  it("flags a pair with a reason", async () => {
    const answers: PairAnswer[] = [];
    renderWithStrata(<Harness flagReasons={["Picture missing", "Not the same scene"]} onAnswer={(x) => answers.push(x)} />);
    await userEvent.click(screen.getByRole("button", { name: "Flag this pair" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Not the same scene" }));
    expect(answers).toEqual([{ answer: "flag", reason: "Not the same scene" }]);
  });

  it("has its own words for a pair on its way, nothing left, and a failed read", async () => {
    const retry = vi.fn();
    const { rerender } = renderWithStrata(<Harness pair={{ status: "loading" }} />);
    expect(screen.getByText("Loading the next pair")).toBeInTheDocument();
    rerender(<Harness pair={{ status: "ready", data: null }} />);
    expect(screen.getByText("Nothing left to judge")).toBeInTheDocument();
    rerender(<Harness pair={{ status: "error", message: "The pairs did not load.", retry }} />);
    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });

  it("shows a progress line and offers Undo for the last answer", async () => {
    const onUndo = vi.fn();
    renderWithStrata(<Harness progress="12 pairs left" last={{ text: "You preferred A.", onUndo, reveal: <span>A was model-x</span> }} />);
    expect(screen.getByText("12 pairs left")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
    expect(screen.getByText("A was model-x")).toBeInTheDocument();
  });

  it("fetches the next pictures ahead", () => {
    const made: string[] = [];
    const Real = globalThis.Image;
    globalThis.Image = class { set src(v: string) { made.push(v); } } as unknown as typeof Image;
    try {
      renderWithStrata(<Harness preload={["/next/a.svg", "/next/b.svg"]} />);
    } finally {
      globalThis.Image = Real;
    }
    expect(made).toEqual(["/next/a.svg", "/next/b.svg"]);
  });
});
