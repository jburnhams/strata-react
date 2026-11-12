import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MediaGroup, MediaPlayer, PlayWindowButton, SPEECH_RATES, useMediaElement, type MediaWindow } from "../../src";
import { installFakeMedia, type FakeMedia } from "../utils/media";

// Issue #180: a window of a file, one player at a time, speech at reduced speed. jsdom has no
// decoder, so tests/utils/media.ts plays the browser's; the hook and the components are the real ones.

let media: FakeMedia;
beforeEach(() => void (media = installFakeMedia()));
afterEach(() => media.uninstall());
const audio = (c: HTMLElement, i = 0) => c.querySelectorAll("audio")[i] as HTMLAudioElement;

function Probe({ window: w, loop, onEnd, onFrame }: { window?: MediaWindow | null; loop?: boolean; onEnd?: () => void; onFrame?: (t: number) => void }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const m = useMediaElement(ref, { window: w, loop, onWindowEnd: onEnd, onTimeUpdate: onFrame });
  return (
    <div>
      <audio ref={ref} src="/a.mp3" />
      <output aria-label="state">{JSON.stringify({ playing: m.playing, time: m.time, ended: m.ended })}</output>
      <button onClick={m.toggle}>toggle</button>
      <button onClick={() => m.setRate(0.75)}>slow</button>
      <button onClick={() => void m.playWindow({ start: 20, end: 23 })}>phrase</button>
    </div>
  );
}
const read = () => JSON.parse(screen.getByLabelText("state").textContent!);

describe("a window on the hook", () => {
  it("starts at the window's start and stops at its end, once", async () => {
    const user = userEvent.setup();
    const onEnd = vi.fn();
    const { container } = render(<Probe window={{ start: 12, end: 15 }} onEnd={onEnd} />);
    act(() => media.loaded(audio(container), 120));
    expect(read().time).toBe(12); // moved into the window when it loaded
    await user.click(screen.getByText("toggle"));
    expect(read().playing).toBe(true);
    act(() => media.tick(audio(container), 14.5));
    expect(read().playing).toBe(true);
    act(() => media.tick(audio(container), 15.02));
    expect(read()).toMatchObject({ playing: false, time: 15 });
    act(() => media.tick(audio(container), 15.2));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("begins at the start when played again after it stopped, and when played from outside", async () => {
    const user = userEvent.setup();
    const { container } = render(<Probe window={{ start: 12, end: 15 }} />);
    act(() => media.loaded(audio(container), 120));
    act(() => media.tick(audio(container), 80));
    await user.click(screen.getByText("toggle"));
    expect(read().time).toBe(12);
    act(() => media.tick(audio(container), 15.1));
    expect(read().playing).toBe(false);
    await user.click(screen.getByText("toggle"));
    expect(read()).toMatchObject({ playing: true, time: 12 });
  });

  it("loops instead of stopping", async () => {
    const user = userEvent.setup();
    const onEnd = vi.fn();
    const { container } = render(<Probe window={{ start: 12, end: 15 }} loop onEnd={onEnd} />);
    act(() => media.loaded(audio(container), 120));
    await user.click(screen.getByText("toggle"));
    act(() => media.tick(audio(container), 15.01));
    expect(read()).toMatchObject({ playing: true, time: 12 });
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("moves into a new window while playing, and does not end twice when the window ends with the file", async () => {
    const user = userEvent.setup();
    const onEnd = vi.fn();
    const { container, rerender } = render(<Probe window={{ start: 0, end: 50 }} onEnd={onEnd} />);
    act(() => media.loaded(audio(container), 120));
    await user.click(screen.getByText("toggle"));
    act(() => media.tick(audio(container), 30));
    rerender(<Probe window={{ start: 60, end: 120 }} onEnd={onEnd} />);
    expect(read()).toMatchObject({ playing: true, time: 60 });
    act(() => media.end(audio(container)));
    act(() => media.tick(audio(container), 120));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stops within a frame: the frame loop checks the end between timeupdate events", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      const frames: number[] = [];
      const { container } = render(<Probe window={{ start: 12, end: 15 }} onFrame={(t) => frames.push(t)} />);
      act(() => media.loaded(audio(container), 120));
      await act(async () => void audio(container).play());
      // The element reaches the end without a timeupdate (they come about four times a second).
      (audio(container) as unknown as { currentTime: number }).currentTime = 15.001;
      await act(async () => void vi.advanceTimersByTime(40));
      expect(audio(container).paused).toBe(true);
      expect(frames.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the pitch whenever the rate changes", async () => {
    const user = userEvent.setup();
    const { container } = render(<Probe />);
    (audio(container) as unknown as { preservesPitch: boolean }).preservesPitch = false;
    await user.click(screen.getByText("slow"));
    expect(audio(container).playbackRate).toBe(0.75);
    expect((audio(container) as unknown as { preservesPitch: boolean }).preservesPitch).toBe(true);
    expect(SPEECH_RATES).toContain(0.75);
  });
});

describe("MediaPlayer with a window", () => {
  it("shows the window as the bar and announces it while it plays", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Phrase" src="/a.mp3" window={{ start: 12, end: 15 }} />);
    act(() => media.loaded(audio(container), 120));
    expect(screen.getByText(/0:12 to 0:15/)).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Seek in Phrase" })).toHaveAttribute("max", "3");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("status")).toHaveTextContent("Playing 0:12 to 0:15");
  });
  it("with showFull draws the whole file with the window marked", () => {
    const { container } = render(<MediaPlayer label="Phrase" src="/a.mp3" window={{ start: 12, end: 15 }} showFull />);
    act(() => media.loaded(audio(container), 120));
    expect(screen.getByRole("slider", { name: "Seek in Phrase" })).toHaveAttribute("max", "120");
  });
});

describe("groups", () => {
  function Two({ showSecond = true }: { showSecond?: boolean }) {
    return (
      <MediaGroup>
        <MediaPlayer label="One" src="/1.mp3" controls="strata" />
        {showSecond && <MediaPlayer label="Two" src="/2.mp3" controls="strata" />}
      </MediaGroup>
    );
  }
  it("starting one pauses the other, with no app glue", async () => {
    const user = userEvent.setup();
    const { container } = render(<Two />);
    const [a, b] = [audio(container, 0), audio(container, 1)];
    act(() => {
      media.loaded(a, 60);
      media.loaded(b, 60);
    });
    await act(async () => void a.play());
    await act(async () => void b.play());
    expect(a.paused).toBe(true);
    expect(b.paused).toBe(false);
    await user.click(screen.getAllByRole("button", { name: "Play" })[0]);
    expect(a.paused).toBe(false);
    expect(b.paused).toBe(true);
  });
  it("leaves the group on unmount, so a removed player is not touched and the rest still work", async () => {
    const { container, rerender } = render(<Two />);
    const [a, b] = [audio(container, 0), audio(container, 1)];
    act(() => media.loaded(a, 60));
    rerender(<Two showSecond={false} />);
    await act(async () => void a.play());
    await act(async () => void b.play());
    expect(a.paused).toBe(false); // b is gone from the group
  });
  it("players in no group play together as before", async () => {
    const { container } = render(<><MediaPlayer label="One" src="/1.mp3" controls="strata" /><MediaPlayer label="Two" src="/2.mp3" controls="strata" /></>);
    await act(async () => void audio(container, 0).play());
    await act(async () => void audio(container, 1).play());
    expect(audio(container, 0).paused).toBe(false);
  });
});

describe("PlayWindowButton", () => {
  const phrases = Array.from({ length: 5 }, (_, i) => ({ start: i * 4, end: i * 4 + 3 }));
  function List() {
    const ref = React.useRef<HTMLAudioElement>(null);
    const m = useMediaElement(ref);
    return (
      <div>
        <audio ref={ref} src="/talk.mp3" />
        {phrases.map((w, i) => (
          <PlayWindowButton key={i} media={m} window={w} label={`Play phrase ${i + 1}`} />
        ))}
      </div>
    );
  }
  it("is named for what it plays, pressed while it plays, and a new phrase replaces the last", async () => {
    const user = userEvent.setup();
    const { container } = render(<List />);
    act(() => media.loaded(audio(container), 60));
    const one = screen.getByRole("button", { name: "Play phrase 1" });
    const three = screen.getByRole("button", { name: "Play phrase 3" });
    expect(one).toHaveAttribute("aria-pressed", "false");
    await user.click(three);
    expect(three).toHaveAttribute("aria-pressed", "true");
    expect(audio(container).currentTime).toBe(8);
    await user.click(one);
    expect(one).toHaveAttribute("aria-pressed", "true");
    expect(three).toHaveAttribute("aria-pressed", "false");
    expect(audio(container).currentTime).toBe(0);
    act(() => media.tick(audio(container), 3.01));
    expect(one).toHaveAttribute("aria-pressed", "false");
    await user.click(one);
    await user.click(one);
    expect(audio(container).paused).toBe(true);
  });
});
