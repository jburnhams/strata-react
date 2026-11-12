import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MediaPlayer, useAttachedSource, useMediaElement } from "../../src";
import { createHlsAttacher } from "../../src/hls";
import { installFakeMedia, type FakeMedia } from "../utils/media";
import { fakeHlsEngine } from "../utils/hls";

// Issue #179: streamed sources, and a stream that is still being made. The element's events are the
// real ones (tests/utils/media.ts plays the decoder); the engine is tests/utils/hls.ts, because the
// real one needs Media Source Extensions.

let media: FakeMedia;
beforeEach(() => void (media = installFakeMedia()));
afterEach(() => media.uninstall());
const video = (c: HTMLElement) => c.querySelector("video") as HTMLVideoElement;

describe("attachHls with the engine", () => {
  it("hands the element to the engine for a stream, and lets go when the source changes or the player goes", () => {
    const { Engine, log } = fakeHlsEngine();
    const attach = createHlsAttacher(Engine);
    const { container, rerender, unmount } = render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={attach} />);
    expect(log.created).toHaveLength(1);
    expect(log.created[0].source).toBe("/a.m3u8");
    expect(log.created[0].media).toBe(video(container));
    expect(video(container)).not.toHaveAttribute("src"); // the engine owns the element's source
    rerender(<MediaPlayer label="Preview" kind="video" src="/b.m3u8" attach={attach} />);
    expect(log.destroyed).toBe(1);
    expect(log.created).toHaveLength(2);
    expect(log.created[1].source).toBe("/b.m3u8");
    unmount();
    expect(log.destroyed).toBe(2);
  });

  it("moves the engine to the new element when the player switches between audio and video", () => {
    const { Engine, log } = fakeHlsEngine();
    const attach = createHlsAttacher(Engine);
    const { container, rerender } = render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={attach} />);
    rerender(<MediaPlayer label="Preview" kind="audio" src="/a.m3u8" attach={attach} />);
    expect(log.destroyed).toBe(1);
    expect(log.created).toHaveLength(2);
    expect(log.created[1].media).toBe(container.querySelector("audio"));
  });

  it("quietly recovers a dropped connection and a decoder hiccup, three times, and resets once a segment loads", () => {
    const { Engine, log } = fakeHlsEngine();
    render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine)} />);
    const hls = log.created[0];
    act(() => hls.fail("networkError"));
    act(() => hls.fail("mediaError"));
    expect([hls.startLoads, hls.recoveries]).toEqual([1, 1]);
    expect(screen.queryByText("Could not load this video")).not.toBeInTheDocument();
    act(() => hls.emit("hlsFragLoaded"));
    act(() => hls.fail("networkError"));
    act(() => hls.fail("networkError"));
    act(() => hls.fail("networkError"));
    expect(hls.startLoads).toBe(4);
    expect(screen.queryByText("Could not load this video")).not.toBeInTheDocument();
  });

  it("ignores errors that are not fatal", () => {
    const { Engine, log } = fakeHlsEngine();
    render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine)} />);
    act(() => log.created[0].fail("networkError", false));
    expect(log.created[0].startLoads).toBe(0);
    expect(screen.queryByText("Could not load this video")).not.toBeInTheDocument();
  });

  it("shows the player's load error when it cannot recover, and Try again restarts at the current time", async () => {
    const user = userEvent.setup();
    const { Engine, log } = fakeHlsEngine();
    const { container } = render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine)} controls="strata" />);
    act(() => media.loaded(video(container), 120));
    act(() => media.tick(video(container), 42));
    act(() => log.created[0].fail("otherError"));
    expect(screen.getByText("Could not load this video")).toBeInTheDocument();
    expect(screen.getByText("The stream could not be played.")).toBeInTheDocument();
    expect(log.destroyed).toBe(1);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(log.created).toHaveLength(2);
    expect(log.created[1].config.startPosition).toBe(42);
    expect(screen.queryByText("Could not load this video")).not.toBeInTheDocument();
  });

  it("says so when the browser cannot play streams at all", () => {
    const { Engine, FakeHls } = fakeHlsEngine();
    FakeHls.supported = false;
    render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine)} />);
    expect(screen.getByText("This browser cannot play this kind of stream.")).toBeInTheDocument();
  });

  it("uses the element's own HLS where the engine cannot run (no Media Source Extensions): no engine, the element's src", () => {
    const { Engine, FakeHls, log } = fakeHlsEngine();
    FakeHls.supported = false;
    const saved = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = () => "maybe";
    try {
      const { container, unmount } = render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine)} />);
      expect(log.created).toHaveLength(0);
      expect(video(container).getAttribute("src")).toBe("/a.m3u8");
      unmount();
    } finally {
      HTMLMediaElement.prototype.canPlayType = saved;
    }
  });
});

describe("prefer", () => {
  it("uses the engine by default even where the element plays HLS, and the element's own with prefer native", () => {
    const saved = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = () => "maybe";
    try {
      const a = fakeHlsEngine();
      render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(a.Engine)} />);
      expect(a.log.created).toHaveLength(1);
      const b = fakeHlsEngine();
      const { container } = render(<MediaPlayer label="Native" kind="video" src="/b.m3u8" attach={createHlsAttacher(b.Engine, { prefer: "native" })} />);
      expect(b.log.created).toHaveLength(0);
      expect(container.querySelector("video")!.getAttribute("src")).toBe("/b.m3u8");
    } finally {
      HTMLMediaElement.prototype.canPlayType = saved;
    }
  });
});

describe("a plain video the app owns", () => {
  function Plain({ src }: { src: string }) {
    const ref = React.useRef<HTMLVideoElement>(null);
    const m = useMediaElement(ref);
    const { Engine } = engineRef.current;
    useAttachedSource(ref, src, attacher.current ?? createHlsAttacher(Engine), m.reportProblem);
    return (
      <div>
        <video ref={ref} />
        <output aria-label="error">{m.error?.message ?? ""}</output>
      </div>
    );
  }
  const engineRef = { current: fakeHlsEngine() };
  const attacher = { current: null as ReturnType<typeof createHlsAttacher> | null };
  it("attaches with useAttachedSource and reports the engine's failure through useMediaElement", () => {
    engineRef.current = fakeHlsEngine();
    attacher.current = createHlsAttacher(engineRef.current.Engine);
    render(<Plain src="/c.m3u8" />);
    expect(engineRef.current.log.created[0].source).toBe("/c.m3u8");
    act(() => engineRef.current.log.created[0].fail("otherError"));
    expect(screen.getByLabelText("error")).toHaveTextContent("The stream could not be played.");
  });
});

describe("a stream that is still being made", () => {
  const sources = [{ src: "/film.m3u8", title: "Film", duration: 600 }];
  const props = { label: "Preview", kind: "video" as const, sources, controls: "strata" as const, growing: { status: "Scene 3 of 9" } };

  function seekable(el: HTMLMediaElement, end: number) {
    Object.defineProperty(el, "seekable", { configurable: true, value: { length: end > 0 ? 1 : 0, start: () => 0, end: () => end } });
    el.dispatchEvent(new Event("progress"));
  }

  it("says it is still being made with the app's progress, and draws the whole length with the ready part", () => {
    const { Engine } = fakeHlsEngine();
    const { container } = render(<MediaPlayer {...props} attach={createHlsAttacher(Engine)} />);
    expect(screen.getByText("Still being made")).toBeInTheDocument();
    expect(screen.getByText("Scene 3 of 9")).toBeInTheDocument();
    act(() => media.loaded(video(container), Infinity));
    act(() => seekable(video(container), 45));
    expect(screen.getByRole("slider", { name: "Seek in Preview" })).toHaveAttribute("max", "600"); // the whole length the app gave
  });

  it("without a whole length, the bar spans what exists and grows with it", () => {
    const { Engine } = fakeHlsEngine();
    const { container } = render(<MediaPlayer {...props} sources={[{ src: "/film.m3u8", title: "Film" }]} attach={createHlsAttacher(Engine)} />);
    act(() => media.loaded(video(container), Infinity));
    act(() => seekable(video(container), 45));
    expect(screen.getByRole("slider", { name: "Seek in Preview" })).toHaveAttribute("max", "45");
    act(() => seekable(video(container), 60));
    expect(screen.getByRole("slider", { name: "Seek in Preview" })).toHaveAttribute("max", "60");
  });

  it("catching up with the end is a wait, not an ending: it says so, does not call onEnded, and resumes when more arrives", async () => {
    const user = userEvent.setup();
    let ended = 0;
    const { Engine } = fakeHlsEngine();
    const { container } = render(<MediaPlayer {...props} sources={[{ src: "/film.m3u8", title: "Film" }]} attach={createHlsAttacher(Engine)} onEnded={() => ended++} />);
    const el = video(container);
    act(() => media.loaded(el, 30));
    await user.click(screen.getByRole("button", { name: "Play" }));
    act(() => media.end(el));
    expect(ended).toBe(0);
    expect(screen.getByText("Waiting for more to be made. It will carry on by itself.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    // More arrives: the duration grows and playback carries on from where it stopped.
    const plays = media.plays;
    act(() => media.loaded(el, 60));
    expect(media.plays).toBe(plays + 1);
    expect(screen.queryByText(/Waiting for more/)).not.toBeInTheDocument();
  });

  it("a finished source ends as ever", () => {
    let ended = 0;
    const { container } = render(<MediaPlayer label="Preview" kind="video" src="/film.mp4" onEnded={() => ended++} controls="strata" />);
    act(() => media.loaded(video(container), 30));
    act(() => media.end(video(container)));
    expect(ended).toBe(1);
  });
});

describe("where an HLS stream starts, and what its failures say (issue #208)", () => {
  it("starts a growing source at its beginning, not at the newest part hls.js would choose", () => {
    const { Engine, log } = fakeHlsEngine();
    render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine)} growing={{}} />);
    expect(log.created[0].config.startPosition).toBe(0);
  });

  it("lets hls.js choose for a source that is not growing", () => {
    const { Engine, log } = fakeHlsEngine();
    render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine)} />);
    expect(log.created[0].config.startPosition).toBe(-1);
  });

  it("honours the app's own startPosition on a first load, growing or not, and the time reached on a reload", async () => {
    const user = userEvent.setup();
    const { Engine, log } = fakeHlsEngine();
    const { container } = render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine, { config: { startPosition: 15 } })} growing={{}} controls="strata" />);
    expect(log.created[0].config.startPosition).toBe(15);
    act(() => media.loaded(video(container), 120));
    act(() => media.tick(video(container), 42));
    act(() => log.created[0].fail("otherError"));
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(log.created[1].config.startPosition).toBe(42);
  });

  it("says a failure in the app's words", () => {
    const { Engine, log } = fakeHlsEngine();
    render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine, { words: { other: "Open it in an up-to-date Chrome." } })} />);
    act(() => log.created[0].fail("otherError"));
    expect(screen.getByText("Open it in an up-to-date Chrome.")).toBeInTheDocument();
  });

  it("keeps the default words for the failures the app did not reword", () => {
    const { Engine, log } = fakeHlsEngine();
    render(<MediaPlayer label="Preview" kind="video" src="/a.m3u8" attach={createHlsAttacher(Engine, { words: { other: "x" } })} />);
    act(() => log.created[0].fail("mediaError"));
    for (let i = 0; i < 3; i++) act(() => log.created[0].fail("mediaError"));
    expect(screen.getByText("The stream could not be decoded.")).toBeInTheDocument();
  });
});
