import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Waveform, type WaveformProps } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";

// Issue #185: peaks drawn, marks and spans named, one slider, a range, zoom, a file decoded with progress.

const peaks = Array.from({ length: 400 }, (_, i) => Math.abs(Math.sin(i / 9)) * (i > 200 ? 1 : 0.4));
const marks = [
  { time: 10, kind: "downbeat" as const, label: "First downbeat" },
  { time: 20, kind: "bar" as const, label: "Bar 2" },
  { time: 12, kind: "beat" as const },
  { time: 50, kind: "chapter" as const, label: "Chorus" },
];
const spans = [{ from: 30, to: 45, label: "Voice", tone: "info" as const }];

function Host(props: Partial<WaveformProps> & { start?: number }) {
  const [time, setTime] = React.useState(props.start ?? 0);
  return <Waveform label="Waveform of the track" duration={100} peaks={peaks} marks={marks} spans={spans} {...(props as object)} time={time} onSeek={(t) => { setTime(t); props.onSeek?.(t); }} />;
}
const slider = () => screen.getByRole("slider", { name: "Waveform of the track" });

describe("Waveform with peaks", () => {
  it("is one slider whose value text is the time, described by a summary of what is on it", () => {
    renderWithStrata(<Host start={65} />);
    expect(slider()).toHaveAttribute("aria-valuetext", "1:05");
    expect(slider()).toHaveAccessibleDescription("1:40 long, 1 downbeat, 1 bar, 1 beat, 1 chapter, 1 span");
  });

  it("lists every span and each labelled mark with its time; beats are drawn but not listed", () => {
    renderWithStrata(<Host />);
    expect(within(screen.getByRole("list", { name: "Spans" })).getByText("Voice: 0:30 to 0:45")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Marks" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(list).toHaveTextContent("First downbeat, 0:10");
  });

  it("moves with arrows, bigger with Shift, to the ends with Home and End, and stays inside the file", () => {
    const onSeek = vi.fn();
    renderWithStrata(<Host start={50} onSeek={onSeek} />);
    slider().focus();
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(55);
    fireEvent.keyDown(slider(), { key: "ArrowLeft", shiftKey: true });
    expect(onSeek).toHaveBeenLastCalledWith(25);
    fireEvent.keyDown(slider(), { key: "End" });
    expect(onSeek).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onSeek).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(slider(), { key: "Home" });
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it("sets a range with [ and ], says so, and clears it with Escape", () => {
    const onRangeChange = vi.fn();
    renderWithStrata(<Host start={20} onRangeChange={onRangeChange} />);
    fireEvent.keyDown(slider(), { key: "[" });
    expect(onRangeChange).toHaveBeenLastCalledWith([20, 100]);
    expect(screen.getByRole("status")).toHaveTextContent("Range starts at 0:20");
    fireEvent.keyDown(slider(), { key: "]" });
    expect(onRangeChange).toHaveBeenLastCalledWith([20, 20]);
    fireEvent.keyDown(slider(), { key: "Escape" });
    expect(onRangeChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("status")).toHaveTextContent("Range cleared");
  });

  it("holds the range itself unless the app does", () => {
    renderWithStrata(<Host start={30} />);
    fireEvent.keyDown(slider(), { key: "[" });
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    fireEvent.keyDown(slider(), { key: "]" });
    expect(slider()).toHaveAccessibleDescription(/range 0:30 to 0:35/);
  });

  it("zooms with + - 0, and the summary says what is showing; the slider then spans the visible part", () => {
    renderWithStrata(<Host start={50} />);
    fireEvent.keyDown(slider(), { key: "+" });
    expect(screen.getByRole("status")).toHaveTextContent("Zoomed in");
    expect(slider()).toHaveAccessibleDescription(/showing 0:25 to 1:15/);
    expect(slider()).toHaveAttribute("min", "25");
    expect(slider()).toHaveAttribute("max", "75");
    fireEvent.keyDown(slider(), { key: "0" });
    expect(slider()).toHaveAttribute("max", "100");
    expect(screen.getByRole("status")).toHaveTextContent("Showing the whole file");
  });

  it("zooms with ctrl and the wheel", () => {
    const { container } = renderWithStrata(<Host start={50} />);
    const plot = container.querySelector("svg")!.parentElement!;
    fireEvent.wheel(plot, { ctrlKey: true, deltaY: -100, clientX: 0 });
    expect(slider()).toHaveAccessibleDescription(/showing/);
  });

  it("follows the playhead when it leaves a zoomed view", () => {
    const { rerender } = renderWithStrata(<Waveform label="Waveform of the track" duration={100} peaks={peaks} time={10} onSeek={() => {}} />);
    fireEvent.keyDown(slider(), { key: "+" });
    fireEvent.keyDown(slider(), { key: "+" });
    rerender(<Waveform label="Waveform of the track" duration={100} peaks={peaks} time={80} onSeek={() => {}} />);
    expect(Number(slider().getAttribute("min"))).toBeGreaterThan(40);
  });

  it("draws the underlay on the same x axis, stretched to the file", () => {
    const { container } = renderWithStrata(<Host underlay={<img alt="" src="/spec.png" />} />);
    const wrap = container.querySelector("img")!.parentElement!;
    expect(wrap.style.width).toBe("100%");
    fireEvent.keyDown(slider(), { key: "+" });
    expect(container.querySelector("img")!.parentElement!.style.width).toBe("200%");
  });

  it("is disabled when told to", () => {
    renderWithStrata(<Host disabled />);
    expect(slider()).toBeDisabled();
  });
});

describe("Waveform decoding a file", () => {
  const samples = new Float32Array(8000).map((_, i) => Math.sin(i / 20) * (i < 4000 ? 0.3 : 0.9));
  const decode = async () => ({ duration: 8, numberOfChannels: 1, length: samples.length, getChannelData: () => samples });

  it("fetches the file, shows progress while it reads, then the waveform with the file's own duration", async () => {
    server.use(http.get("https://media.example.test/track.mp3", () => HttpResponse.arrayBuffer(new ArrayBuffer(16), { headers: { "content-type": "audio/mpeg" } })));
    renderWithStrata(<Waveform label="Waveform of the track" source="https://media.example.test/track.mp3" decode={decode} buckets={500} time={2} onSeek={() => {}} />);
    expect(await screen.findByText("Reading the waveform")).toBeInTheDocument();
    await waitFor(() => expect(slider()).toHaveAttribute("max", "8"));
    expect(screen.queryByText("Reading the waveform")).not.toBeInTheDocument();
    expect(slider()).toHaveAccessibleDescription("0:08 long");
  });

  it("says why it failed and tries again", async () => {
    let calls = 0;
    server.use(http.get("https://media.example.test/bad.mp3", () => (++calls === 1 ? HttpResponse.arrayBuffer(new ArrayBuffer(4)) : HttpResponse.arrayBuffer(new ArrayBuffer(16)))));
    let first = true;
    const flaky = async () => {
      if (first) {
        first = false;
        throw new Error("That file is not audio.");
      }
      return decode();
    };
    const user = userEvent.setup();
    renderWithStrata(<Waveform label="Waveform of the track" source="https://media.example.test/bad.mp3" decode={flaky} time={0} onSeek={() => {}} />);
    expect(await screen.findByText("Could not read the waveform")).toBeInTheDocument();
    expect(screen.getByText("That file is not audio.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(slider()).toHaveAttribute("max", "8"));
    expect(calls).toBe(2);
  });

  it("can be cancelled while it reads", async () => {
    server.use(http.get("https://media.example.test/slow.mp3", async () => { await new Promise((r) => setTimeout(r, 200)); return HttpResponse.arrayBuffer(new ArrayBuffer(4)); }));
    const user = userEvent.setup();
    renderWithStrata(<Waveform label="Waveform of the track" source="https://media.example.test/slow.mp3" decode={decode} time={0} onSeek={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
