import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { LineChart, LineChartGroup, format } from "../src";
import { riverClips, riverElevation, riverPace, riverStops } from "./fixtures/route";
import { NOW_MIN, SAFE_TO_OPEN_C, heatScale, minuteToDate, planned, readings } from "./fixtures/kiln";

const hours = Array.from({ length: Math.floor(NOW_MIN / 360) + 1 }, (_, i) => i * 360);

const meta = {
  title: "Data/LineChart",
  component: LineChart,
  args: {
    label: "Kiln 2 temperature since 08:00 Wednesday",
    series: readings,
    seriesLabel: "Measured",
    formatX: (m: number) => format.shortDay.format(minuteToDate(m)),
    formatY: (t: number) => format.celsius(t),
    xTicks: hours,
  },
} satisfies Meta<typeof LineChart>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One series, one hue, direct labels on the peak and the current reading; no legend box. */
export const OneSeries: Story = {};

/** What the person compares against: the programmed firing (dashed) and the safe-to-open band. */
export const PlanAndBand: Story = {
  args: { planned, plannedLabel: "Programmed", band: { below: SAFE_TO_OPEN_C, label: `Safe to open below ${format.celsius(SAFE_TO_OPEN_C)}` } },
};

/** colourScale: the line coloured as the kiln glows. Only where the colour is a fact of the subject. */
export const ColouredAsTheKilnGlows: Story = {
  args: {
    ...PlanAndBand.args,
    colourScale: heatScale,
    colourScaleLabel: "coloured as the kiln glows",
  },
};

const cpu = Array.from({ length: 48 }, (_, i) => ({ x: i * 30, y: 1 + Math.round((Math.sin(i / 3) + 1) * 10) / 10 + (i === 30 ? 2 : 0) }));

/** yMax: a percentage pinned to 0 to 100%, so a machine at 2% CPU looks idle. Autoscaled, the same readings fill the chart and look busy. */
export const PinnedPercentage: Story = {
  args: {
    label: "CPU use over the last day",
    series: cpu,
    seriesLabel: "CPU",
    formatX: (m: number) => format.clock.format(new Date(Date.UTC(2026, 10, 5, 0, m))),
    formatY: (v: number) => format.percent(v / 100),
    xTicks: Array.from({ length: 8 }, (_, i) => i * 180),
    yMax: 100,
    height: 200,
  },
};

/** At phone width the x labels thin to every other tick, evenly, and the last stays inside the chart. */
export const Phone: Story = {
  ...PlanAndBand,
  tags: ["visual-phone"],
};

// Issue #79: a chart tied to something else on the screen. An elevation profile for a route: the
// area under the line is the meaning (height gained), so it is one flat tint.
const route = Array.from({ length: 26 }, (_, i) => ({ x: i * 200, y: Math.round(70 + 35 * Math.sin(i / 4) + 12 * Math.sin(i / 1.7)) }));
const routeArgs = {
  label: "Elevation along the route",
  series: route,
  seriesLabel: "Elevation",
  xLabel: "Distance",
  formatX: (x: number) => `${(x / 1000).toFixed(1)} km`,
  formatY: (y: number) => `${Math.round(y)} m`,
  xTicks: [0, 1000, 2000, 3000, 4000, 5000],
  yMin: 0,
  area: true,
};

/** A profile with a flat area and the current position as a rule with its value. */
export const ProfileWithCurrentPosition: Story = { args: { ...routeArgs, current: 2300 } };

/** `end`: with `current` set the last point is not marked "now" (a profile's last point is its finish); `end="now"` brings it back, `end="none"` removes it where there is no `current`. */
export const ProfileWithoutEndMarker: Story = { args: { ...routeArgs, end: "none" } };

/** Keyboard mode: focus the plot and the arrows move a reading along x; the reading is also its spoken value. */
export const ReadoutAtAPoint: Story = {
  args: { ...routeArgs, current: 2300, readout: (p) => `Dist: ${(p.x / 1000).toFixed(1)} km, Ele: ${p.y} m` },
  render: (args) => {
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      // The plot mounts once the chart has measured its width, so wait for it.
      const timer = setInterval(() => {
        const plot = ref.current?.querySelector<HTMLElement>("input[type=range]");
        if (!plot) return;
        clearInterval(timer);
        plot.focus();
        for (const key of ["Home", ...Array(8).fill("ArrowRight")]) plot.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      }, 50);
      return () => clearInterval(timer);
    }, []);
    return <div ref={ref}><LineChart {...args} /></div>;
  },
};

/** Phone width: the readout flips to the left of the rule near the right edge. */
export const ProfilePhone: Story = { tags: ["visual-phone"], args: { ...routeArgs, current: 4600, readout: true } };

/** Live: move the position, hover or use the arrows to read values, click or press Enter to pick a point. Skipped by the visual suite. */
export const LiveProfile: Story = {
  tags: ["no-visual"],
  args: { ...routeArgs },
  render: (args) => {
    const [current, setCurrent] = React.useState(1000);
    return (
      <div className="grid gap-2">
        <LineChart {...args} current={current} readout onPick={setCurrent} />
        <p className="type-body-sm text-muted-foreground">Picked: {args.formatX(current)}</p>
      </div>
    );
  },
};

// Issue #183: spans, marks, a log axis, and charts stacked on one axis (strata-360's elevation and pace).
const km = (x: number) => `${(x / 1000).toFixed(1)} km`;
const paceText = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} /km`;
const distanceTicks = ({ min, max }: { min: number; max: number }) => {
  const step = (max - min) / 5 > 1000 ? 1000 : 500;
  return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => Math.ceil(min / step) * step + i * step).filter((t) => t <= max);
};

/** Shaded spans for the stops, named in the key and for screen readers; twelve clip marks on the line (one tab stop, arrows between them), one selected. */
export const SpansAndMarks: Story = {
  args: {
    label: "Elevation along the run",
    series: riverElevation,
    seriesLabel: "Elevation",
    xLabel: "Distance",
    formatX: km,
    formatY: (y: number) => `${y} m`,
    xTicks: distanceTicks,
    yMin: 0,
    area: true,
    end: "none",
    spans: riverStops,
    marks: riverClips.map((m, i) => ({ ...m, selected: i === 4 })),
  },
};

/** A log axis with the faster pace at the top: ticks at 1, 2, 5 steps, so a long walk and a sprint both read. */
export const LogAxisFasterAtTheTop: Story = {
  args: {
    label: "Pace along the run",
    series: riverPace,
    seriesLabel: "Pace",
    xLabel: "Distance",
    formatX: km,
    formatY: paceText,
    xTicks: distanceTicks,
    yScale: "log",
    yInvert: true,
    end: "none",
    spans: riverStops,
  },
};

/** Elevation and pace stacked on one x axis, stops shaded and every clip marked on both. Hover or arrow in either chart: the rule and each chart's own reading appear in both. */
export const StackedWithSharedReading: Story = {
  render: () => (
    <LineChartGroup
      label="Elevation and pace along the run"
      xLabel="Distance"
      formatX={km}
      xTicks={distanceTicks}
      spans={riverStops}
      marks={riverClips}
      current={2600}
      charts={[
        { series: riverElevation, seriesLabel: "Elevation", formatY: (y: number) => `${y} m`, yMin: 0, area: true, end: "none", height: 170 },
        { series: riverPace, seriesLabel: "Pace", formatY: paceText, yScale: "log", yInvert: true, end: "none", height: 170 },
      ]}
    />
  ),
};

/** Phone width: the stack keeps its single set of x labels. */
export const StackedPhone: Story = { ...StackedWithSharedReading, tags: ["visual-phone"] };

function LiveGroupStage() {
  const [along, setAlong] = React.useState(0);
  React.useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      setAlong(((now - started) / 30_000) % 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <LineChartGroup
      label="Elevation and pace along the run"
      xLabel="Distance"
      formatX={km}
      xTicks={distanceTicks}
      spans={riverStops}
      marks={riverClips}
      current={along * 5200}
      charts={[
        { series: riverElevation, seriesLabel: "Elevation", formatY: (y: number) => `${y} m`, yMin: 0, area: true, end: "none", height: 170 },
        { series: riverPace, seriesLabel: "Pace", formatY: paceText, yScale: "log", yInvert: true, end: "none", height: 170 },
      ]}
    />
  );
}

/** The stack with a position moving every frame. Skipped by the visual suite. */
export const LiveGroup: Story = { tags: ["no-visual"], render: () => <LiveGroupStage /> };
