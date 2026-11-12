import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installFakeIntersectionObserver, renderWithStrata } from "../../src/testing";
import { CompareVideo, CompareVideoGrid, type Candidate, type VideoMedia } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// Autoplay and loop the whole clip (issue #203), on the real clock; the fake decoder is tests/utils/media.ts.

let media: FakeMedia;
let io: ReturnType<typeof installFakeIntersectionObserver>;
const realMatchMedia = window.matchMedia;
beforeEach(() => {
  media = installFakeMedia();
  io = installFakeIntersectionObserver();
});
afterEach(() => {
  media.uninstall();
  io.uninstall();
  window.matchMedia = realMatchMedia;
});

const clip = (label: string): Candidate<VideoMedia> => ({ id: `id-${label}`, label, media: { kind: "video", src: `/clips/${label}.mp4`, width: 1440, height: 1080, fps: 25 } });
const el = (label: string) => screen.getByLabelText(`Video ${label}`) as HTMLVideoElement;
const load = (labels = ["A", "B"]) => act(() => labels.forEach((l) => media.loaded(el(l), 10)));
const reduceMotion = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
};

function Pair({ pair = ["A", "B"], ...props }: Partial<React.ComponentProps<typeof CompareVideo>> & { pair?: [string, string] }) {
  return <CompareVideo label="Pair" a={clip(pair[0])} b={clip(pair[1])} blind missing="Video not found" mode="side" onModeChange={() => undefined} {...props} />;
}

describe("autoPlay", () => {
  it("is off by default", () => {
    renderWithStrata(<Pair />);
    load();
    expect(el("A").paused).toBe(true);
  });

  it("starts both videos once both can play, and muted", async () => {
    renderWithStrata(<Pair autoPlay />);
    act(() => media.loaded(el("A"), 10));
    expect(el("A").paused).toBe(true); // waits for the other one: they start in step
    act(() => media.loaded(el("B"), 10));
    await waitFor(() => expect(el("A").paused).toBe(false));
    expect(el("B").paused).toBe(false);
    expect(el("A").muted).toBe(true);
    expect(el("B").muted).toBe(true);
  });

  it("stays paused when the browser refuses to play", async () => {
    renderWithStrata(<Pair autoPlay />);
    media.refuseNextPlay();
    load();
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument());
    expect(el("A").paused).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(el("A").paused).toBe(false);
  });

  it("starts the next pair from 0 and plays it again", async () => {
    const { rerender } = renderWithStrata(<Pair autoPlay />);
    load();
    await waitFor(() => expect(el("A").paused).toBe(false));
    act(() => media.tick(el("A"), 6));
    rerender(<Pair autoPlay pair={["C", "D"]} />);
    load(["C", "D"]);
    await waitFor(() => expect(el("C").paused).toBe(false));
    expect(el("C").currentTime).toBe(0);
  });

  it("does not play a new pair without autoPlay, and starts it at 0", async () => {
    const { rerender } = renderWithStrata(<Pair />);
    load();
    await userEvent.keyboard("l");
    rerender(<Pair pair={["C", "D"]} />);
    load(["C", "D"]);
    expect(el("C").paused).toBe(true);
    expect(el("C").currentTime).toBe(0);
  });

  it("keeps the sound the person chose", async () => {
    renderWithStrata(<Pair autoPlay audio="a" />);
    await userEvent.keyboard("m"); // mute, then unmute: a choice
    await userEvent.keyboard("m");
    load();
    await waitFor(() => expect(el("A").paused).toBe(false));
    expect(el("A").muted).toBe(false);
  });

  it("is off with reduced motion unless it is \"always\"", async () => {
    reduceMotion(true);
    const first = renderWithStrata(<Pair autoPlay />);
    load();
    expect(el("A").paused).toBe(true);
    first.unmount();
    renderWithStrata(<Pair autoPlay="always" />);
    load();
    await waitFor(() => expect(el("A").paused).toBe(false));
  });

  it("starts every cell of a grid on one clock", async () => {
    renderWithStrata(<CompareVideoGrid label="Three" items={[clip("A"), clip("B"), clip("C")]} blind missing="Video not found" autoPlay />);
    act(() => ["A", "B", "C"].forEach((l) => io.intersect(el(l).closest("figure")!, true)));
    load(["A", "B", "C"]);
    await waitFor(() => expect(el("A").paused).toBe(false));
    expect(el("C").paused).toBe(false);
  });
});

describe("loopWhole", () => {
  const start = async (props: Partial<React.ComponentProps<typeof CompareVideo>>) => {
    renderWithStrata(<Pair {...props} />);
    load();
    await userEvent.keyboard(" ");
  };

  it("ends the clip as before by default", async () => {
    await start({});
    act(() => media.end(el("A")));
    expect(el("A").paused).toBe(true);
  });

  it("starts again from 0 at the end of the clip and says so", async () => {
    await start({ loopWhole: true });
    expect(screen.getByText("Looping the whole clip")).toBeInTheDocument();
    act(() => {
      media.tick(el("A"), 9.9);
      media.end(el("A"));
    });
    await waitFor(() => expect(el("A").currentTime).toBe(0));
    expect(el("B").currentTime).toBe(0);
    expect(el("A").paused).toBe(false);
  });

  it("lets a range win while one is set, and returns to the whole clip when it is cleared", async () => {
    await start({ loopWhole: true });
    act(() => media.tick(el("A"), 2));
    await userEvent.keyboard("i");
    act(() => media.tick(el("A"), 4));
    await userEvent.keyboard("o");
    expect(screen.queryByText("Looping the whole clip")).not.toBeInTheDocument();
    act(() => media.end(el("A")));
    await waitFor(() => expect(el("A").currentTime).toBe(2));
    await userEvent.keyboard("c");
    expect(screen.getByText("Looping the whole clip")).toBeInTheDocument();
  });

  it("leaves a paused clip paused", async () => {
    await start({ loopWhole: true });
    await userEvent.keyboard(" ");
    act(() => media.end(el("A")));
    expect(el("A").paused).toBe(true);
  });
});
