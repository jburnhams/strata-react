import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { useLocation } from "react-router";
import { MediaPlayer, SeekBar, useMediaElement, usePlayerWarnings, type MediaSource } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";
import { renderWithStrata } from "../../src/testing";

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

  it("names the element after its kind so the group and the element differ (issue #147)", () => {
    const { container } = render(<MediaPlayer label="Interview" src="/a.mp3" controls="strata" />);
    expect(audio(container)).toHaveAttribute("aria-label", "Interview, audio");
    expect(screen.getByRole("group", { name: "Interview" })).toBeInTheDocument();
  });

  describe("several players on one screen (issue #147)", () => {
    const two = () =>
      render(
        <div>
          <MediaPlayer label="First" src="/a.mp3" controls="strata" />
          <MediaPlayer label="Second" src="/b.mp3" controls="strata" />
        </div>,
      );
    const el = (container: HTMLElement, i: number) => container.querySelectorAll("audio")[i] as HTMLAudioElement;

    it("warns once in development that several players share the keys", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const first = two();
        expect(warn).toHaveBeenCalledTimes(1);
        first.unmount();
        two();
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        warn.mockRestore();
      }
    });

    it("sends Space only to the player last played, then to the one pressed or focused", async () => {
      const user = userEvent.setup();
      const { container } = two();
      act(() => {
        media.loaded(el(container, 0), 100);
        media.loaded(el(container, 1), 100);
      });
      await user.click(within(screen.getByRole("group", { name: "First" })).getByRole("button", { name: /^play/i }));
      expect(el(container, 0).paused).toBe(false);
      expect(el(container, 1).paused).toBe(true);
      await user.keyboard(" ");
      expect(el(container, 0).paused).toBe(true);
      expect(el(container, 1).paused).toBe(true);
      await user.click(within(screen.getByRole("group", { name: "Second" })).getByRole("slider", { name: /seek/i }));
      await user.keyboard("k");
      expect(el(container, 1).paused).toBe(false);
      expect(el(container, 0).paused).toBe(true);
    });

    it("does not let a player with shortcuts off take the keys from the others", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <MediaPlayer label="First" src="/a.mp3" controls="strata" />
          <MediaPlayer label="Second" src="/b.mp3" controls="strata" />
          <MediaPlayer label="Third" src="/c.mp3" controls="strata" shortcuts={false} />
        </div>,
      );
      act(() => media.loaded(el(container, 0), 100));
      await user.click(within(screen.getByRole("group", { name: "First" })).getByRole("button", { name: /^play/i }));
      await user.click(within(screen.getByRole("group", { name: "Third" })).getByRole("slider", { name: /seek/i }));
      await user.keyboard(" ");
      expect(el(container, 0).paused).toBe(true);
    });

    it("leaves a player with shortcuts off out of it", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <MediaPlayer label="First" src="/a.mp3" controls="strata" />
          <MediaPlayer label="Second" src="/b.mp3" controls="strata" shortcuts={false} />
        </div>,
      );
      act(() => media.loaded(el(container, 0), 100));
      await user.keyboard(" ");
      expect(el(container, 0).paused).toBe(false);
    });
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
    await user.click(screen.getByRole("button", { name: /Playback speed/ }));
    await user.click(await screen.findByRole("option", { name: "1.5×" }));
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

    it("draws one file's own marks (its chapters) on the seek bar, and pressing one seeks there (#371)", async () => {
      const user = userEvent.setup();
      const marks = [{ time: 0, label: "Morning" }, { time: 600, label: "Dinner" }];
      const { container } = render(<MediaPlayer label="Tape" src="/tape.mp4" marks={marks} controls="strata" />);
      const el = audio(container) ?? (container.querySelector("video") as HTMLMediaElement);
      act(() => media.loaded(el, 1200));
      await user.click(screen.getByRole("button", { name: /^Dinner, / }));
      expect(el.currentTime).toBe(600);
    });

    it("keeps a window's own marks in place of the file's", () => {
      const { container } = render(<MediaPlayer label="Tape" src="/tape.mp4" window={{ start: 10, end: 20 }} showFull marks={[{ time: 600, label: "Dinner" }]} controls="strata" />);
      act(() => media.loaded(audio(container) ?? (container.querySelector("video") as HTMLMediaElement), 1200));
      expect(screen.queryByRole("button", { name: /^Dinner, / })).toBeNull();
      expect(screen.getByRole("button", { name: /^Window starts, / })).toBeInTheDocument();
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

it("shows independent player warnings in windowed mode and expires them on the configured timer", () => {
  vi.useFakeTimers();
  try {
    const { result } = renderHook(() => usePlayerWarnings());
    const { rerender } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" />);
    const message = { title: "Playback details unavailable", timeout: 900 };
    act(() => result.current.warn(message));
    rerender(<MediaPlayer label="Tour" kind="video" src="/a.mp4" warning={result.current.warning} />);
    const warning = screen.getByText(message.title);
    act(() => vi.advanceTimersByTime(899));
    expect(warning.closest("[data-leaving]")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(warning.closest("[data-leaving]")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(250));
    expect(warning).not.toBeInTheDocument();

    act(() => result.current.warn(message));
    rerender(<MediaPlayer label="Tour" kind="video" src="/a.mp4" warning={result.current.warning} />);
    expect(screen.getByText(message.title)).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

it.each(["Dismiss playback warning", "Try again"])("does not show an expired warning again after %s", (button) => {
  vi.useFakeTimers();
  try {
    const retry = vi.fn();
    render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" warning={{
      key: 1,
      title: "Playback details unavailable",
      timeout: 900,
      action: { label: "Try again", onPress: retry },
    }} />);
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(retry).toHaveBeenCalledTimes(button === "Try again" ? 1 : 0);
    act(() => vi.advanceTimersByTime(250));
    expect(screen.queryByText("Playback details unavailable")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(650));
    expect(screen.queryByText("Playback details unavailable")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

describe("MediaPlayer full screen", () => {
  it("offers Full screen on a video by default, and F toggles it, without mounting the video again", async () => {
    const user = userEvent.setup();
    let full: Element | null = null;
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { get: () => full, configurable: true });
    Element.prototype.requestFullscreen = function (this: Element) {
      full = this;
      return Promise.resolve();
    };
    document.exitFullscreen = () => {
      full = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    };
    try {
      const { container } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" status={<p role="status">Reading playback details</p>} />);
      const video = container.querySelector("video");
      await user.click(await screen.findByRole("button", { name: "Full screen" }));
      expect(full).not.toBeNull();
      expect(container.querySelector("video")).toBe(video);
      await user.click(screen.getByRole("button", { name: "Leave full screen" }));
      expect(full).toBeNull();
      await user.keyboard("f");
      expect(full).not.toBeNull();
      expect(container.querySelector("video")).toBe(video);
      // The speed's list opens inside the full-screen element, the only part of the page the browser shows.
      await user.click(screen.getByRole("button", { name: /Playback speed/ }));
      expect((full as Element | null)?.contains(await screen.findByRole("listbox"))).toBe(true);
      await user.keyboard("{Escape}");

      vi.useFakeTimers();
      try {
        const controls = screen.getByText("Reading playback details").parentElement!;
        expect(within(controls).getByRole("button", { name: "Leave full screen" })).toBeInTheDocument();
        const el = video!;
        act(() => media.loaded(el, 60));
        act(() => void el.play());
        act(() => vi.advanceTimersByTime(2999));
        expect(controls).not.toHaveClass("opacity-0");
        act(() => vi.advanceTimersByTime(1));
        expect(controls).toHaveClass("opacity-0");

        fireEvent.mouseMove(el);
        expect(controls).not.toHaveClass("opacity-0");
        act(() => vi.advanceTimersByTime(3000));
        expect(controls).toHaveClass("opacity-0");

        // The active player also handles shortcuts when focus is outside its group.
        fireEvent.keyDown(document.body, { key: "m" });
        expect(el.muted).toBe(true);
        expect(controls).not.toHaveClass("opacity-0");
        act(() => vi.advanceTimersByTime(3000));
        expect(controls).toHaveClass("opacity-0");

        act(() => el.pause());
        expect(controls).not.toHaveClass("opacity-0");
        act(() => void el.play());
        act(() => vi.advanceTimersByTime(3000));
        expect(controls).toHaveClass("opacity-0");

        act(() => void document.exitFullscreen());
        act(() => vi.advanceTimersByTime(3000));
        expect(controls).not.toHaveClass("opacity-0");
      } finally {
        vi.useRealTimers();
      }
    } finally {
      delete (document as { fullscreenEnabled?: unknown }).fullscreenEnabled;
      delete (document as { fullscreenElement?: unknown }).fullscreenElement;
      delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
      delete (document as { exitFullscreen?: unknown }).exitFullscreen;
    }
  });

  it("has none without the Fullscreen API, on audio, with fullscreen={false}, or with the browser's own controls", () => {
    const { unmount } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" />);
    expect(screen.queryByRole("button", { name: "Full screen" })).not.toBeInTheDocument();
    unmount();
    const { rerender } = render(<MediaPlayer label="Tour" src="/a.mp3" controls="strata" />);
    expect(screen.queryByRole("button", { name: "Full screen" })).not.toBeInTheDocument();
    rerender(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" fullscreen={false} />);
    expect(screen.queryByRole("button", { name: "Full screen" })).not.toBeInTheDocument();
    rerender(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="native" />);
    expect(screen.queryByRole("button", { name: "Full screen" })).not.toBeInTheDocument();
  });
});

describe("MediaPlayer on the picture", () => {
  const videoOf = (c: HTMLElement) => c.querySelector("video") as HTMLVideoElement;

  it("plays and pauses on a click, and leaves playback as it was on a double click", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" />);
    act(() => media.loaded(videoOf(container), 60));
    await user.click(videoOf(container));
    expect(videoOf(container).paused).toBe(false);
    await user.click(videoOf(container));
    expect(videoOf(container).paused).toBe(true);
    await user.dblClick(videoOf(container));
    expect(videoOf(container).paused).toBe(true);
  });

  it("sets the volume with the wheel only while the player has focus", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" />);
    act(() => media.loaded(videoOf(container), 60));
    const wheel = (deltaY: number) => {
      const e = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
      act(() => void videoOf(container).dispatchEvent(e));
      return e.defaultPrevented;
    };
    expect(wheel(-100)).toBe(false); // not focused: the page scrolls
    expect(Math.round(videoOf(container).volume * 100)).toBe(100);
    await user.click(videoOf(container)); // focuses the picture (and plays)
    expect(wheel(100)).toBe(true);
    expect(Math.round(videoOf(container).volume * 100)).toBe(95);
    expect(wheel(-100)).toBe(true);
    expect(Math.round(videoOf(container).volume * 100)).toBe(100);
  });
});

describe("MediaPlayer heading (issue #329)", () => {
  const heading = { title: "Glazing a celadon bowl", to: "/watch/7", subtitle: "Kiln room", subtitleTo: "/makers/kiln-room", avatar: null };
  const band = () => screen.getByText("Glazing a celadon bowl").closest("[class*='picture-shade']") as HTMLElement;

  it("names what is playing and whose it is, with links to each, over a video", () => {
    renderWithStrata(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" heading={heading} />);
    expect(screen.getByRole("link", { name: "Glazing a celadon bowl" })).toHaveAttribute("href", "/watch/7");
    expect(screen.getAllByRole("link", { name: "Kiln room" }).map((a) => a.getAttribute("href"))).toEqual(["/makers/kiln-room", "/makers/kiln-room"]);
    // No picture: the subtitle's first letter.
    expect(within(band()).getByText("K")).toBeInTheDocument();
    expect(band()).toHaveAttribute("data-shown");
  });

  it("carries the app's router state on its links (#333)", async () => {
    function Arrived() {
      return <output data-testid="state">{JSON.stringify(useLocation().state)}</output>;
    }
    renderWithStrata(<><MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" heading={{ ...heading, state: { from: "watch" } }} /><Arrived /></>);
    await userEvent.click(screen.getAllByRole("link", { name: "Kiln room" })[1]);
    expect(screen.getByTestId("state")).toHaveTextContent('{"from":"watch"}');
  });

  it("draws plain words without routes, and nothing on audio", () => {
    const { unmount } = renderWithStrata(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" heading={{ title: "Only words", subtitle: "By someone" }} />);
    expect(screen.getByText("Only words").tagName).toBe("P");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    unmount();
    renderWithStrata(<MediaPlayer label="Tour" src="/a.mp3" controls="strata" heading={{ title: "Only words" }} />);
    expect(screen.queryByText("Only words")).not.toBeInTheDocument();
  });

  it("stays while paused, fades 3 s into playing or when the pointer leaves, and comes back on a move", () => {
    const { container } = renderWithStrata(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" heading={heading} />);
    const el = container.querySelector("video")!;
    const group = screen.getByRole("group", { name: "Tour" });
    vi.useFakeTimers();
    try {
      act(() => media.loaded(el, 60));
      act(() => vi.advanceTimersByTime(5000));
      expect(band()).toHaveAttribute("data-shown");
      act(() => void el.play());
      act(() => vi.advanceTimersByTime(2999));
      expect(band()).toHaveAttribute("data-shown");
      act(() => vi.advanceTimersByTime(1));
      expect(band()).not.toHaveAttribute("data-shown");
      expect(band()).toHaveClass("opacity-0");

      fireEvent.mouseMove(el);
      expect(band()).toHaveAttribute("data-shown");
      fireEvent.mouseLeave(group);
      expect(band()).not.toHaveAttribute("data-shown");

      fireEvent.mouseMove(el);
      act(() => vi.advanceTimersByTime(3000));
      expect(band()).not.toHaveAttribute("data-shown");
      act(() => el.pause());
      expect(band()).toHaveAttribute("data-shown");
    } finally {
      vi.useRealTimers();
    }
  });
});

it("leaves the picture unlinked when no subtitle names the link (Codex on #330)", () => {
  renderWithStrata(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" heading={{ title: "Only a title", subtitleTo: "/makers/1", avatar: null }} />);
  expect(screen.queryAllByRole("link")).toEqual([]);
});
