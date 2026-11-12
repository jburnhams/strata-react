import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStrata } from "../../src/testing";
import { CompareAudio, PairJudge, type AudioMedia, type Candidate, type Loudness } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// jsdom has no media engine, so tests/utils/media.ts plays the browser's decoder; the elements'
// events, `useMediaElement` and the component are the real ones.

let media: FakeMedia;
beforeEach(() => void (media = installFakeMedia()));
afterEach(() => media.uninstall());

const clip = (id: string, label: string, note?: string): Candidate<AudioMedia> => ({ id, label, note, media: { kind: "audio", src: `/clips/${label}.wav` } });
const a = clip("model-x", "A", "secret-note");
const b = clip("model-y", "B");
const levels: Record<string, Loudness> = { "/clips/A.wav": { rms: -20, peak: -6 }, "/clips/B.wav": { rms: -23, peak: -9 } };
const measure = async (src: string) => levels[src];
const audioOf = (label: string) => screen.getByLabelText(`Clip ${label}`) as HTMLAudioElement;

function load(durationA: number, durationB: number) {
  act(() => {
    media.loaded(audioOf("A"), durationA);
    media.loaded(audioOf("B"), durationB);
  });
}
function Harness(props: Partial<React.ComponentProps<typeof CompareAudio>>) {
  return <CompareAudio label="Pair 1, two clips" a={a} b={b} blind missing="Clip not found" measure={measure} {...props} />;
}

describe("CompareAudio", () => {
  it("plays only the chosen clip, and a switch carries the playhead over and keeps playing", async () => {
    renderWithStrata(<Harness />);
    load(10, 10);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => media.tick(audioOf("A"), 4.2));
    expect(audioOf("A").paused).toBe(false);
    expect(audioOf("B").paused).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(audioOf("A").paused).toBe(true);
    expect(audioOf("B").paused).toBe(false);
    expect(audioOf("B").currentTime).toBe(4.2);
  });

  it("does not start the other clip if it was paused", async () => {
    renderWithStrata(<Harness />);
    load(10, 10);
    act(() => media.tick(audioOf("A"), 3));
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(audioOf("B").paused).toBe(true);
    expect(audioOf("B").currentTime).toBe(3);
  });

  it("carries the same share of the clip over when the lengths differ, and the same time when they do not", async () => {
    renderWithStrata(<Harness />);
    load(10, 12);
    act(() => media.tick(audioOf("A"), 5));
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(audioOf("B").currentTime).toBeCloseTo(6); // half of 12
  });

  it("honours align=time even when the lengths differ", async () => {
    renderWithStrata(<Harness align="time" />);
    load(10, 12);
    act(() => media.tick(audioOf("A"), 5));
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(audioOf("B").currentTime).toBe(5);
  });

  it("keeps the same time for clips within 2% of each other", async () => {
    renderWithStrata(<Harness />);
    load(10, 10.1);
    act(() => media.tick(audioOf("A"), 5));
    await userEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(audioOf("B").currentTime).toBe(5);
  });

  it("switches from the keyboard: 1, 2 and x", async () => {
    renderWithStrata(<Harness />);
    load(10, 10);
    await userEvent.keyboard("2");
    expect(screen.getByRole("radio", { name: "B" })).toBeChecked();
    await userEvent.keyboard("x");
    expect(screen.getByRole("radio", { name: "A" })).toBeChecked();
    await userEvent.keyboard("1");
    expect(screen.getByRole("radio", { name: "A" })).toBeChecked();
  });

  it("matches loudness by turning the louder clip down, and says so by label", async () => {
    renderWithStrata(<Harness />);
    load(10, 10);
    expect(await screen.findByText("A is louder than B, so it is turned down by 3.0 dB.")).toBeInTheDocument();
    expect(audioOf("A").volume).toBeCloseTo(10 ** (-3 / 20), 3);
    expect(audioOf("B").volume).toBe(1);
  });

  it("leaves both clips alone when matching is switched off", async () => {
    renderWithStrata(<Harness />);
    load(10, 10);
    await screen.findByText(/turned down/);
    await userEvent.click(screen.getByRole("switch", { name: "Match loudness" }));
    expect(audioOf("A").volume).toBe(1);
    expect(screen.queryByText(/turned down/)).toBeNull();
  });

  it("says so when the levels cannot be measured, and plays them as they are", async () => {
    renderWithStrata(<Harness measure={async () => Promise.reject(new Error("no"))} />);
    expect(await screen.findByText("Could not measure the levels, so the clips are not matched.")).toBeInTheDocument();
    expect(audioOf("A").volume).toBe(1);
  });

  it("scales the volume control with the match", async () => {
    renderWithStrata(<Harness />);
    load(10, 10);
    await screen.findByText(/turned down/);
    await userEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(audioOf("A").volume).toBe(0);
    expect(audioOf("B").volume).toBe(0);
  });

  it("loops a range: sets the start and end at the playhead and goes back at the end", async () => {
    renderWithStrata(<Harness levelMatch={false} />);
    load(10, 10);
    act(() => media.tick(audioOf("A"), 2));
    await userEvent.click(screen.getByRole("button", { name: "Loop starts here" }));
    act(() => media.tick(audioOf("A"), 5));
    await userEvent.click(screen.getByRole("button", { name: "Loop ends here" }));
    expect(screen.getByText("Looping 0:02 to 0:05")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => media.tick(audioOf("A"), 5.1));
    expect(audioOf("A").currentTime).toBe(2);
    await userEvent.click(screen.getByRole("button", { name: "Clear the loop" }));
    expect(screen.getByText("No loop")).toBeInTheDocument();
    act(() => media.tick(audioOf("A"), 8));
    expect(audioOf("A").currentTime).toBe(8);
  });

  it("does not pull a paused playhead back into the loop", async () => {
    renderWithStrata(<Harness levelMatch={false} />);
    load(10, 10);
    await userEvent.keyboard("i");
    act(() => media.tick(audioOf("A"), 3));
    await userEvent.keyboard("o");
    act(() => media.tick(audioOf("A"), 6));
    expect(audioOf("A").currentTime).toBe(6);
  });

  it("lets playback run past the old end once the loop is cleared", async () => {
    renderWithStrata(<Harness levelMatch={false} />);
    load(10, 10);
    await userEvent.keyboard("i");
    act(() => media.tick(audioOf("A"), 3));
    await userEvent.keyboard("o");
    await userEvent.keyboard("c");
    await userEvent.keyboard(" ");
    act(() => media.tick(audioOf("A"), 8));
    expect(audioOf("A").currentTime).toBe(8);
  });

  it("keeps the loop at the same share of the other clip after a switch", async () => {
    renderWithStrata(<Harness levelMatch={false} />);
    load(10, 20);
    act(() => media.tick(audioOf("A"), 2));
    await userEvent.keyboard("i");
    act(() => media.tick(audioOf("A"), 4));
    await userEvent.keyboard("o");
    await userEvent.keyboard("2");
    await userEvent.keyboard(" ");
    act(() => media.tick(audioOf("B"), 8.5)); // 0.2 and 0.4 of B's 20 s are 4 and 8
    expect(audioOf("B").currentTime).toBe(4);
  });

  it("under align=time a loop keeps its seconds on a clip of another length", async () => {
    renderWithStrata(<Harness levelMatch={false} align="time" />);
    load(10, 20);
    act(() => media.tick(audioOf("A"), 2));
    await userEvent.keyboard("i");
    act(() => media.tick(audioOf("A"), 4));
    await userEvent.keyboard("o");
    await userEvent.keyboard("2");
    expect(screen.getByText("Looping 0:02 to 0:04")).toBeInTheDocument();
    await userEvent.keyboard(" ");
    act(() => media.tick(audioOf("B"), 4.5));
    expect(audioOf("B").currentTime).toBe(2);
  });

  it("a start after the end replaces the end", async () => {
    renderWithStrata(<Harness levelMatch={false} />);
    load(10, 10);
    act(() => media.tick(audioOf("A"), 2));
    await userEvent.keyboard("i");
    act(() => media.tick(audioOf("A"), 5));
    await userEvent.keyboard("o");
    act(() => media.tick(audioOf("A"), 7));
    await userEvent.keyboard("i");
    expect(screen.getByText("Loop starts at 0:07")).toBeInTheDocument();
  });

  it("never writes the id or the note of a blind pair, and shows them when it is not blind", () => {
    const { container, rerender } = renderWithStrata(<Harness />);
    for (const secret of ["model-x", "model-y", "secret-note"]) expect(container.innerHTML).not.toContain(secret);
    rerender(<Harness blind={false} />);
    expect(screen.getByText("A: secret-note")).toBeInTheDocument();
  });

  it("says in the product's words when a clip cannot be loaded", () => {
    renderWithStrata(<Harness />);
    act(() => media.fail(audioOf("B"), 4));
    expect(screen.getByRole("alert")).toHaveTextContent("Clip not found");
  });

  it("takes extra shortcuts into the one legend, and the vote bar into its footer", async () => {
    let pressed = 0;
    renderWithStrata(<Harness extraShortcuts={[{ keys: ["a"], label: "Prefer A", run: () => pressed++ }]} footer={<p>Vote bar</p>} />);
    await userEvent.keyboard("a");
    expect(pressed).toBe(1);
    expect(screen.getByText("Prefer A")).toBeInTheDocument();
    expect(screen.getByText("Vote bar")).toBeInTheDocument();
  });
});

describe("PairJudge around CompareAudio", () => {
  it("answers a pair of clips with the same keys and bar as pictures", async () => {
    const answers: string[] = [];
    renderWithStrata(
      <PairJudge
        pair={{ status: "ready", data: { label: "Pair 1 of 4", a, b } }}
        skeleton={<p>Loading</p>}
        empty={<p>None</p>}
        onAnswer={(x) => answers.push(x.answer)}
        pending={false}
        view={(slot, p) => <CompareAudio {...p} {...slot} blind missing="Clip not found" measure={measure} />}
      />,
    );
    await userEvent.keyboard("b");
    await userEvent.click(screen.getByRole("button", { name: "About the same" }));
    expect(answers).toEqual(["b", "tie"]);
  });
});
