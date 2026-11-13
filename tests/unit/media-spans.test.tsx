import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaPlayer, SeekBar, type MediaElementState, type MediaSpanData, type SpanKind } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// Marked stretches (issue #207) and the player's state and overlay (issue #211). The element's events are
// the real ones (tests/utils/media.ts plays the decoder); the player, the clock of spans and the parts are ours.

let media: FakeMedia;
beforeEach(() => void (media = installFakeMedia()));
afterEach(() => media.uninstall());

const video = (c: HTMLElement) => c.querySelector("video") as HTMLVideoElement;
const kinds: Record<string, SpanKind> = {
  intro: { label: "Intro", behaviour: "auto", tone: "info" },
  recap: { label: "Recap", behaviour: "ask", tone: "warning" },
  credits: { label: "Credits", behaviour: "off" },
  sponsor: { label: "Sponsor", behaviour: "auto", tone: "danger" },
};

function Player(props: Partial<React.ComponentProps<typeof MediaPlayer>> & { spans?: MediaSpanData[] }) {
  return <MediaPlayer label="Episode 4" kind="video" src="/a.mp4" controls="strata" spanKinds={kinds} {...props} />;
}

async function start(ui: React.ReactElement, duration = 100) {
  const user = userEvent.setup();
  const view = render(ui);
  act(() => media.loaded(video(view.container), duration));
  await user.click(screen.getByRole("button", { name: "Play" }));
  return { ...view, user, el: video(view.container) };
}

describe("spans on the seek bar", () => {
  it("draws each stretch as a named range, in order, cut to the bar", () => {
    const { container } = render(<Player spans={[{ start: 60, end: 400, kind: "credits" }, { start: 0, end: 12, kind: "intro" }, { start: 30, end: 20, kind: "recap" }]} />);
    act(() => media.loaded(video(container), 100));
    const drawn = screen.getAllByRole("img").filter((e) => e.hasAttribute("data-span"));
    expect(drawn.map((e) => e.getAttribute("aria-label"))).toEqual(["Intro, 0:00 to 0:12", "Credits, 1:00 to 1:40"]); // the backwards one is dropped, the long one is cut to 100 s
    expect(drawn[0]).toHaveAttribute("title", "Intro, 0:00 to 0:12");
  });

  it("is a prop of the bar itself, for an app that uses the parts", () => {
    render(<SeekBar time={0} duration={50} onSeek={() => undefined} spans={[{ start: 5, end: 6, label: "Ad break", tone: "danger" }]} />);
    expect(screen.getByRole("img", { name: "Ad break, 0:05 to 0:06" })).toBeInTheDocument();
  });

  it("names a kind it was not told about from the kind itself, and only draws it", async () => {
    const { el } = await start(<Player spans={[{ start: 0, end: 12, kind: "interlude" }]} />);
    act(() => media.tick(el, 3));
    expect(screen.getByRole("img", { name: "Interlude, 0:00 to 0:12" })).toBeInTheDocument();
    expect(el.currentTime).toBe(3);
  });
});

describe("auto: skipped as it starts, with Undo", () => {
  const spans: MediaSpanData[] = [{ start: 5, end: 12, kind: "intro" }];

  it("skips to the end of the stretch, says so, and Undo goes back", async () => {
    const onSpan = vi.fn();
    const { el, user } = await start(<Player spans={spans} onSpan={onSpan} />);
    act(() => media.tick(el, 6));
    expect(el.currentTime).toBe(12);
    expect(onSpan).toHaveBeenCalledWith(spans[0], "skipped");
    const notice = screen.getByText("Skipped intro").parentElement!;
    await user.click(within(notice).getByRole("button", { name: "Undo" }));
    expect(el.currentTime).toBe(6);
    expect(onSpan).toHaveBeenLastCalledWith(spans[0], "undone");
    expect(screen.queryByText("Skipped intro")).not.toBeInTheDocument();
  });

  it("skips an intro that starts at zero as soon as playback starts", async () => {
    const { el } = await start(<Player spans={[{ start: 0, end: 12, kind: "intro" }]} />);
    expect(el.currentTime).toBe(12);
  });

  it("acts on a stretch once: after Undo it plays through, and is reported as played when it ends", async () => {
    const onSpan = vi.fn();
    const { el, user } = await start(<Player spans={spans} onSpan={onSpan} />);
    act(() => media.tick(el, 6));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    act(() => media.tick(el, 9));
    expect(el.currentTime).toBe(9);
    act(() => media.tick(el, 13));
    expect(onSpan.mock.calls.map((c) => c[1])).toEqual(["skipped", "undone", "played"]);
  });

  it("does not skip it again when playback goes back into it", async () => {
    const { el } = await start(<Player spans={spans} />);
    act(() => media.tick(el, 6));
    act(() => media.tick(el, 20));
    act(() => media.tick(el, 8));
    expect(el.currentTime).toBe(8);
  });

  it("does nothing while paused", async () => {
    const { el, user } = await start(<Player spans={spans} />);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    act(() => media.tick(el, 7));
    expect(el.currentTime).toBe(7);
  });

  it("waits for a growing source to have the end of the stretch before skipping into it", async () => {
    const { el } = await start(<Player spans={[{ start: 10, end: 40, kind: "intro" }]} growing={{}} />, 30);
    act(() => media.tick(el, 12));
    expect(el.currentTime).toBe(12);
    act(() => media.loaded(el, 60));
    expect(el.currentTime).toBe(40);
  });

  it("goes away after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { el } = await start(<Player spans={spans} />);
      act(() => media.tick(el, 6));
      expect(screen.getByText("Skipped intro")).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(6500));
      expect(screen.queryByText("Skipped intro")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("an app that writes its spans inline", () => {
  it("does not start a stretch over on each render", async () => {
    const view = render(<Player spans={[{ start: 5, end: 12, kind: "intro" }]} />);
    const el = video(view.container);
    act(() => media.loaded(el, 100));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    act(() => media.tick(el, 6));
    expect(el.currentTime).toBe(12);
    view.rerender(<Player spans={[{ start: 5, end: 12, kind: "intro" }]} />);
    act(() => media.tick(el, 8));
    expect(el.currentTime).toBe(8);
  });
});

describe("ask: a Skip button over the picture", () => {
  const spans: MediaSpanData[] = [{ start: 20, end: 40, kind: "recap" }];

  it("offers the button while the stretch plays, not before or after, and pressing it skips", async () => {
    const onSpan = vi.fn();
    const { el, user, container } = await start(<Player spans={spans} onSpan={onSpan} />);
    act(() => media.tick(el, 10));
    expect(screen.queryByRole("button", { name: "Skip recap" })).not.toBeInTheDocument();
    act(() => media.tick(el, 25));
    const button = screen.getByRole("button", { name: "Skip recap" });
    expect(container.querySelector("video")!.parentElement).toContainElement(button); // over the picture
    await user.click(button);
    expect(el.currentTime).toBe(40);
    expect(onSpan).toHaveBeenCalledWith(spans[0], "skipped");
    expect(screen.queryByRole("button", { name: "Skip recap" })).not.toBeInTheDocument();
    expect(screen.getByText("Skipped recap")).toBeInTheDocument();
  });

  it("is reached from the keyboard with S while it shows", async () => {
    const { el, user } = await start(<Player spans={spans} />);
    await user.keyboard("s");
    expect(el.currentTime).toBe(0); // nothing offered, nothing happens
    act(() => media.tick(el, 25));
    await user.keyboard("s");
    expect(el.currentTime).toBe(40);
  });

  it("reports a stretch that was offered and let play", async () => {
    const onSpan = vi.fn();
    const { el } = await start(<Player spans={spans} onSpan={onSpan} />);
    act(() => media.tick(el, 25));
    act(() => media.tick(el, 41));
    expect(onSpan).toHaveBeenCalledWith(spans[0], "played");
  });

  it("says it in the app's words", async () => {
    const { el } = await start(<Player spans={spans} spanWords={{ skip: (l) => `Passer ${l}` }} />);
    act(() => media.tick(el, 25));
    expect(screen.getByRole("button", { name: "Passer Recap" })).toBeInTheDocument();
  });
});

describe("off: only drawn", () => {
  it("offers nothing and does nothing", async () => {
    const { el } = await start(<Player spans={[{ start: 50, end: 60, kind: "credits" }]} />);
    act(() => media.tick(el, 55));
    expect(el.currentTime).toBe(55);
    expect(screen.queryByRole("button", { name: /Skip/ })).not.toBeInTheDocument();
  });
});

describe("mute: a stretch whose picture is wanted but whose sound is not", () => {
  const spans: MediaSpanData[] = [{ start: 10, end: 20, kind: "sponsor", action: "mute" }];

  it("mutes it as it starts, unmutes when playback leaves it, and keeps the position", async () => {
    const onSpan = vi.fn();
    const { el } = await start(<Player spans={spans} onSpan={onSpan} />);
    act(() => media.tick(el, 11));
    expect(el.muted).toBe(true);
    expect(el.currentTime).toBe(11);
    expect(screen.getByText("Muted sponsor")).toBeInTheDocument();
    act(() => media.tick(el, 21));
    expect(el.muted).toBe(false);
    expect(onSpan).toHaveBeenCalledWith(spans[0], "muted");
  });

  it("gives the sound back at once on Undo, and does not mute it again", async () => {
    const { el, user } = await start(<Player spans={spans} />);
    act(() => media.tick(el, 11));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(el.muted).toBe(false);
    act(() => media.tick(el, 15));
    expect(el.muted).toBe(false);
  });

  it("stays muted through a pause and resume inside the stretch", async () => {
    const { el, user } = await start(<Player spans={spans} />);
    act(() => media.tick(el, 11));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(el.muted).toBe(true);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(el.muted).toBe(true);
    act(() => media.tick(el, 21));
    expect(el.muted).toBe(false);
  });

  it("gives the sound back when the spans change or go away while it is muted", async () => {
    const { el, rerender } = await start(<Player spans={spans} />);
    act(() => media.tick(el, 11));
    expect(el.muted).toBe(true);
    rerender(<Player spans={[]} />);
    expect(el.muted).toBe(false);
  });
});

describe("the app's hold on the player (issue #211)", () => {
  it("hands out the state and requests through a ref, so a chapter list can seek", async () => {
    const ref = React.createRef<MediaElementState>() as React.MutableRefObject<MediaElementState | null>;
    const { el } = await start(<Player mediaRef={ref} />);
    expect(ref.current!.duration).toBe(100);
    act(() => ref.current!.seek(42));
    expect(el.currentTime).toBe(42);
    act(() => media.tick(el, 50));
    expect(ref.current!.time).toBe(50);
  });

  it("calls a function ref with the latest state", async () => {
    const seen: number[] = [];
    const { el } = await start(<Player mediaRef={(m) => void (m && seen.push(m.time))} />);
    act(() => media.tick(el, 7));
    expect(seen.at(-1)).toBe(7);
  });

  it("draws an overlay over the picture only, given the state, with its controls clickable", async () => {
    const seek = vi.fn();
    const { el, container } = await start(
      <Player
        overlay={(m) => (
          <button type="button" className="absolute top-3 left-3" onClick={() => seek(m.time)}>
            Comment at {Math.floor(m.time)}
          </button>
        )}
      />,
    );
    act(() => media.tick(el, 9));
    const button = screen.getByRole("button", { name: "Comment at 9" });
    expect(el.parentElement).toContainElement(button);
    expect(screen.getByRole("group", { name: "Episode 4" }).querySelector("[aria-label='Seek in Episode 4']")).not.toContainElement(button); // not among the controls
    await userEvent.click(button);
    expect(seek).toHaveBeenCalledWith(9);
    expect(container).toBeTruthy();
  });

  it("keeps a 16:9 box before the metadata loads, and the app's aspect when given", () => {
    const { container, rerender } = render(<Player />);
    expect(video(container).parentElement).toHaveStyle({ aspectRatio: String(16 / 9) });
    rerender(<Player aspect="4/3" />);
    expect(video(container).parentElement).toHaveStyle({ aspectRatio: "4/3" });
  });
});
