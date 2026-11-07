import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Done, LineChart, Metric, MetricStrip, Status } from "../../src";

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
