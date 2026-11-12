import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installFakeIntersectionObserver, renderWithStrata } from "../../src/testing";
import { CompareVideoGrid, type Candidate, type VideoMedia } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// jsdom has no media engine: tests/utils/media.ts plays the browser's decoder. The elements' events,
// the shared clock and the grid are the real ones.

let media: FakeMedia;
let io: ReturnType<typeof installFakeIntersectionObserver>;
beforeEach(() => {
  media = installFakeMedia();
  io = installFakeIntersectionObserver();
});
afterEach(() => {
  media.uninstall();
  io.uninstall();
});

const clip = (id: string, label: string, note?: string): Candidate<VideoMedia> => ({ id, label, note, media: { kind: "video", src: `/clips/${label}.mp4`, width: 1440, height: 1080, fps: 25 } });
const source = clip("source", "Source", "Original, 360×270");
const items = [clip("model-x", "A", "secret-note"), clip("model-y", "B"), clip("model-z", "C")];
const el = (label: string) => screen.getByLabelText(`Video ${label}`) as HTMLVideoElement;
// The fake observer reports nothing until told, so a cell is "out of sight" until `show`.
const show = (labels: string[]) => act(() => labels.forEach((l) => io.intersect(el(l).closest("figure")!, true)));
const load = (labels: string[]) => {
  show(labels);
  act(() => labels.forEach((l) => media.loaded(el(l), 10)));
};

function Harness(props: Partial<React.ComponentProps<typeof CompareVideoGrid>>) {
  return <CompareVideoGrid label="Three upscales of this clip" items={items} blind missing="Video not found" {...props} />;
}

describe("CompareVideoGrid", () => {
  it("plays every cell on one transport and keeps the sound off", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B", "C"]);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    for (const l of ["A", "B", "C"]) expect(el(l).paused).toBe(false);
    for (const l of ["A", "B", "C"]) expect(el(l).muted || el(l).volume === 0).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    for (const l of ["A", "B", "C"]) expect(el(l).paused).toBe(true);
  });

  it("seeks and sets the speed for every cell", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B", "C"]);
    await userEvent.keyboard("l");
    for (const l of ["A", "B", "C"]) expect(el(l).currentTime).toBe(1);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Playback speed" }), "0.5×");
    for (const l of ["A", "B", "C"]) expect(el(l).playbackRate).toBe(0.5);
  });

  it("loads only metadata until the first play", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B", "C"]);
    expect(el("A").preload).toBe("metadata");
    await userEvent.keyboard(" ");
    expect(el("A").preload).toBe("auto");
  });

  it("marks a cell that falls behind, and takes the mark away when it catches up", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B", "C"]);
    await userEvent.keyboard(" ");
    act(() => {
      media.tick(el("A"), 4);
      media.tick(el("B"), 4);
      media.tick(el("C"), 3.8); // 0.2 s behind, over two frames, under the 0.3 s that seeks it
    });
    expect(await screen.findByText("Catching up")).toBeInTheDocument();
    expect(screen.getAllByText("Catching up")).toHaveLength(1);
    act(() => media.tick(el("C"), 4));
    await waitFor(() => expect(screen.queryByText("Catching up")).toBeNull());
  });

  it("holds every cell while one has not got its frames, and goes on together", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B", "C"]);
    await userEvent.keyboard(" ");
    act(() => media.stall(el("C")));
    await waitFor(() => expect(el("A").paused).toBe(true));
    expect(el("B").paused).toBe(true);
    act(() => media.loaded(el("C"), 10));
    await waitFor(() => expect(el("A").paused).toBe(false));
  });

  it("pauses a cell scrolled out of sight and brings it back to the clock", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B", "C"]);
    await userEvent.keyboard(" ");
    act(() => io.intersect(el("C").closest("figure")!, false));
    expect(el("C").paused).toBe(true);
    expect(el("B").paused).toBe(false);
    act(() => media.tick(el("A"), 6));
    act(() => io.intersect(el("C").closest("figure")!, true));
    expect(el("C").currentTime).toBe(6);
    expect(el("C").paused).toBe(false);
  });

  it("puts the reference first, never blind, and drawn nearest-neighbour", () => {
    renderWithStrata(<Harness reference={source} />);
    const videos = screen.getAllByLabelText(/^Video /);
    expect(videos[0]).toBe(el("Source"));
    expect(screen.getByText(/Original, 360×270/)).toBeInTheDocument();
    expect(el("Source").style.imageRendering).toBe("pixelated");
    expect(el("A").style.imageRendering).toBe("");
  });

  it("never writes the id or the note of a blind cell, and shows them when it is not blind", () => {
    const { container, rerender } = renderWithStrata(<Harness />);
    for (const secret of ["model-x", "model-y", "model-z", "secret-note"]) expect(container.innerHTML).not.toContain(secret);
    rerender(<Harness blind={false} />);
    expect(screen.getByText(/secret-note/)).toBeInTheDocument();
  });

  it("hears only the cell the screen names", async () => {
    renderWithStrata(<Harness audio="model-y" />);
    load(["A", "B", "C"]);
    await waitFor(() => expect(el("B").muted).toBe(false));
    expect(el("A").muted).toBe(true);
    expect(el("C").muted).toBe(true);
  });

  it("puts a screen's own actions under each candidate but not the reference", () => {
    renderWithStrata(<Harness reference={source} actions={(c) => <button type="button">Pick {c.label}</button>} />);
    expect(screen.getByRole("button", { name: "Pick A" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pick Source" })).toBeNull();
  });

  it("draws nearest-neighbour always or never when asked", () => {
    const { rerender } = renderWithStrata(<Harness pixelated="always" />);
    for (const l of ["A", "B", "C"]) expect(el(l).style.imageRendering).toBe("pixelated");
    rerender(<Harness pixelated="never" reference={source} />);
    expect(el("A").style.imageRendering).toBe("");
    expect(el("Source").style.imageRendering).toBe("pixelated");
  });

  it("says in the product's words when a video cannot be loaded", () => {
    renderWithStrata(<Harness />);
    act(() => media.fail(el("B"), 4));
    expect(screen.getByRole("alert")).toHaveTextContent("Video not found");
  });

  it("takes extra shortcuts into the one legend, and a footer", async () => {
    let pressed = 0;
    renderWithStrata(<Harness extraShortcuts={[{ keys: ["a"], label: "Prefer A", run: () => void pressed++ }]} footer={<p>Vote bar</p>} />);
    await userEvent.keyboard("a");
    expect(pressed).toBe(1);
    expect(screen.getByText("Prefer A")).toBeInTheDocument();
    expect(screen.getByText("Vote bar")).toBeInTheDocument();
  });

  it("looks at a region in every cell", async () => {
    renderWithStrata(<Harness regions={[{ id: "face", label: "Face", box: [0.1, 0.1, 0.2, 0.2] }]} />);
    await userEvent.click(screen.getByRole("radio", { name: "Face" }));
    for (const l of ["A", "B", "C"]) expect(el(l).style.imageRendering).toBe("pixelated");
  });
  it("goes back to Play when the browser refuses to start", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B", "C"]);
    media.refuseNextPlay();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("keeps a cell that scrolls into view during a hold paused with the rest", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B"]);
    act(() => io.intersect(el("C").closest("figure")!, false));
    act(() => media.loaded(el("C"), 10));
    await userEvent.keyboard(" ");
    act(() => media.stall(el("B")));
    await waitFor(() => expect(el("A").paused).toBe(true));
    act(() => io.intersect(el("C").closest("figure")!, true));
    expect(el("C").paused).toBe(true);
  });

  it("does not start a hidden cell that finishes loading after play, and Pause stops it anyway", async () => {
    renderWithStrata(<Harness />);
    load(["A", "B"]);
    act(() => io.intersect(el("C").closest("figure")!, false));
    await userEvent.keyboard(" ");
    act(() => media.loaded(el("C"), 10));
    expect(el("C").paused).toBe(true);
  });
});
