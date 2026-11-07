import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Done, LineChart, Metric, MetricStrip, Status } from "../../src";
import { fitTicks, yScale } from "../../src/components/line-chart";

describe("Done", () => {
  it("moves focus to its heading so the result is announced", () => {
    render(<Done title="Booked: 6 pieces in kiln 2" next="Bring them by 17:00 on Monday." />);
    const heading = screen.getByRole("heading", { name: "Booked: 6 pieces in kiln 2" });
    expect(heading).toHaveFocus();
    expect(screen.getByRole("region", { name: "Booked: 6 pieces in kiln 2" })).toHaveTextContent("Bring them by 17:00 on Monday.");
  });
});

describe("Status and Metric", () => {
  it("a status is a word", () => {
    render(<Status tone="success">Ready to collect</Status>);
    expect(screen.getByText("Ready to collect")).toBeInTheDocument();
  });

  it("a metric strip is a description list", () => {
    render(
      <MetricStrip label="Kiln room now">
        <Metric label="Kiln 2 temperature" value="212" unit="°C" />
      </MetricStrip>,
    );
    expect(screen.getByLabelText("Kiln room now").tagName).toBe("DL");
    expect(screen.getByRole("term")).toHaveTextContent("Kiln 2 temperature");
  });
});

describe("LineChart", () => {
  const series = [
    { x: 0, y: 20 },
    { x: 60, y: 900 },
    { x: 120, y: 400 },
  ];

  it("names the chart, labels the peak and now, and keeps every reading in a table", () => {
    render(
      <LineChart label="Kiln 2 temperature" series={series} seriesLabel="Measured" formatX={(x) => `${x} min`} formatY={(y) => `${y} °C`} xTicks={[0, 60, 120]} />,
    );
    expect(screen.getByRole("img", { name: "Kiln 2 temperature" })).toBeInTheDocument();
    expect(screen.getByText("900 °C peak")).toBeInTheDocument();
    expect(screen.getByText("400 °C now")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(series.length + 1);
  });

  it("puts gridlines on a step people write on a scale", () => {
    render(<LineChart label="t" series={series} seriesLabel="s" formatX={String} formatY={String} xTicks={[]} />);
    // max 900 → step 250 → 0, 250, 500, 750, 1000
    for (const t of ["0", "250", "500", "750", "1000"]) expect(screen.getAllByText(t).length).toBeGreaterThan(0);
  });
});

describe("LineChart with all-zero data", () => {
  it("draws without NaN coordinates", () => {
    const { container } = render(
      <LineChart label="Flat" series={[{ x: 0, y: 0 }, { x: 10, y: 0 }]} seriesLabel="s" formatX={String} formatY={String} xTicks={[0, 10]} />,
    );
    expect(container.innerHTML).not.toContain("NaN");
  });
});

describe("LineChart y-axis range", () => {
  const cpu = [
    { x: 0, y: 1 },
    { x: 1, y: 3 },
    { x: 2, y: 2 },
  ];
  const yLabels = (container: HTMLElement) =>
    [...container.querySelectorAll("text[text-anchor='end']")].map((t) => t.textContent).filter((t) => !t?.endsWith("now"));

  it("autoscales a low reading to a scale that makes it look busy", () => {
    const { container } = render(<LineChart label="CPU" series={cpu} seriesLabel="CPU" formatX={String} formatY={(v) => `${v}%`} xTicks={[]} />);
    expect(yLabels(container)).toEqual(["0%", "1%", "2%", "3%", "4%"]);
  });

  it("yMax pins the top, so 3% sits near the floor of a 0 to 100% axis", () => {
    const { container } = render(<LineChart label="CPU" series={cpu} seriesLabel="CPU" formatX={String} formatY={(v) => `${v}%`} xTicks={[]} yMax={100} />);
    expect(yLabels(container)).toEqual(["0%", "25%", "50%", "75%", "100%"]);
  });

  it("a pin never hides a reading: a value past it widens the axis", () => {
    expect(yScale([20, 130], { max: 100 })).toMatchObject({ min: 0, max: 160 });
    expect(yScale([5, 30], { min: 10 })).toMatchObject({ min: 0, max: 40 });
  });

  it("yMin pins the bottom, and both pins give four equal steps", () => {
    expect(yScale([18, 24], { min: 15, max: 35 }).ticks).toEqual([15, 20, 25, 30, 35]);
    expect(yScale([960, 1010], { min: 950 })).toMatchObject({ min: 950, max: 1030 });
  });

  it("autoscales through zero for negative readings", () => {
    expect(yScale([-7, 12])).toMatchObject({ min: -10, max: 30 });
    expect(yScale([0, 900]).ticks).toEqual([0, 250, 500, 750, 1000]);
    expect(yScale([])).toMatchObject({ min: 0, max: 4 });
    // Every reading at a negative pinned top: no span to round, so one opens below.
    expect(yScale([-10, -10], { max: -10 })).toMatchObject({ min: -20, max: -10 });
  });
});

describe("LineChart x labels", () => {
  const scale = (x: number) => x; // one pixel per unit
  const wide = () => 60;

  it("keeps every tick when the labels fit", () => {
    expect(fitTicks([0, 100, 200, 300], scale, wide)).toEqual([0, 100, 200, 300]);
  });

  it("drops every other tick, evenly, when neighbours would overlap", () => {
    expect(fitTicks([0, 50, 100, 150, 200, 250], scale, wide)).toEqual([0, 100, 200]);
  });

  it("fits against the drawn positions, so an end label pulled inside the chart cannot collide", () => {
    // Centres 56…356 fit at 75px apart, but the last label pulled in to 340.5 would overlap.
    const clamped = (x: number) => Math.min(x, 340.5);
    expect(fitTicks([56, 131, 206, 281, 356], scale, () => 63)).toHaveLength(5);
    expect(fitTicks([56, 131, 206, 281, 356], clamped, () => 63)).toEqual([56, 206, 356]);
  });
});
