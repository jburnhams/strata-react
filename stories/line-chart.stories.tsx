import type { Meta, StoryObj } from "@storybook/react-vite";
import { LineChart, format } from "../src";
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
