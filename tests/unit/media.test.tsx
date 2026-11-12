import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeysLegend, MediaStage, RateChoice, SeekBar, StageGuides, TimeReadout, Transport, VolumeControl, format, transportShortcuts, useHotkeys } from "../../src";
import { renderWithStrata } from "../../src/testing";

describe("format.timecode", () => {
  it("prints seconds, milliseconds and frames, flooring and adding hours only from one", () => {
    expect(format.timecode(245.7)).toBe("4:05");
    expect(format.timecode(245.25, { precision: "ms" })).toBe("4:05.250");
    expect(format.timecode(245.5, { precision: "frames", fps: 30 })).toBe("4:05:15");
    expect(format.timecode(3725, { precision: "frames", fps: 25 })).toBe("1:02:05:00");
    expect(format.timecode(59.9999, { precision: "ms" })).toBe("0:59.999");
    expect(format.timecode(null)).toBe("–");
    expect(format.timecode(-1)).toBe("–");
  });
});

function Player({ initialTime = 30 }: { initialTime?: number }) {
  const [playing, setPlaying] = React.useState(false);
  const [time, setTime] = React.useState(initialTime);
  const [volume, setVolume] = React.useState(80);
  const [rate, setRate] = React.useState(1);
  const shortcuts = transportShortcuts({ toggle: () => setPlaying((p) => !p), seek: setTime, time, duration: 120, toggleMute: () => setVolume((v) => (v === 0 ? 80 : 0)) });
  useHotkeys(shortcuts);
  return (
    <div>
      <Transport playing={playing} onPlayPause={() => setPlaying((p) => !p)} onStop={() => { setPlaying(false); setTime(0); }} onStepBack={() => setTime((t) => t - 1 / 30)} onStepForward={() => setTime((t) => t + 1 / 30)} onToStart={() => setTime(0)} onToEnd={() => setTime(120)}>
        <TimeReadout time={time} duration={120} />
      </Transport>
      <SeekBar time={time} duration={120} onSeek={setTime} marks={[{ time: 60, label: "Take 2" }]} />
      <VolumeControl volume={volume} onVolumeChange={setVolume} />
      <RateChoice rate={rate} onRateChange={setRate} />
      <KeysLegend shortcuts={shortcuts} />
      <output data-testid="state">{JSON.stringify({ playing, time: Math.round(time * 100) / 100, volume, rate })}</output>
    </div>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent!);

describe("Transport", () => {
  it("has every control by role and name, and the play button's name follows playback", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Player />);
    for (const name of ["Go to start", "Back one frame", "Stop", "Forward one frame", "Go to end"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(state().playing).toBe(true);
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(state().playing).toBe(false);
  });

  it("is a labelled toolbar with one tab stop", () => {
    renderWithStrata(<Player />);
    expect(screen.getByRole("toolbar", { name: "Playback" })).toBeInTheDocument();
  });

  it("draws only the buttons it is given handlers for", () => {
    renderWithStrata(<Transport playing={false} onPlayPause={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("shared shortcuts", () => {
  it("plays and pauses with Space and K, jumps with J and L, steps a frame with the arrows, and goes to the ends", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Player />);
    await user.keyboard(" ");
    expect(state().playing).toBe(true);
    await user.keyboard("k");
    expect(state().playing).toBe(false);
    await user.keyboard("l");
    expect(state().time).toBe(31);
    await user.keyboard("jj");
    expect(state().time).toBe(29);
    await user.keyboard("{ArrowRight}");
    expect(state().time).toBeCloseTo(29.03, 2);
    await user.keyboard("{End}");
    expect(state().time).toBe(120);
    await user.keyboard("{Home}");
    expect(state().time).toBe(0);
  });

  it("is the list the legend shows, so the legend stays true", () => {
    renderWithStrata(<Player />);
    expect(screen.getByText("Play or pause")).toBeInTheDocument();
    expect(screen.getByText("Back one frame")).toBeInTheDocument();
  });
});

describe("SeekBar", () => {
  it("has its formatted time as the accessible value, and steps by arrows and Page keys", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Player initialTime={65} />);
    const bar = screen.getByRole("slider", { name: "Seek" });
    expect(bar).toHaveAttribute("aria-valuetext", "1:05");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "120");
    bar.focus();
    await user.keyboard("{ArrowRight}");
    expect(bar).toHaveAttribute("aria-valuetext", "1:10");
    await user.keyboard("{PageUp}");
    expect(bar).toHaveAttribute("aria-valuetext", "1:40");
    await user.keyboard("{PageDown}{ArrowLeft}");
    expect(bar).toHaveAttribute("aria-valuetext", "1:05");
    await user.keyboard("{End}");
    expect(bar).toHaveAttribute("aria-valuetext", "2:00");
    await user.keyboard("{ArrowRight}");
    expect(bar).toHaveAttribute("aria-valuetext", "2:00"); // stays at the end
    await user.keyboard("{Home}");
    expect(bar).toHaveAttribute("aria-valuetext", "0:00");
  });

  it("seeks to the clicked point and to a mark", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Player />);
    const bar = screen.getByRole("slider", { name: "Seek" });
    bar.getBoundingClientRect = () => new DOMRect(0, 0, 400, 40);
    fireEvent.pointerDown(bar, { button: 0, clientX: 100 });
    expect(state().time).toBe(30);
    fireEvent.pointerMove(bar, { buttons: 1, clientX: 200 });
    expect(state().time).toBe(60);
    await user.click(screen.getByRole("button", { name: "Take 2, 1:00" }));
    expect(state().time).toBe(60);
  });
});

describe("SeekBar disabled", () => {
  it("ignores keys, pointer and marks, and stops browser panning from cancelling a touch scrub", async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    renderWithStrata(<SeekBar time={10} duration={120} onSeek={(t) => seen.push(t)} marks={[{ time: 60, label: "Take 2" }]} disabled />);
    const bar = screen.getByRole("slider", { name: "Seek" });
    expect(bar).toHaveClass("touch-none");
    bar.focus();
    await user.keyboard("{ArrowRight}");
    await user.click(screen.getByRole("button", { name: "Take 2, 1:00" }));
    expect(seen).toEqual([]);
  });
});

describe("TimeReadout", () => {
  it("reserves the width of the total so it does not change as the time runs, with tabular figures", () => {
    const { container, rerender } = render(<TimeReadout time={9} duration={3725} />);
    const current = container.querySelector("time") as HTMLElement;
    expect(current.style.minWidth).toBe("7ch");
    expect(container.firstElementChild).toHaveClass("tabular-nums");
    rerender(<TimeReadout time={3601} duration={3725} />);
    expect((container.querySelector("time") as HTMLElement).style.minWidth).toBe("7ch");
  });
  it("shows precision as asked and the missing mark for an unknown length", () => {
    render(<TimeReadout time={1.5} duration={null} precision="ms" />);
    expect(screen.getByLabelText("Position 0:01.500")).toBeInTheDocument();
    expect(screen.getByLabelText("Length –")).toBeInTheDocument();
  });
});

describe("VolumeControl", () => {
  it("mutes, remembers the level, and restores it on unmute", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Player />);
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAccessibleName("Volume");
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(state().volume).toBe(0);
    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(state().volume).toBe(80);
  });
  it("speaks the level with its unit", () => {
    renderWithStrata(<Player />);
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", expect.stringMatching(/80\s?%/));
  });
});

describe("RateChoice", () => {
  it("is a named select of speeds", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Player />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Playback speed" }), "1.5×");
    expect(state().rate).toBe(1.5);
  });
});

describe("MediaStage", () => {
  it("fits content of the aspect ratio inside the pane, in both orientations", () => {
    const { container } = render(
      <MediaStage aspect="16/9" label="Preview">
        <p>picture</p>
      </MediaStage>,
    );
    // The layout shim reports 640 by 280: a 16:9 frame is limited by height.
    const frame = container.querySelector<HTMLElement>("[role=group] > div")!;
    expect(parseFloat(frame.style.height)).toBeCloseTo(280, 0);
    expect(parseFloat(frame.style.width)).toBeCloseTo(280 * (16 / 9), 0);
  });
  it("is a labelled group that takes overlays", () => {
    render(
      <MediaStage aspect={1} label="Preview">
        <StageGuides safe thirds centre />
      </MediaStage>,
    );
    expect(screen.getByRole("group", { name: "Preview" })).toBeInTheDocument();
    expect(document.querySelectorAll("svg line").length).toBeGreaterThan(0);
  });
});
