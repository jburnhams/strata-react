import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStrata } from "../../src/testing";
import { Compare, CompareVideo, PairVote, type Candidate, type CompareMode, type ImageMedia, type PairAnswer, type VideoMedia, type VideoMode } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// Click to choose (issue #201): a click on the picture you prefer is the same answer as the key and
// the button. The layout shim gives every frame 640 × 280 at the origin, so x < 320 is the left half.
// The frame waits out the double-click window (300 ms) before it picks, so these wait for the call.

const img = (id: string, label: string): Candidate<ImageMedia> => ({ id, label, note: `note-${id}`, media: { kind: "image", src: `/img/${label}`, alt: `alt-${id}`, size: [1600, 1200] } });
const A = img("model-x", "A");
const B = img("model-y", "B");

function Pictures({ start = "side" as CompareMode, onPick, pick, blind = true }: { start?: CompareMode; onPick?: (side: "a" | "b") => void; pick?: boolean; blind?: boolean }) {
  const [mode, setMode] = React.useState<CompareMode>(start);
  return <Compare label="Pair 1" a={A} b={B} blind={blind} missing="Picture not found" mode={mode} onModeChange={setMode} onPick={onPick} pick={pick} />;
}

const frameA = () => screen.getByRole("group", { name: "Picture A" });
const frameB = () => screen.getByRole("group", { name: "Picture B" });
const settle = () => act(() => new Promise((r) => setTimeout(r, 400)));

describe("click to choose, pictures", () => {
  it("chooses the side clicked in side by side", async () => {
    const onPick = vi.fn();
    renderWithStrata(<Pictures onPick={onPick} />);
    await userEvent.click(frameB());
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("b"));
    await userEvent.click(frameA());
    await waitFor(() => expect(onPick).toHaveBeenLastCalledWith("a"));
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  it("chooses by the side of the divider in swipe", async () => {
    const onPick = vi.fn();
    renderWithStrata(<Pictures start="swipe" onPick={onPick} />);
    const frame = screen.getByRole("group", { name: "A over B" });
    await userEvent.pointer({ keys: "[MouseLeft]", target: frame, coords: { clientX: 100, clientY: 50 } });
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("a"));
    await userEvent.pointer({ keys: "[MouseLeft]", target: frame, coords: { clientX: 500, clientY: 50 } });
    await waitFor(() => expect(onPick).toHaveBeenLastCalledWith("b"));
  });

  it("chooses the side showing in blink", async () => {
    const onPick = vi.fn();
    renderWithStrata(<Pictures start="blink" onPick={onPick} />);
    await userEvent.click(screen.getByRole("group", { name: "Picture A" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("a"));
    await userEvent.keyboard("x");
    await userEvent.click(screen.getByRole("group", { name: "Picture B" }));
    await waitFor(() => expect(onPick).toHaveBeenLastCalledWith("b"));
  });

  it("does not choose in fade or difference, and says so", async () => {
    const onPick = vi.fn();
    renderWithStrata(<Pictures start="fade" onPick={onPick} />);
    await userEvent.click(screen.getByRole("group", { name: "A over B" }));
    await settle();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText(/A click does not choose in Fade/)).toBeInTheDocument();
  });

  it("treats a drag as a pan, not a choice", async () => {
    const onPick = vi.fn();
    renderWithStrata(<Pictures onPick={onPick} />);
    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: frameA(), coords: { clientX: 100, clientY: 50 } },
      { coords: { clientX: 140, clientY: 60 } },
      { keys: "[/MouseLeft]" },
    ]);
    await settle();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("treats a double click as a zoom, not a choice", async () => {
    const onPick = vi.fn();
    renderWithStrata(<Pictures onPick={onPick} />);
    await userEvent.dblClick(frameA());
    await settle();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("stays a plain viewer without onPick, or with pick off", async () => {
    const onPick = vi.fn();
    const { rerender } = renderWithStrata(<Pictures />);
    await userEvent.click(frameA());
    expect(frameA()).not.toHaveAttribute("aria-describedby");
    rerender(<Pictures onPick={onPick} pick={false} />);
    await userEvent.click(frameA());
    await settle();
    expect(onPick).not.toHaveBeenCalled();
    expect(frameA()).not.toHaveAttribute("aria-describedby");
  });

  it("describes the choice with labels only when blind, for the pointer and for a screen reader", async () => {
    const { container } = renderWithStrata(<Pictures onPick={() => undefined} />);
    expect(frameA()).toHaveAccessibleDescription("Click to choose A");
    await userEvent.hover(frameB());
    expect(screen.getAllByText("Click to choose B").length).toBeGreaterThan(0);
    for (const secret of ["model-x", "model-y", "note-model", "alt-model"]) expect(container.innerHTML).not.toContain(secret);
  });
});

describe("click to choose, a pair judgment", () => {
  const pair = { label: "Pair 1", a: A, b: B };
  const Vote = ({ pending = false, onAnswer }: { pending?: boolean; onAnswer: (a: PairAnswer) => void }) => (
    <PairVote pair={{ status: "ready", data: pair }} skeleton={<p>Loading</p>} empty={<p>Nothing left</p>} onAnswer={onAnswer} pending={pending} blind missing="Picture not found" mode="side" onModeChange={() => undefined} />
  );

  it("answers a click like the button", async () => {
    const onAnswer = vi.fn();
    renderWithStrata(<Vote onAnswer={onAnswer} />);
    await userEvent.click(frameB());
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({ answer: "b" }));
    await userEvent.click(frameA());
    await waitFor(() => expect(onAnswer).toHaveBeenLastCalledWith({ answer: "a" }));
  });

  it("drops a click while an answer is being saved", async () => {
    const onAnswer = vi.fn();
    renderWithStrata(<Vote pending onAnswer={onAnswer} />);
    await userEvent.click(frameA());
    await settle();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(frameA()).not.toHaveAttribute("aria-describedby");
  });
});

describe("click to choose, videos", () => {
  let media: FakeMedia;
  beforeEach(() => void (media = installFakeMedia()));
  afterEach(() => media.uninstall());
  const clip = (id: string, label: string): Candidate<VideoMedia> => ({ id, label, media: { kind: "video", src: `/clips/${label}.mp4`, width: 1440, height: 1080, fps: 25 } });
  const el = (label: string) => screen.getByLabelText(`Video ${label}`) as HTMLVideoElement;
  function Clips({ onPick, initial = "side" as VideoMode }: { onPick: (s: "a" | "b") => void; initial?: VideoMode }) {
    const [mode, setMode] = React.useState<VideoMode>(initial);
    return <CompareVideo label="Pair 1" a={clip("x", "A")} b={clip("y", "B")} blind missing="Video not found" mode={mode} onModeChange={setMode} onPick={onPick} />;
  }

  it("chooses a side while paused or playing, and does not play or pause", async () => {
    const onPick = vi.fn();
    renderWithStrata(<Clips onPick={onPick} />);
    act(() => {
      media.loaded(el("A"), 10);
      media.loaded(el("B"), 10);
    });
    await userEvent.click(screen.getByRole("group", { name: "Frame B" }));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("b"));
    expect(el("A").paused).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("group", { name: "Frame A" }));
    await waitFor(() => expect(onPick).toHaveBeenLastCalledWith("a"));
    expect(el("A").paused).toBe(false);
  });
});
