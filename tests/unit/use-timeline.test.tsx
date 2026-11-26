import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import {
  KeysLegend,
  MediaGroup,
  SeekBar,
  Transport,
  joinMediaGroup,
  transportShortcuts,
  useHotkeys,
  useTimeline,
  type TimelineClockOptions,
} from "../../src";

// Issues #384 and #385. The clock is the real hook on fake animation frames; the transport, seek bar and keys are the real parts.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function Clock(options: TimelineClockOptions) {
  const clock = useTimeline(options);
  return (
    <div {...clock.regionProps}>
      <Transport
        playing={clock.playing}
        onPlayPause={clock.toggle}
        onToStart={() => clock.seek(0)}
        onStepBack={() => clock.step(-1)}
        onStepForward={() => clock.step(1)}
      >
        <SeekBar time={clock.time} duration={clock.duration} onSeek={clock.seek} precision="frames" fps={40} />
      </Transport>
      <output aria-label="state">
        {JSON.stringify({
          time: Number(clock.time.toFixed(3)),
          playing: clock.playing,
          ended: clock.ended,
        })}
      </output>
    </div>
  );
}
const read = () => JSON.parse(screen.getByLabelText("state").textContent!);
const run = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const press = (name: string) => act(() => screen.getByRole("button", { name }).click());

describe("useTimeline", () => {
  it("plays at the rate, stops at the end, and play at the end starts again from 0", () => {
    render(<Clock duration={2} rate={2} />);
    press("Play");
    run(500);
    expect(read().time).toBeCloseTo(1, 0);
    run(1000);
    expect(read()).toMatchObject({ time: 2, playing: false, ended: true });
    press("Play");
    run(100);
    expect(read().playing).toBe(true);
    expect(read().time).toBeLessThan(1);
  });

  it("loops when asked", () => {
    render(<Clock duration={1} loop />);
    press("Play");
    run(1500);
    expect(read().playing).toBe(true);
    expect(read().time).toBeLessThan(1);
  });

  it("rests at the end with startAt end, seeks pause, and steps by one frame", () => {
    render(<Clock duration={2.5} startAt="end" frame={0.025} />);
    expect(read().time).toBe(2.5);
    press("Back one frame");
    expect(read().time).toBe(2.475);
    press("Go to start");
    press("Play");
    run(200);
    press("Forward one frame");
    expect(read().playing).toBe(false);
  });

  it("pauses a real player in its group when it starts", () => {
    const other = new EventTarget() as EventTarget & { paused: boolean; pause(): void };
    other.paused = false;
    other.pause = vi.fn(() => void (other.paused = true));
    const leave = joinMediaGroup("lab", other as unknown as HTMLMediaElement);
    render(
      <MediaGroup name="lab">
        <Clock duration={3} />
      </MediaGroup>,
    );
    press("Play");
    expect(other.pause).toHaveBeenCalled();
    // And the other way: a real player starting pauses the clock.
    other.paused = false;
    act(() => void other.dispatchEvent(new Event("play")));
    expect(read().playing).toBe(false);
    leave();
  });
});

describe("keys on a page with a stage (#385)", () => {
  function Lab() {
    const clock = useTimeline({ duration: 4 });
    const controls = React.useRef<HTMLDivElement>(null);
    const [turns, setTurns] = React.useState(0);
    const shortcuts = transportShortcuts({
      toggle: clock.toggle,
      seek: clock.seek,
      time: clock.time,
      duration: clock.duration,
    });
    const { live } = useHotkeys(shortcuts, { enabled: clock.ownsKeys, within: controls });
    // The stage's own arrows.
    useHotkeys([{ keys: ["ArrowRight"], label: "Turn right", run: () => setTurns((n) => n + 1) }]);
    return (
      <div>
        <div ref={controls} {...clock.regionProps}>
          <Transport playing={clock.playing} onPlayPause={clock.toggle} />
          <div tabIndex={0} aria-label="Replay">
            {clock.time}
          </div>
        </div>
        <button>Stage</button>
        <KeysLegend shortcuts={live} />
        <output aria-label="state">{JSON.stringify({ time: Number(clock.time.toFixed(3)), turns })}</output>
      </div>
    );
  }

  it("leaves the arrows to the stage unless focus is in the transport, and the legend shows only live keys", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<Lab />);
    expect(screen.queryByRole("term")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Stage" }));
    await user.keyboard("{ArrowRight}");
    expect(read()).toMatchObject({ turns: 1, time: 0 });
    act(() => screen.getByLabelText("Replay").focus());
    expect(screen.getAllByRole("definition").length).toBeGreaterThan(0);
    await user.keyboard("{ArrowRight}");
    expect(read().time).toBeGreaterThan(0);
  });
});

describe("review fixes", () => {
  it("a clock with keys off never owns the keys, even alone on the page", () => {
    function Off() {
      const clock = useTimeline({ duration: 2, keys: false });
      return <output aria-label="owns">{String(clock.ownsKeys)}</output>;
    }
    render(<Off />);
    expect(screen.getByLabelText("owns")).toHaveTextContent("false");
  });

  it("a within ref with no element keeps scoped keys off and anywhere keys on", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const ran: string[] = [];
    function Gone() {
      const missing = React.useRef<HTMLDivElement>(null);
      useHotkeys(
        [
          { keys: ["a"], label: "Scoped", run: () => void ran.push("a") },
          { keys: ["b"], label: "Everywhere", run: () => void ran.push("b"), anywhere: true },
        ],
        { within: missing },
      );
      return <button>Page</button>;
    }
    render(<Gone />);
    await user.click(screen.getByRole("button", { name: "Page" }));
    await user.keyboard("ab");
    expect(ran).toEqual(["b"]);
  });
});
