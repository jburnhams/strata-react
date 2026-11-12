import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MediaPlayer, SeekBar, useMediaElement, type MediaSource } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// Issue #134. jsdom has no media engine, so tests/utils/media.ts plays the browser's decoder;
// the hook, the element's events and the components are the real ones.

let media: FakeMedia;
beforeEach(() => void (media = installFakeMedia()));
afterEach(() => media.uninstall());

const chapters: MediaSource[] = [
  { src: "/one.mp3", title: "Chapter one", duration: 600 },
  { src: "/two.mp3", title: "Chapter two", duration: 300 },
  { src: "/three.mp3", title: "Chapter three", duration: 900 },
];
const audio = (container: HTMLElement) => container.querySelector("audio") as HTMLAudioElement;

describe("useMediaElement", () => {
  function Probe() {
    const ref = React.useRef<HTMLAudioElement>(null);
    const m = useMediaElement(ref);
    return (
      <div>
        <audio ref={ref} src="/a.mp3" />
        <output aria-label="state">{JSON.stringify({ playing: m.playing, time: m.time, duration: m.duration, volume: m.volume, ended: m.ended, error: m.error?.kind ?? null })}</output>
        <button onClick={m.toggle}>toggle</button>
        <button onClick={() => m.seek(42)}>seek</button>
        <button onClick={() => m.setVolume(0)}>mute</button>
        <button onClick={() => m.setVolume(30)}>quiet</button>
      </div>
    );
  }
  const read = () => JSON.parse(screen.getByLabelText("state").textContent!);

  it("reports no duration until the element knows it, then follows play, time and the end", async () => {
    const user = userEvent.setup();
    const { container } = render(<Probe />);
    expect(read().duration).toBeNull();
    await act(async () => media.loaded(audio(container), 120));
    expect(read().duration).toBe(120);
    await user.click(screen.getByText("toggle"));
    expect(read().playing).toBe(true);
    act(() => media.tick(audio(container), 7.5));
    expect(read().time).toBe(7.5);
    await user.click(screen.getByText("toggle"));
    expect(read().playing).toBe(false);
    await user.click(screen.getByText("toggle"));
    act(() => media.end(audio(container)));
    expect(read()).toMatchObject({ playing: false, ended: true });
  });

  it("treats an infinite or NaN duration (a stream) as not known", () => {
    const { container } = render(<Probe />);
    act(() => media.loaded(audio(container), Infinity));
    expect(read().duration).toBeNull();
  });

  it("applies a seek made before the metadata loaded once it has", async () => {
    const user = userEvent.setup();
    const { container } = render(<Probe />);
    await user.click(screen.getByText("seek"));
    expect(read().time).toBe(0);
    act(() => media.loaded(audio(container), 120));
    expect(read().time).toBe(42);
  });

  it("mutes at 0 and unmutes at the level it is given", async () => {
    const user = userEvent.setup();
    render(<Probe />);
    await user.click(screen.getByText("mute"));
    expect(read().volume).toBe(0);
    await user.click(screen.getByText("quiet"));
    expect(read().volume).toBe(30);
  });

  it("catches a refused play() into error, and clears it when playing starts", async () => {
    const user = userEvent.setup();
    render(<Probe />);
    media.refuseNextPlay();
    await user.click(screen.getByText("toggle"));
    expect(read()).toMatchObject({ playing: false, error: "blocked" });
    await user.click(screen.getByText("toggle"));
    expect(read()).toMatchObject({ playing: true, error: null });
  });

  it("reports a load failure from the element", () => {
    const { container } = render(<Probe />);
    act(() => media.fail(audio(container), 4));
    expect(read().error).toBe("load");
  });

  it("hands back values that spread into the parts", () => {
    const { result } = renderHook(() => useMediaElement({ current: null }));
    expect(result.current).toMatchObject({ playing: false, duration: null, time: 0 });
  });
});

describe("SeekBar with an unknown duration", () => {
  it("is disabled, with no moving thumb", () => {
    render(<SeekBar time={0} duration={null} onSeek={() => {}} />);
    expect(screen.getByRole("slider", { name: "Seek" })).toBeDisabled();
  });
});

describe("MediaPlayer", () => {
  it("plays and pauses from Strata's controls, and names the play button by state", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Interview" src="/a.mp3" controls="strata" />);
    act(() => media.loaded(audio(container), 125));
    expect(screen.getByRole("slider", { name: "Seek in Interview" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(media.plays).toBe(1);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("disables the seek bar until the duration is known", () => {
    render(<MediaPlayer label="Interview" src="/a.mp3" controls="strata" />);
    expect(screen.getByRole("slider", { name: "Seek in Interview" })).toBeDisabled();
  });

  it("plays and pauses with the space bar, and seeks with J and L", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Interview" src="/a.mp3" controls="strata" />);
    act(() => media.loaded(audio(container), 125));
    await user.keyboard(" ");
    expect(audio(container).paused).toBe(false);
    await user.keyboard("l");
    expect(audio(container).currentTime).toBe(10);
    await user.keyboard("j");
    expect(audio(container).currentTime).toBe(0);
  });

  it("leaves the keys alone when asked", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Interview" src="/a.mp3" controls="strata" shortcuts={false} />);
    await user.keyboard(" ");
    expect(audio(container).paused).toBe(true);
  });

  it("says a file could not be loaded and loads it again on Try again", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Interview" src="/a.mp3" controls="strata" />);
    act(() => media.fail(audio(container), 4));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load this recording");
    expect(alert).toHaveTextContent("not supported or the file is not there");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(media.loads).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says when the browser blocked playback, and does not offer a retry", async () => {
    const user = userEvent.setup();
    render(<MediaPlayer label="Interview" src="/a.mp3" controls="strata" />);
    media.refuseNextPlay();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("status")).toHaveTextContent("blocked");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("uses the browser's own bar for controls=native, and still reads the element", () => {
    const { container } = render(<MediaPlayer label="Interview" src="/a.mp3" controls="native" />);
    expect(audio(container)).toHaveAttribute("controls");
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("uses the browser's bar on a touch device when controls=auto, and Strata's on a desktop", () => {
    const original = window.matchMedia;
    const query = (coarse: boolean) => (q: string) => ({ matches: coarse && q.includes("coarse"), media: q, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
    try {
      window.matchMedia = query(true);
      const touch = render(<MediaPlayer label="Interview" src="/a.mp3" />);
      expect(audio(touch.container)).toHaveAttribute("controls");
      touch.unmount();
      window.matchMedia = query(false);
      const desk = render(<MediaPlayer label="Interview" src="/a.mp3" />);
      expect(audio(desk.container)).not.toHaveAttribute("controls");
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it("keeps the chosen speed when another source loads", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Book" sources={chapters} controls="strata" />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Playback speed" }), "1.5×");
    expect(audio(container).playbackRate).toBe(1.5);
    await user.click(screen.getByRole("button", { name: "Next chapter" }));
    audio(container).load();
    expect(audio(container).playbackRate).toBe(1.5);
  });

  it("follows the new element when the kind changes, and still advances chapters", () => {
    const { container, rerender } = render(<MediaPlayer label="Book" kind="audio" sources={chapters} controls="strata" />);
    rerender(<MediaPlayer label="Book" kind="video" sources={chapters} controls="strata" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(container.querySelector("audio")).toBeNull();
    act(() => media.loaded(video, 600));
    expect(screen.getByRole("slider", { name: "Seek in Book" })).toBeEnabled();
    act(() => media.end(video));
    expect(video.getAttribute("src")).toBe("/two.mp3");
  });

  describe("a sequence", () => {
    it("moves to the next source when one ends, on the same element, and keeps playing", async () => {
      const user = userEvent.setup();
      const { container } = render(<MediaPlayer label="Book" sources={chapters} controls="strata" />);
      const el = audio(container);
      act(() => media.loaded(el, 600));
      await user.click(screen.getByRole("button", { name: "Play" }));
      const plays = media.plays;
      act(() => media.end(el));
      expect(audio(container)).toBe(el);
      expect(el.getAttribute("src")).toBe("/two.mp3");
      expect(media.plays).toBe(plays + 1);
      expect(screen.getByText(/Chapter two \(2 of 3\)/)).toBeInTheDocument();
    });

    it("does not advance when autoAdvance is off, and says the last source ended", () => {
      let ended = 0;
      const { container } = render(<MediaPlayer label="Book" sources={chapters} controls="strata" autoAdvance={false} onEnded={() => ended++} />);
      act(() => media.loaded(audio(container), 600));
      act(() => media.end(audio(container)));
      expect(audio(container).getAttribute("src")).toBe("/one.mp3");
      expect(ended).toBe(1);
    });

    it("spans the whole sequence on the seek bar when every source has a duration, with marks at the chapters", () => {
      const { container } = render(<MediaPlayer label="Book" sources={chapters} controls="strata" />);
      act(() => media.loaded(audio(container), 600));
      expect(screen.getByRole("slider", { name: "Seek in Book" })).toHaveAttribute("max", "1800");
      expect(screen.getByRole("button", { name: /Chapter two, / })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Chapter three, / })).toBeInTheDocument();
    });

    it("seeks into another source by changing it, and carries on playing from there", async () => {
      const user = userEvent.setup();
      const { container } = render(<MediaPlayer label="Book" sources={chapters} controls="strata" />);
      const el = audio(container);
      act(() => media.loaded(el, 600));
      await user.click(screen.getByRole("button", { name: "Play" }));
      await user.click(screen.getByRole("button", { name: /Chapter three, / }));
      expect(el.getAttribute("src")).toBe("/three.mp3");
      act(() => media.loaded(el, 900));
      expect(el.currentTime).toBe(0);
      expect(el.paused).toBe(false);
    });

    it("steps with Previous and Next chapter, disabled at the ends", async () => {
      const user = userEvent.setup();
      let at = -1;
      render(<MediaPlayer label="Book" sources={chapters} controls="strata" onIndexChange={(i) => (at = i)} />);
      expect(screen.getByRole("button", { name: "Previous chapter" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Next chapter" }));
      expect(at).toBe(1);
      expect(screen.getByRole("button", { name: "Previous chapter" })).toBeEnabled();
    });

    it("follows an index the app holds", () => {
      const { container, rerender } = render(<MediaPlayer label="Book" sources={chapters} index={2} controls="strata" />);
      expect(audio(container).getAttribute("src")).toBe("/three.mp3");
      rerender(<MediaPlayer label="Book" sources={chapters} index={0} controls="strata" />);
      expect(audio(container).getAttribute("src")).toBe("/one.mp3");
    });
  });

  it("sets lock-screen metadata and clears it on unmount", () => {
    class FakeMetadata {
      constructor(public init: Record<string, unknown>) {}
    }
    const handlers = new Map<string, unknown>();
    const mediaSession = { metadata: null as unknown, setActionHandler: (a: string, h: unknown) => void (h ? handlers.set(a, h) : handlers.delete(a)) };
    Object.defineProperty(navigator, "mediaSession", { configurable: true, value: mediaSession });
    (globalThis as unknown as { MediaMetadata: unknown }).MediaMetadata = FakeMetadata;
    try {
      const { unmount } = render(<MediaPlayer label="Book" sources={chapters} controls="strata" session={{ title: "A book", artist: "Someone" }} />);
      expect((mediaSession.metadata as FakeMetadata).init).toMatchObject({ title: "Chapter one", artist: "Someone", album: "A book" });
      expect([...handlers.keys()].sort()).toEqual(["nexttrack", "pause", "play", "seekbackward", "seekforward"]);
      unmount();
      expect(mediaSession.metadata).toBeNull();
      expect(handlers.size).toBe(0);
    } finally {
      delete (navigator as unknown as Record<string, unknown>).mediaSession;
      delete (globalThis as unknown as Record<string, unknown>).MediaMetadata;
    }
  });
});
