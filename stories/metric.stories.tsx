import type { Meta, StoryObj } from "@storybook/react-vite";
import { Metric, MetricStrip, format } from "../src";
import { bookings, kiln1Shelves } from "./fixtures/kiln";

const meta = { title: "Status and figures/MetricStrip", component: MetricStrip } satisfies Meta<typeof MetricStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

const waiting = bookings.filter((b) => b.kiln === 2 && b.state === "cooling").reduce((n, b) => n + b.pieces, 0);

/** Label over value, split by hairlines. No icons, sparklines or "+12%" pills; change in words. */
export const KilnRoom: Story = {
  args: { label: "Kiln room now", children: null },
  render: (args) => (
    <MetricStrip label={args.label}>
      <Metric label="Kiln 2 temperature" value={format.integer(212)} unit="°C" note="Safe to open below 200 °C, about 14:50" />
      <Metric label="Pieces waiting in kiln 2" value={format.integer(waiting)} note="From 4 members" />
      <Metric
        label="Shelves free in Friday's bisque"
        value={format.integer(kiln1Shelves.total - kiln1Shelves.booked)}
        unit={`of ${kiln1Shelves.total}`}
        note="Book by 17:00 on Thursday"
      />
    </MetricStrip>
  ),
};
