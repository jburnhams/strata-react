import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LineChart, type LineChartProps, type Point } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #79: a chart tied to something else on the screen. The new options draw nothing unless given.

const profile: Point[] = [0, 100, 200, 300, 400, 500].map((x, i) => ({ x, y: [20, 45, 87, 60, 30, 55][i] }));
const formatX = (x: number) => `${x} m`;
const formatY = (y: number) => `${y} m up`;
// The slider is a range input inside a track; the pointer acts on the track, which has the plot's box.
const trackOf = (plot: HTMLElement) => plot.closest("[style*='touch-action']") as HTMLElement;
const props: LineChartProps = { label: "Elevation along the route", series: profile, seriesLabel: "Elevation", formatX, formatY, xTicks: [0, 250, 500], yMin: 0, yMax: 100 };

describe("LineChart without the new options", () => {
  it("draws no slider, no rule and no area", () => {
    const { container } = renderWithStrata(<LineChart {...props} />);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(container.querySelector('path[fill-opacity]')).toBeNull();
    expect(screen.getByRole("img", { name: "Elevation along the route" })).toBeInTheDocument();
  });
});

describe("current position", () => {
  it("draws the current x as a rule with its value read off the line, and moves it without redrawing the axis", () => {
    const fx = vi.fn(formatX);
    const fy = vi.fn(formatY);
    const { rerender } = renderWithStrata(<LineChart {...props} formatX={fx} formatY={fy} current={100} />);
    expect(screen.getByText("100 m: 45 m up")).toBeInTheDocument();
    const xCalls = fx.mock.calls.length;
    const yCalls = fy.mock.calls.length;
    rerender(<LineChart {...props} formatX={fx} formatY={fy} current={150} />);
    // Halfway between 45 and 87 on the line.
    expect(screen.getByText("150 m: 66 m up")).toBeInTheDocument();
    // Only the rule's own label was formatted: the ticks, labels and table were not drawn again.
    expect(fx.mock.calls.length - xCalls).toBeLessThanOrEqual(2);
    expect(fy.mock.calls.length - yCalls).toBeLessThanOrEqual(2);
  });

  it("keeps the rule inside the axis for a position past either end", () => {
    renderWithStrata(<LineChart {...props} current={9999} />);
    expect(screen.getByText("500 m: 55 m up")).toBeInTheDocument();
  });

  it("words the value with formatCurrent", () => {
    renderWithStrata(<LineChart {...props} current={200} formatCurrent={({ x, y }) => `Dist: ${x} m, Ele: ${y} m`} />);
    expect(screen.getByText("Dist: 200 m, Ele: 87 m")).toBeInTheDocument();
  });
});

describe("reading a value", () => {
  it("is one slider on the plot, named for what it reads, with the reading as its value text", () => {
    renderWithStrata(<LineChart {...props} readout />);
    const plot = screen.getByRole("slider", { name: "Elevation along the route: read values" });
    expect(plot).toHaveAttribute("min", "0");
    expect(plot).toHaveAttribute("max", "500");
    expect(plot).toHaveAttribute("aria-valuetext", "500 m: 55 m up");
  });

  it("moves along x by keyboard, announcing each reading through its value text, and stops at the ends", async () => {
    const user = userEvent.setup();
    renderWithStrata(<LineChart {...props} readout />);
    const plot = screen.getByRole("slider");
    plot.focus();
    await user.keyboard("{Home}");
    expect(plot).toHaveAttribute("aria-valuetext", "0 m: 20 m up");
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(plot).toHaveAttribute("aria-valuetext", "200 m: 87 m up");
    expect(screen.getAllByText("200 m: 87 m up").length).toBeGreaterThan(0); // drawn on the chart too
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(plot).toHaveAttribute("aria-valuetext", "0 m: 20 m up");
    await user.keyboard("{End}{ArrowRight}");
    expect(plot).toHaveAttribute("aria-valuetext", "500 m: 55 m up");
  });

  it("words the reading with a function, as 'Dist: 412 m, Ele: 87 m'", async () => {
    const user = userEvent.setup();
    renderWithStrata(<LineChart {...props} readout={(p) => `Dist: ${p.x} m, Ele: ${p.y} m`} />);
    const plot = screen.getByRole("slider");
    plot.focus();
    await user.keyboard("{Home}{ArrowRight}");
    expect(plot).toHaveAttribute("aria-valuetext", "Dist: 100 m, Ele: 45 m");
  });

  it("reads the value at the pointer, and clears it when the pointer leaves", () => {
    renderWithStrata(<LineChart {...props} readout />);
    const plot = screen.getByRole("slider");
    // The layout shim gives the plot a 640 px box; the plot runs from 56 px, so x of 56 + 0.4 of its width is 200 m.
    const track = trackOf(plot);
    track.getBoundingClientRect = () => new DOMRect(56, 16, 568, 236);
    fireEvent.pointerMove(track, { clientX: 56 + 568 * 0.4 });
    expect(plot).toHaveAttribute("aria-valuetext", "200 m: 87 m up");
    fireEvent.pointerLeave(track);
    expect(plot).toHaveAttribute("aria-valuetext", "500 m: 55 m up");
  });
});

describe("one selection for what is announced, drawn and picked", () => {
  it("picks the reading it announces when the current rule is set (Enter and the first arrow start there)", async () => {
    const user = userEvent.setup();
    const picked: number[] = [];
    renderWithStrata(<LineChart {...props} readout current={100} onPick={(x) => picked.push(x)} />);
    const plot = screen.getByRole("slider");
    plot.focus();
    const announced = plot.getAttribute("aria-valuetext");
    await user.keyboard("{Enter}");
    expect(announced).toBe("100 m: 45 m up");
    expect(picked).toEqual([100]);
    await user.keyboard("{ArrowRight}");
    expect(plot).toHaveAttribute("aria-valuetext", "200 m: 87 m up");
  });

  it("lets a key take over from a pointer resting on the plot", async () => {
    const user = userEvent.setup();
    const picked: number[] = [];
    renderWithStrata(<LineChart {...props} readout onPick={(x) => picked.push(x)} />);
    const plot = screen.getByRole("slider");
    const track = trackOf(plot);
    track.getBoundingClientRect = () => new DOMRect(56, 16, 568, 236);
    fireEvent.pointerMove(track, { clientX: 56 + 568 * 0.4 }); // 200 m, and the pointer stays
    plot.focus();
    await user.keyboard("{ArrowRight}");
    expect(plot).toHaveAttribute("aria-valuetext", "300 m: 60 m up");
    await user.keyboard("{Enter}");
    expect(picked).toEqual([300]);
  });

  it("clamps a stored keyboard position when the series is replaced by a shorter one", async () => {
    const user = userEvent.setup();
    const picked: number[] = [];
    const { rerender } = renderWithStrata(<LineChart {...props} readout onPick={(x) => picked.push(x)} />);
    const plot = screen.getByRole("slider");
    plot.focus();
    await user.keyboard("{Home}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    rerender(<LineChart {...props} readout onPick={(x) => picked.push(x)} series={profile.slice(0, 3)} xTicks={[0, 100, 200]} />);
    expect(plot).toHaveAttribute("aria-valuetext", "200 m: 87 m up");
    await user.keyboard("{Enter}");
    expect(picked).toEqual([200]);
  });
});

describe("picking a reading", () => {
  it("reports the x of the reading on Enter, and on a click", async () => {
    const user = userEvent.setup();
    const picked: number[] = [];
    renderWithStrata(<LineChart {...props} onPick={(x) => picked.push(x)} />);
    const plot = screen.getByRole("slider");
    plot.focus();
    await user.keyboard("{Home}{ArrowRight}{ArrowRight}{ArrowRight}{Enter}");
    expect(picked).toEqual([300]);
    const track = trackOf(plot);
    track.getBoundingClientRect = () => new DOMRect(56, 16, 568, 236);
    fireEvent.pointerDown(track, { button: 0, clientX: 56 + 568 * 0.2, pointerId: 1 });
    fireEvent.pointerUp(track, { button: 0, clientX: 56 + 568 * 0.2, pointerId: 1 });
    expect(picked).toEqual([300, 100]);
  });

  it("picking does not need the readout to be on", () => {
    renderWithStrata(<LineChart {...props} onPick={() => {}} />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });
});

describe("area", () => {
  it("fills one flat pale tint under the line, never a gradient, when asked", () => {
    const { container } = renderWithStrata(<LineChart {...props} area />);
    const fill = container.querySelector('path[fill-opacity="0.12"]');
    expect(fill).not.toBeNull();
    expect(fill!.getAttribute("fill")).toBe("var(--chart-1)");
    expect(container.querySelectorAll("linearGradient")).toHaveLength(0);
  });
  it("does not fill with a colour scale's gradient ink: the fill is still the one flat tint", () => {
    const { container } = renderWithStrata(<LineChart {...props} area colourScale={[{ at: 0, colour: "#00f" }, { at: 60, colour: "#f00" }]} />);
    expect(container.querySelector('path[fill-opacity="0.12"]')!.getAttribute("fill")).toBe("var(--chart-1)");
  });
});
