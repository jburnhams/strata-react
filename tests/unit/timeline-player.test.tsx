import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { TimelinePlayer, useTimeline } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #386: a stage over the player's control bar, driven by a clock. The stage keeps the arrow keys (#385).
function Lab() {
  const [rate, setRate] = React.useState(1);
  const clock = useTimeline({ duration: 4, rate, frame: 0.1 });
  const [turns, setTurns] = React.useState(0);
  return (
    <TimelinePlayer
      clock={clock}
      label="Movement replay"
      rates={[0.5, 1, 2]}
      onRateChange={setRate}
      legend
      stage={
        <button onKeyDown={(e) => e.key === "ArrowRight" && setTurns((n) => n + 1)}>
          Stage {turns} at {clock.time.toFixed(1)}
        </button>
      }
    />
  );
}

describe("TimelinePlayer", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("plays, seeks and names its controls like a video player", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithStrata(<Lab />);
    expect(screen.getByRole("group", { name: "Movement replay" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Forward one frame" }));
    expect(screen.getByRole("button", { name: /Stage 0 at 0\.1/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Playback speed/ })).toBeInTheDocument();
  });

  it("leaves the arrow keys to the stage, and keeps Space page-wide", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithStrata(<Lab />);
    screen.getByRole("button", { name: /^Stage/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /Stage 1 at 0\.0/ })).toBeInTheDocument();
    await user.keyboard(" ");
    act(() => void vi.advanceTimersByTime(0));
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
});
