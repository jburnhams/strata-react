import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { LineChart, MissingFile, format } from "../../src";
import { renderWithStrata } from "../../src/testing";

describe("MissingFile in a narrow column", () => {
  it("keeps the whole name in its own element and the status and Relink together, with a thumbnail beside them", () => {
    renderWithStrata(
      <MissingFile
        name="parkrun-saturday-morning.gpx"
        accept={[".gpx"]}
        onRelink={() => undefined}
        thumbnail={<img alt="Last seen" src="/t.jpg" />}
      />,
    );
    const name = screen.getByText("parkrun-saturday-morning.gpx");
    expect(name).toHaveAttribute("title", "parkrun-saturday-morning.gpx");
    expect(name).not.toHaveClass("truncate");
    expect(name).toHaveClass("break-words");
    expect(screen.getByRole("img", { name: "Last seen" })).toBeInTheDocument();
    const status = screen.getByText("File missing");
    const relink = screen.getByRole("button", { name: "Relink parkrun-saturday-morning.gpx" });
    expect(status.closest("div")).toBe(relink.closest("div"));
  });
});

describe("LineChart x label", () => {
  const props = {
    label: "Elevation along the route",
    series: [
      { x: 0, y: 70 },
      { x: 1000, y: 90 },
    ],
    seriesLabel: "Elevation",
    formatX: (x: number) => `${x / 1000} km`,
    formatY: (y: number) => `${y} m`,
    xTicks: [0, 1000],
  };

  it("heads the table's first column with what x is, or Time by default", () => {
    const first = renderWithStrata(<LineChart {...props} xLabel="Distance" />);
    expect(screen.getByRole("columnheader", { name: "Distance" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Time" })).toBeNull();
    first.unmount();
    renderWithStrata(<LineChart {...props} />);
    expect(screen.getByRole("columnheader", { name: "Time" })).toBeInTheDocument();
  });
});

describe("format.timecode frames", () => {
  it("is always four parts, so it cannot be read as hours", () => {
    expect(format.timecode(65, { precision: "frames", fps: 30 })).toBe("0:01:05:00");
    expect(format.timecode(3665, { precision: "frames", fps: 30 })).toBe("1:01:05:00");
    expect(format.timecode(65).split(":")).toHaveLength(2);
  });
});
