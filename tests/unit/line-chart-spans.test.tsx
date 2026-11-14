import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CursorScope, LineChart, LineChartGroup, logScale, useSharedCursor, valueAt, type ChartMark, type LineChartProps, type Point } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #183 (spans, marks, log axis, stacked charts) and #184 (the shared cursor).

const profile: Point[] = [0, 100, 200, 300, 400, 500].map((x, i) => ({ x, y: [20, 45, 87, 60, 30, 55][i] }));
const pace: Point[] = [0, 100, 200, 300, 400, 500].map((x, i) => ({ x, y: [300, 250, 480, 520, 310, 280][i] }));
const formatX = (x: number) => `${x} m`;
const props: LineChartProps = { label: "Elevation", series: profile, seriesLabel: "Elevation", formatX, formatY: (y) => `${y} m up`, xTicks: [0, 250, 500] };

describe("spans", () => {
  const spans = [
    { from: 100, to: 200, label: "Stop", tone: "warning" as const },
    { from: 400, to: 900, label: "Past the end" },
  ];
  it("shades behind the line, clipped to the chart, and names each in the key and for screen readers", () => {
    const { container } = renderWithStrata(<LineChart {...props} spans={spans} />);
    expect(container.querySelectorAll("svg[role=img] rect[fill]").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Stop")).toBeInTheDocument(); // the key
    expect(screen.getByRole("list", { name: "Shaded stretches" })).toHaveTextContent("Stop: 100 m to 200 m");
    expect(screen.getByRole("list", { name: "Shaded stretches" })).toHaveTextContent("Past the end: 400 m to 900 m");
  });
  it("draws nothing for a stretch wholly outside the range", () => {
    const { container } = renderWithStrata(<LineChart {...props} spans={[{ from: 800, to: 900, label: "Far" }]} />);
    expect(container.querySelectorAll("svg[role=img] rect")).toHaveLength(0);
  });
});

describe("marks", () => {
  const marks: ChartMark[] = [
    { x: 100, label: "Clip 1" },
    { x: 300, label: "Clip 2", selected: true },
    { x: 500, label: "Clip 3" },
  ];
  it("are named controls with their x, and listed for screen readers", () => {
    renderWithStrata(<LineChart {...props} marks={marks} />);
    const group = screen.getByRole("group", { name: "Marks" });
    expect(within(group).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Clip 1, 100 m", "Clip 2, 300 m", "Clip 3, 500 m"]);
    expect(within(group).getByRole("button", { name: "Clip 2, 300 m" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("list", { name: "Marks" })).toHaveTextContent("Clip 2: 300 m, selected");
  });
  it("are one tab stop, with arrows, Home and End between them, and press with Enter", async () => {
    const user = userEvent.setup();
    const onMarkSelect = vi.fn();
    renderWithStrata(<LineChart {...props} marks={marks} onMarkSelect={onMarkSelect} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Clip 1, 100 m" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Clip 2, 300 m" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: "Clip 3, 500 m" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "Clip 1, 100 m" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onMarkSelect).toHaveBeenCalledWith(marks[0]);
    await user.tab(); // leaves the group: the other marks are not tab stops
    expect(screen.getByRole("button", { name: "Clip 2, 300 m" })).not.toHaveFocus();
  });
  it("leaves out a mark beyond the chart", () => {
    renderWithStrata(<LineChart {...props} marks={[...marks, { x: 9000, label: "Far" }]} />);
    expect(screen.queryByRole("button", { name: /Far/ })).toBeNull();
  });
  it("shows the app's card on focus", async () => {
    const user = userEvent.setup();
    renderWithStrata(<LineChart {...props} marks={marks} renderMarkCard={(m) => <span>Card for {m.label}</span>} />);
    await user.tab();
    expect(await screen.findByText("Card for Clip 1")).toBeInTheDocument();
  });
});

describe("log axis", () => {
  it("chooses 1, 2, 5 ticks around the data", () => {
    const y = logScale([310, 480, 2400]);
    expect(y.min).toBe(200);
    expect(y.max).toBe(5000);
    expect(y.ticks).toEqual([200, 500, 1000, 2000, 5000]);
    expect(y.at(200)).toBe(0);
    expect(y.at(5000)).toBe(1);
    expect(y.at(1000)).toBeCloseTo(Math.log10(5) / Math.log10(25), 10);
  });
  it("thins its ticks to decades, then every k-th decade, when there are many", () => {
    expect(logScale([1, 1e6]).ticks).toEqual([1, 10, 100, 1000, 10000, 100000, 1000000]);
    expect(logScale([1, 1e12]).ticks.length).toBeLessThanOrEqual(7);
  });
  it("ignores values at or below zero, and widens a flat series to a decade", () => {
    expect(logScale([0, -5, 40]).min).toBe(20);
    const flat = logScale([100, 100]);
    expect(flat.max).toBeGreaterThan(flat.min);
  });
  it("draws the line broken at a reading it cannot place and says how many it left out", () => {
    const series = [
      { x: 0, y: 100 },
      { x: 1, y: 0 },
      { x: 2, y: 400 },
      { x: 3, y: 900 },
    ];
    const { container } = renderWithStrata(<LineChart {...props} series={series} yScale="log" formatY={(y) => `${y}`} xTicks={[0, 3]} />);
    const d = [...container.querySelectorAll("svg[role=img] path")].map((p) => p.getAttribute("d") ?? "").find((v) => v.startsWith("M") && v.includes("L"))!;
    expect(d.match(/M/g)).toHaveLength(2); // two runs: the break is where the zero was
    expect(screen.getByText("1 reading at or below zero is not drawn")).toBeInTheDocument();
  });
  it("puts higher values lower on the screen when inverted", () => {
    const series = [
      { x: 0, y: 100 },
      { x: 1, y: 1000 },
    ];
    const draw = (invert: boolean) => {
      const { container, unmount } = renderWithStrata(<LineChart {...props} series={series} yScale="log" yInvert={invert} formatY={(y) => `${y}`} xTicks={[0, 1]} />);
      const d = [...container.querySelectorAll("svg[role=img] path")].map((p) => p.getAttribute("d") ?? "").find((v) => v.startsWith("M") && v.includes("L"))!;
      const ys = [...d.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
      unmount();
      return ys;
    };
    const [a0, a1] = draw(false);
    const [b0, b1] = draw(true);
    expect(a1).toBeLessThan(a0); // 1000 above 100
    expect(b1).toBeGreaterThan(b0); // 1000 below 100
  });
});

describe("x range", () => {
  it("takes xTicks as a function of the range and a fixed xDomain", () => {
    const xTicks = vi.fn(({ min, max }: { min: number; max: number }) => [min, max]);
    renderWithStrata(<LineChart {...props} xTicks={xTicks} xDomain={[0, 1000]} />);
    expect(xTicks).toHaveBeenCalledWith({ min: 0, max: 1000 });
    expect(screen.getByText("1000 m")).toBeInTheDocument();
  });
  it("draws no x labels with xAxis none", () => {
    renderWithStrata(<LineChart {...props} xAxis="none" />);
    expect(screen.queryByText("250 m")).toBeNull();
  });
});

describe("valueAt", () => {
  it("reads between readings, flat beyond the ends, in any order", () => {
    expect(valueAt([...profile].reverse(), 150)).toBe(66);
    expect(valueAt(profile, -5)).toBe(20);
    expect(valueAt(profile, 9999)).toBe(55);
  });
});

describe("LineChartGroup and the shared cursor", () => {
  const charts = [
    { series: profile, seriesLabel: "Elevation", formatY: (y: number) => `${y} m up`, height: 140 },
    { series: pace, seriesLabel: "Pace", formatY: (y: number) => `${y} s/km`, height: 140, yScale: "log" as const, yInvert: true },
  ];
  const group = <LineChartGroup label="Run" charts={charts} formatX={formatX} xTicks={[0, 250, 500]} />;

  it("stacks charts on one x axis: labels on the last only, the same range", () => {
    renderWithStrata(group);
    expect(screen.getAllByText("250 m")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Run" })).toBeInTheDocument();
  });

  it("puts a rule and each chart's own reading in every chart when one is read", () => {
    const { container } = renderWithStrata(group);
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    // Arrow in the elevation chart to the reading at 200 m (two steps from the first).
    act(() => sliders[0].focus());
    fireEvent.keyDown(sliders[0], { key: "Home" });
    fireEvent.keyDown(sliders[0], { key: "ArrowRight" });
    fireEvent.keyDown(sliders[0], { key: "ArrowRight" });
    const texts = [...container.querySelectorAll("svg[role=img] text")].map((t) => t.textContent);
    expect(texts).toContain("200 m: 87 m up"); // the chart that was read
    expect(texts).toContain("200 m: 480 s/km"); // the other chart, at the same x, its own value
  });

  it("announces the reading of every chart together, at most once a second", async () => {
    vi.useFakeTimers();
    try {
      renderWithStrata(group);
      const slider = screen.getAllByRole("slider")[0];
      act(() => slider.focus());
      // Focusing says where the reading is (the last one), for both charts at once.
      expect(screen.getByRole("status")).toHaveTextContent("500 m: Elevation 55 m up, Pace 280 s/km");
      fireEvent.keyDown(slider, { key: "Home" });
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(screen.getByRole("status")).toHaveTextContent("500 m:"); // throttled: the 100 m reading waits
      await act(() => vi.advanceTimersByTimeAsync(1100));
      expect(screen.getByRole("status")).toHaveTextContent("100 m: Elevation 45 m up, Pace 250 s/km");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares current and onPick", () => {
    const onPick = vi.fn();
    renderWithStrata(<LineChartGroup label="Run" charts={charts} formatX={formatX} xTicks={[0, 500]} current={200} onPick={onPick} />);
    expect(screen.getAllByText(/^200 m:/)).toHaveLength(2);
    const slider = screen.getAllByRole("slider")[1];
    act(() => slider.focus());
    fireEvent.keyDown(slider, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(200);
  });

  it("maps units: a chart in seconds in a scope in metres", () => {
    const seconds: Point[] = profile.map((p) => ({ x: p.x / 2, y: p.y }));
    const mapping = { toCursor: (t: number) => t * 2, fromCursor: (m: number) => m / 2 };
    const { container } = renderWithStrata(
      <CursorScope>
        <LineChart {...props} label="By distance" cursor />
        <LineChart {...props} label="By time" series={seconds} formatX={(t) => `${t} s`} xTicks={[0, 250]} cursor={mapping} />
        <Writer at={400} />
      </CursorScope>,
    );
    const charts = container.querySelectorAll("svg[role=img]");
    expect(charts[0].textContent).toContain("400 m: 30 m up");
    expect(charts[1].textContent).toContain("200 s: 30 m up");
  });
});

/** A member that is not a chart: it writes a position the way a map or player would. */
function Writer({ at, owner = "pointer" }: { at: number; owner?: "pointer" | "playback" }) {
  const cursor = useSharedCursor("writer");
  const set = owner === "pointer" ? cursor?.setPointer : cursor?.setPlayback;
  React.useEffect(() => {
    set?.(at);
  }, [set, at]);
  return null;
}

describe("the cursor's rules", () => {
  it("does nothing outside a scope", () => {
    renderWithStrata(<LineChart {...props} cursor />);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("does not draw a member's own position back at it", () => {
    const { container } = renderWithStrata(
      <CursorScope>
        <LineChart {...props} cursor />
      </CursorScope>,
    );
    const slider = screen.getByRole("slider");
    act(() => slider.focus());
    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    // One reading label (its own active one), not two.
    expect([...container.querySelectorAll("svg[role=img] text")].filter((t) => t.textContent === "100 m: 45 m up")).toHaveLength(1);
  });

  it("lets the pointer win over playback, then falls back to playback when it leaves", () => {
    function Probe({ onRead }: { onRead: (v: number | null, owner: string | null) => void }) {
      const c = useSharedCursor("probe");
      onRead(c?.at ?? null, c?.owner ?? null);
      return null;
    }
    const reads: [number | null, string | null][] = [];
    function Players() {
      const play = useSharedCursor("player");
      const hand = useSharedCursor("hand");
      return (
        <>
          <button onClick={() => play?.setPlayback(10)}>play</button>
          <button onClick={() => hand?.setPointer(55)}>hover</button>
          <button onClick={() => hand?.setPointer(null)}>leave</button>
        </>
      );
    }
    renderWithStrata(
      <CursorScope>
        <Probe onRead={(v, o) => reads.push([v, o])} />
        <Players />
      </CursorScope>,
    );
    fireEvent.click(screen.getByText("play"));
    expect(reads.at(-1)).toEqual([10, "playback"]);
    fireEvent.click(screen.getByText("hover"));
    expect(reads.at(-1)).toEqual([55, "pointer"]);
    fireEvent.click(screen.getByText("play")); // playback goes on moving underneath
    expect(reads.at(-1)).toEqual([55, "pointer"]);
    fireEvent.click(screen.getByText("leave"));
    expect(reads.at(-1)).toEqual([10, "playback"]);
  });

  it("does not announce playback, and a leave from another member does not clear the pointer", async () => {
    vi.useFakeTimers();
    try {
      function Two() {
        const a = useSharedCursor("a");
        const b = useSharedCursor("b");
        return (
          <>
            <button onClick={() => a?.setPlayback(5)}>playback</button>
            <button onClick={() => a?.setPointer(7)}>point</button>
            <button onClick={() => b?.setPointer(null)}>other leaves</button>
          </>
        );
      }
      renderWithStrata(
        <CursorScope format={(x) => `at ${x}`}>
          <Two />
        </CursorScope>,
      );
      fireEvent.click(screen.getByText("playback"));
      await act(() => vi.advanceTimersByTimeAsync(1500));
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      fireEvent.click(screen.getByText("point"));
      fireEvent.click(screen.getByText("other leaves"));
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(screen.getByRole("status")).toHaveTextContent("at 7");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a shared x domain", () => {
  it("maps the pointer track onto the displayed range, not the series extent", () => {
    renderWithStrata(<LineChart {...props} xDomain={[0, 1000]} readout />);
    const slider = screen.getByRole("slider", { name: /read values/ });
    expect(slider).toHaveAttribute("max", "1000");
    expect(slider).toHaveAttribute("min", "0");
  });
});

describe("range (issue #244)", () => {
  const low = [10, 30, 70, 40, 20, 45];
  const high = [30, 60, 100, 80, 45, 70];
  const range = { low, high, label: "Lowest to highest in each stretch" };
  it("draws one area behind the line, names it in the key, and puts it in the table", () => {
    const { container } = renderWithStrata(<LineChart {...props} range={range} />);
    expect(container.querySelectorAll("path[data-chart-range]")).toHaveLength(1);
    expect(screen.getByText("Lowest to highest in each stretch", { selector: "span" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Elevation" });
    expect(within(table).getByRole("columnheader", { name: "Lowest to highest in each stretch" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /200 m/ })).toHaveTextContent("70 m up–100 m up");
  });
  it("widens the y-axis to the extremes, so a peak above every reading still shows", () => {
    const { container } = renderWithStrata(<LineChart {...props} series={[{ x: 0, y: 5 }, { x: 100, y: 6 }]} range={{ low: [0, 1], high: [500, 5], label: "Extremes" }} />);
    expect(container.textContent).toContain("500 m up");
  });
  it("is said in the readout", async () => {
    renderWithStrata(<LineChart {...props} range={range} readout />);
    const thumb = screen.getAllByRole("slider")[0];
    thumb.focus();
    await userEvent.keyboard("{Home}{ArrowRight}{ArrowRight}");
    expect(document.body.textContent).toContain("200 m: 87 m up (70 m up to 100 m up)");
  });
  it("draws nothing for a reading whose extremes are missing", () => {
    const { container } = renderWithStrata(<LineChart {...props} range={{ low: [1], high: [2], label: "x" }} />);
    expect(container.querySelectorAll("path[data-chart-range]")).toHaveLength(0);
  });
});
