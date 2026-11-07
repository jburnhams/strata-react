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
