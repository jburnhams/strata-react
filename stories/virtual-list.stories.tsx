import type { Meta, StoryObj } from "@storybook/react-vite";
import { VirtualList, format } from "../src";
import { minuteToDate, readings } from "./fixtures/kiln";

type Reading = { x: number; y: number };

// Every minute of the firing as a log: 1,800 rows, of which only the visible ones render.
const log: Reading[] = Array.from({ length: readings[readings.length - 1].x + 1 }, (_, m) => {
  const after = readings.findIndex((r) => r.x >= m);
  const b = readings[Math.max(0, after)];
  const a = readings[Math.max(0, after - 1)];
  const y = b.x === a.x ? b.y : a.y + ((b.y - a.y) * (m - a.x)) / (b.x - a.x);
  return { x: m, y: Math.round(y) };
}).reverse();

function Row({ r }: { r: Reading }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 type-body-sm">
      <span className="text-muted-foreground tabular-nums">{format.shortDay.format(minuteToDate(r.x))}</span>
      <span className="tabular-nums">{format.celsius(r.y)}</span>
    </div>
  );
}

const meta = {
  title: "Data/VirtualList",
  component: VirtualList<Reading>,
  args: { label: "Kiln 2 log, newest first", items: log, itemKey: (r: Reading) => String(r.x), children: (r: Reading) => <Row r={r} /> },
} satisfies Meta<typeof VirtualList<Reading>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LongLog: Story = { args: { height: 360, estimateSize: 37 } };
export const ShortList: Story = { args: { items: log.slice(0, 5) } };
