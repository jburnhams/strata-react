import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MediaPlayer,
  PlayerNotice,
  SeekBar,
  SpanStrip,
  type MediaProgress,
  type SourceAttacher,
} from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// Issues #270, #271 and #272: spans in an app's own colours and under the browser's controls, a start time with
// "Picked up at" and Start over, and reports of how much was seen. The element's events are the real ones
// (tests/utils/media.ts plays the decoder).

let media: FakeMedia;
beforeEach(() => void (media = installFakeMedia()));
afterEach(() => media.uninstall());
const video = (c: HTMLElement) => c.querySelector("video") as HTMLVideoElement;

async function play(ui: React.ReactElement, duration = 100) {
  const user = userEvent.setup();
  const view = render(ui);
  const el = video(view.container);
  act(() => media.loaded(el, duration));
  await user.click(screen.getByRole("button", { name: "Play" }));
  return { ...view, user, el };
}
const run = (el: HTMLVideoElement, from: number, to: number) => {
  for (let t = from + 1; t <= to; t++) act(() => media.tick(el, t));
};

describe("progress (#272)", () => {
  it("counts each second once: a seek counts nothing and going back over a part adds nothing", async () => {
    const reports: MediaProgress[] = [];
    const { el, user } = await play(
      <MediaPlayer
        label="Ep"
        kind="video"
        src="/a.mp4"
        controls="strata"
        onProgress={(r) => reports.push(r)}
      />,
    );
    run(el, 0, 10);
    act(() => void (el.currentTime = 50)); // a seek: nothing for 10 to 50
    run(el, 50, 55);
    act(() => void (el.currentTime = 3)); // back over seconds already seen
    run(el, 3, 8);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(reports.at(-1)).toEqual({ position: 8, watched: 15, duration: 100, index: 0 });
  });

  it("reports every 15 s of playing, and not again while nothing has changed", async () => {
    const onProgress = vi.fn();
    const { el, user } = await play(
      <MediaPlayer
        label="Ep"
        kind="video"
        src="/a.mp4"
        controls="strata"
        onProgress={onProgress}
      />,
    );
    run(el, 0, 14);
    expect(onProgress).not.toHaveBeenCalled();
    run(el, 14, 15);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({
      position: 15,
      watched: 15,
      duration: 100,
      index: 0,
    });
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(onProgress).toHaveBeenCalledTimes(1); // the pause found the same numbers
  });

  it("reports at the end, when the page is hidden and when the player goes", async () => {
    const onProgress = vi.fn();
    const { el, unmount } = await play(
      <MediaPlayer
        label="Ep"
        kind="video"
        src="/a.mp4"
        controls="strata"
        onProgress={onProgress}
      />,
      20,
    );
    run(el, 0, 4);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 4, watched: 4 }),
    );
    run(el, 4, 6);
    unmount();
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 6, watched: 6 }),
    );
  });

  it("counts a span the player skipped as watched", async () => {
    const onProgress = vi.fn();
    const { el, user } = await play(
      <MediaPlayer
        label="Ep"
        kind="video"
        src="/a.mp4"
        controls="strata"
        onProgress={onProgress}
        spans={[{ start: 5, end: 12, kind: "intro" }]}
        spanKinds={{ intro: { label: "Intro", behaviour: "auto" } }}
      />,
    );
    run(el, 0, 4);
    act(() => media.tick(el, 5)); // reaches the intro: skipped to 12
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: 12, watched: 12 }),
    ); // 0 to 5 played, 5 to 12 skipped
  });

  it("starts again for another file, after reporting the first", async () => {
    const onProgress = vi.fn();
    const sources = [
      { src: "/1.mp4", title: "One" },
      { src: "/2.mp4", title: "Two" },
    ];
    const { el, rerender } = await play(
      <MediaPlayer
        label="Ep"
        kind="video"
        sources={sources}
        index={0}
        controls="strata"
        onProgress={onProgress}
      />,
    );
    run(el, 0, 6);
    rerender(
      <MediaPlayer
        label="Ep"
        kind="video"
        sources={sources}
        index={1}
        controls="strata"
        onProgress={onProgress}
      />,
    );
    expect(onProgress).toHaveBeenLastCalledWith({
      position: 6,
      watched: 6,
      duration: 100,
      index: 0,
    });
  });
});

describe("progress across files", () => {
  it("reports the file just left to the callback that was counting it", async () => {
    const calls: [string, MediaProgress][] = [];
    const sources = [
      { src: "/1.mp4", title: "One" },
      { src: "/2.mp4", title: "Two" },
    ];
    const Player = ({ id, index }: { id: string; index: number }) => (
      <MediaPlayer
        label="Ep"
        kind="video"
        sources={sources}
        index={index}
        controls="strata"
        onProgress={(r) => calls.push([id, r])}
      />
    );
    const { el, rerender } = await play(<Player id="A" index={0} />);
    run(el, 0, 6);
    rerender(<Player id="B" index={1} />);
    expect(calls.at(-1)?.[0]).toBe("A");
  });
});

describe("skips across files and StrictMode", () => {
  it("carries the part of a skipped span beyond a file boundary into the next file's count", async () => {
    const onProgress = vi.fn();
    const sources = [
      { src: "/1.mp4", title: "One", duration: 100 },
      { src: "/2.mp4", title: "Two", duration: 100 },
    ];
    const spans = [{ start: 90, end: 110, kind: "intro" }];
    const Player = ({ index }: { index: number }) => (
      <MediaPlayer
        label="Ep"
        kind="video"
        sources={sources}
        index={index}
        controls="strata"
        onProgress={onProgress}
        spans={spans}
        spanKinds={{ intro: { label: "Intro", behaviour: "auto" } }}
      />
    );
    const { el, rerender, user } = await play(<Player index={0} />);
    act(() => media.tick(el, 90)); // reaches the span: skipped into the second source at 10 s
    rerender(<Player index={1} />);
    act(() => media.loaded(el, 100));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ index: 1, watched: 10 }));
  });

  it("keeps the start for an attacher that is set up, torn down and set up again", () => {
    const starts: number[] = [];
    const attach: SourceAttacher = (_el, _src, context) => {
      starts.push(context.startAt);
      return { detach: () => undefined, reload: () => undefined };
    };
    render(
      <React.StrictMode>
        <MediaPlayer label="Ep" kind="video" src="/a.m3u8" attach={attach} start={42} />
      </React.StrictMode>,
    );
    expect(starts).toEqual([42, 42]);
  });
});

describe("start (#271)", () => {
  it("seeks a plain src once the metadata is in, and says so with Start over", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MediaPlayer label="Ep" kind="video" src="/a.mp4" controls="strata" start={125} />,
    );
    act(() => media.loaded(video(container), 300));
    expect(video(container).currentTime).toBe(125);
    const text = screen.getByText("Picked up at 2:05");
    expect(text.parentElement).toContainElement(screen.getByRole("button", { name: "Start over" }));
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(video(container).currentTime).toBe(0);
    expect(screen.queryByText("Picked up at 2:05")).not.toBeInTheDocument();
  });

  it("gives an attached stream the time as startAt, only for the first source", () => {
    const starts: number[] = [];
    const attach: SourceAttacher = (_el, _src, context) => {
      starts.push(context.startAt);
      return { detach: () => undefined, reload: () => undefined };
    };
    const { rerender } = render(
      <MediaPlayer label="Ep" kind="video" src="/a.m3u8" attach={attach} start={42} />,
    );
    rerender(<MediaPlayer label="Ep" kind="video" src="/b.m3u8" attach={attach} start={42} />);
    expect(starts).toEqual([42, 0]);
  });

  it("names the notice in the app's words, and drops it a few seconds into playing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { container } = render(
        <MediaPlayer
          label="Ep"
          kind="video"
          src="/a.mp4"
          controls="strata"
          start={65}
          resumeWords={{ pickedUp: (t) => `Resumed at ${t}`, startOver: "From the top" }}
        />,
      );
      act(() => media.loaded(video(container), 300));
      expect(screen.getByText("Resumed at 1:05")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Play" }));
      act(() => void vi.advanceTimersByTime(6100));
      expect(screen.queryByText("Resumed at 1:05")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("has no notice without a start", () => {
    render(<MediaPlayer label="Ep" kind="video" src="/a.mp4" controls="strata" start={0} />);
    expect(screen.queryByRole("button", { name: "Start over" })).not.toBeInTheDocument();
  });

  it("PlayerNotice is the notice itself, for an app's own overlay", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <PlayerNotice action="Undo" onAction={onAction}>
        Skipped ad
      </PlayerNotice>,
    );
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe("span colour and the strip (#270)", () => {
  it("a kind names a custom property of the theme and carries its kind", () => {
    render(
      <SeekBar
        time={0}
        duration={50}
        onSeek={() => undefined}
        spans={[
          { start: 5, end: 9, label: "Sponsor", kind: "sponsor", colour: "--seg-sponsor" },
          { start: 10, end: 12, label: "Intro", tone: "danger", colour: "red; background: url(x)" },
        ]}
      />,
    );
    const sponsor = screen.getByRole("img", { name: "Sponsor, 0:05 to 0:09" });
    expect(sponsor).toHaveAttribute("data-kind", "sponsor");
    expect(sponsor.style.backgroundColor).toBe("var(--seg-sponsor)");
    expect(sponsor.className).not.toContain("bg-info");
    const intro = screen.getByRole("img", { name: "Intro, 0:10 to 0:12" });
    expect(intro.style.backgroundColor).toBe(""); // not a custom property name: the tone is used
    expect(intro.className).toContain("bg-danger");
  });

  it("MediaPlayer passes a kind's colour to the bar", () => {
    const { container } = render(
      <MediaPlayer
        label="Ep"
        kind="video"
        src="/a.mp4"
        controls="strata"
        spans={[{ start: 5, end: 9, kind: "sponsor" }]}
        spanKinds={{ sponsor: { label: "Sponsor", colour: "--seg-sponsor" } }}
      />,
    );
    act(() => media.loaded(video(container), 100));
    expect(screen.getByRole("img", { name: "Sponsor, 0:05 to 0:09" })).toHaveAttribute(
      "data-kind",
      "sponsor",
    );
  });

  it("draws a strip of the spans under the browser's own controls, named like the bar's", () => {
    const { container } = render(
      <MediaPlayer
        label="Ep"
        kind="video"
        src="/a.mp4"
        controls="native"
        spans={[{ start: 5, end: 9, kind: "sponsor" }]}
        spanKinds={{ sponsor: { label: "Sponsor", colour: "--seg-sponsor" } }}
      />,
    );
    expect(screen.queryByRole("group", { name: "Marked parts of Ep" })).not.toBeInTheDocument(); // length not known yet
    act(() => media.loaded(video(container), 100));
    const strip = screen.getByRole("group", { name: "Marked parts of Ep" });
    expect(strip).toContainElement(screen.getByRole("img", { name: "Sponsor, 0:05 to 0:09" }));
  });

  it("SpanStrip draws nothing without spans or a length", () => {
    const { container } = render(<SpanStrip spans={[]} duration={50} />);
    expect(container).toBeEmptyDOMElement();
  });
});
