import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStrata } from "../../src/testing";
import { CompareVideo, PairJudge, type Candidate, type VideoMedia, type VideoMode } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// jsdom has no media engine: tests/utils/media.ts plays the browser's decoder (and `stall` a
// decoder that has not got its next frames). The elements' events, useMediaElement, the clock and
// the component are the real ones.

let media: FakeMedia;
beforeEach(() => void (media = installFakeMedia()));
afterEach(() => media.uninstall());

const clip = (id: string, label: string, size: [number, number], note?: string): Candidate<VideoMedia> => ({ id, label, note, media: { kind: "video", src: `/clips/${label}.mp4`, width: size[0], height: size[1], fps: 25 } });
const a = clip("model-x", "A", [1440, 1080], "secret-note");
const b = clip("model-y", "B", [2816, 2304]);
const el = (label: string) => screen.getByLabelText(`Video ${label}`) as HTMLVideoElement;
const load = () => act(() => {
  media.loaded(el("A"), 10);
  media.loaded(el("B"), 10);
});

function Harness({ initial = "side", ...props }: Partial<React.ComponentProps<typeof CompareVideo>> & { initial?: VideoMode }) {
  const [mode, setMode] = React.useState<VideoMode>(initial);
  return <CompareVideo label="Pair 1, two upscales" a={a} b={b} blind missing="Video not found" mode={mode} onModeChange={setMode} {...props} />;
}

describe("CompareVideo", () => {
  it("plays and pauses both videos together", async () => {
    renderWithStrata(<Harness />);
    load();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(el("A").paused).toBe(false);
    expect(el("B").paused).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(el("A").paused).toBe(true);
    expect(el("B").paused).toBe(true);
  });

  it("seeks both to the same time, and sets both rates", async () => {
    renderWithStrata(<Harness />);
    load();
    await userEvent.keyboard("l");
    expect(el("A").currentTime).toBe(1);
    expect(el("B").currentTime).toBe(1);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Playback speed" }), "0.5×");
    expect(el("A").playbackRate).toBe(0.5);
    expect(el("B").playbackRate).toBe(0.5);
  });

  it("brings a follower that drifted back to the leader", async () => {
    renderWithStrata(<Harness />);
    load();
    await userEvent.keyboard(" ");
    act(() => {
      media.tick(el("A"), 4);
      media.tick(el("B"), 4.6);
    });
    await waitFor(() => expect(el("B").currentTime).toBe(4));
  });

  it("nudges the rate of a follower a few frames off instead of jumping", async () => {
    renderWithStrata(<Harness />);
    load();
    await userEvent.keyboard(" ");
    act(() => {
      media.tick(el("A"), 4);
      media.tick(el("B"), 4.1); // 2.5 frames ahead at 25 fps
    });
    await waitFor(() => expect(el("B").playbackRate).toBeCloseTo(0.97));
    expect(el("B").currentTime).toBe(4.1);
  });

  it("holds both while one is waiting for data, and carries on when it has it", async () => {
    renderWithStrata(<Harness />);
    load();
    await userEvent.keyboard(" ");
    act(() => media.stall(el("B")));
    await waitFor(() => expect(el("A").paused).toBe(true));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument(); // still wanted
    act(() => media.loaded(el("B"), 10));
    await waitFor(() => expect(el("A").paused).toBe(false));
    expect(el("B").paused).toBe(false);
  });

  it("stops the follower when the leader ends", async () => {
    renderWithStrata(<Harness />);
    load();
    await userEvent.keyboard(" ");
    act(() => media.end(el("A")));
    await waitFor(() => expect(el("B").paused).toBe(true));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("plays one soundtrack: A by default, the other muted, none or B on request", () => {
    const { rerender } = renderWithStrata(<Harness />);
    expect(el("A").muted).toBe(false);
    expect(el("B").muted).toBe(true);
    rerender(<Harness audio="b" />);
    expect(el("A").muted).toBe(true);
    expect(el("B").muted).toBe(false);
    rerender(<Harness audio="none" />);
    expect(el("A").muted).toBe(true);
    expect(el("B").muted).toBe(true);
    expect(screen.queryByRole("button", { name: "Mute" })).toBeNull();
  });

  it("draws both in the same box, shaped like A, whatever their pixel sizes", () => {
    renderWithStrata(<Harness initial="fade" />);
    const frame = screen.getByRole("group", { name: "A over B" });
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(1440 / 1080, 4);
    expect(el("A").className).toContain("object-contain");
    expect(el("B").className).toContain("object-contain");
  });

  it("offers swipe, fade and blink on the same two elements", async () => {
    renderWithStrata(<Harness />);
    await userEvent.keyboard("2");
    expect(screen.getByRole("slider", { name: "Divider between A and B" })).toBeInTheDocument();
    await userEvent.keyboard("3");
    expect(screen.getByRole("slider", { name: "Blend from A to B" })).toBeInTheDocument();
    await userEvent.keyboard("4");
    expect(screen.getByRole("radio", { name: "A" })).toBeChecked();
    await userEvent.keyboard("x");
    expect(screen.getByRole("radio", { name: "B" })).toBeChecked();
    expect(el("A").parentElement!.style.opacity).toBe("0");
  });

  it("keeps the time and keeps playing when the view changes", async () => {
    renderWithStrata(<Harness />);
    load();
    await userEvent.keyboard(" ");
    act(() => media.tick(el("A"), 3.5));
    await userEvent.keyboard("2");
    load(); // the new elements get their metadata
    expect(el("A").currentTime).toBe(3.5);
    expect(el("A").paused).toBe(false);
    expect(el("B").paused).toBe(false);
  });

  it("zooms both together", async () => {
    renderWithStrata(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const [fa, fb] = [screen.getByRole("group", { name: "Frame A" }), screen.getByRole("group", { name: "Frame B" })];
    expect(fa.firstElementChild).toHaveStyle({ transform: fb.firstElementChild!.getAttribute("style")!.match(/transform: ([^;]+)/)![1] });
    expect((fa.firstElementChild as HTMLElement).style.transform).toContain("scale(1.5");
  });

  it("draws real pixels on request, and not otherwise", () => {
    const { rerender } = renderWithStrata(<Harness pixelated="always" />);
    expect(el("A").style.imageRendering).toBe("pixelated");
    expect(el("B").style.imageRendering).toBe("pixelated");
    rerender(<Harness pixelated="never" />);
    expect(el("A").style.imageRendering).toBe("");
  });

  it("never writes the id or the note of a blind pair, and shows the note when it is not blind", () => {
    const { container, rerender } = renderWithStrata(<Harness />);
    for (const secret of ["model-x", "model-y", "secret-note"]) expect(container.innerHTML).not.toContain(secret);
    rerender(<Harness blind={false} />);
    expect(screen.getByText("secret-note")).toBeInTheDocument();
  });

  it("says in the product's words when a video cannot be loaded", () => {
    renderWithStrata(<Harness />);
    act(() => media.fail(el("B"), 4));
    expect(screen.getByRole("alert")).toHaveTextContent("Video not found");
  });

  it("takes the answer keys and the vote bar, as pictures do", async () => {
    let pressed = 0;
    renderWithStrata(<Harness extraShortcuts={[{ keys: ["a"], label: "Prefer A", run: () => pressed++ }]} footer={<p>Vote bar</p>} />);
    await userEvent.keyboard("a");
    expect(pressed).toBe(1);
    expect(screen.getByText("Prefer A")).toBeInTheDocument();
    expect(screen.getByText("Vote bar")).toBeInTheDocument();
  });

  it("serves PairJudge as its view", () => {
    renderWithStrata(
      <PairJudge
        pair={{ status: "ready", data: { label: "Pair 1", a, b } }}
        skeleton={<p>…</p>}
        empty={<p>Done</p>}
        onAnswer={() => undefined}
        pending={false}
        progress="3 left"
        view={(slot, pair) => <CompareVideo {...pair} {...slot} blind missing="Video not found" mode="side" onModeChange={() => undefined} />}
      />,
    );
    expect(screen.getByRole("button", { name: "Prefer A" })).toBeInTheDocument();
  });
});
