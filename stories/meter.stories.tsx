import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTable, Meter, format, type Column } from "../src";
import { diskThresholds, serverStatus, type Disk } from "./fixtures/server";

const meta = {
  title: "Status and figures/Meter",
  component: Meter,
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof Meter>;
export default meta;
type Story = StoryObj<typeof meta>;

const GB = 1e9;

/** Below every threshold: one chart hue, the figure in words, and the notches the reading is judged against. */
export const Default: Story = {
  args: { label: "/ (system and apps)", value: 18.4 * GB, max: 64 * GB, thresholds: diskThresholds, detail: "18.4 GB of 64 GB" },
};

/** Past the first threshold: the fill takes the warning ink and the state is said as a word. */
export const Warning: Story = {
  args: { label: "/mnt/backup", value: 1640 * GB, max: 1863 * GB, thresholds: diskThresholds, detail: "1.6 TB of 1.9 TB" },
};

/** Past the last threshold: danger beats warning when both are reached. */
export const Danger: Story = {
  args: { label: "/srv/photos", value: 431 * GB, max: 466 * GB, thresholds: diskThresholds, detail: "431 GB of 466 GB" },
};

/** A share passed as is (`max` defaults to 1), with no thresholds: just the level. */
export const NoThresholds: Story = {
  args: { label: "Shelves booked in Friday's bisque", value: 0.625, valueText: "10 of 16 booked" },
};

/** `worseWhen="lower"`: emptier is the problem, so the thresholds apply at or below their share. */
export const WorseWhenLower: Story = {
  args: {
    label: "Kiln controller backup battery",
    value: 0.14,
    valueText: `${format.percent(0.14)} left`,
    worseWhen: "lower",
    thresholds: [
      { at: 0.3, tone: "warning", label: "Order a battery" },
      { at: 0.1, tone: "danger", label: "Replace now" },
    ],
  },
};

const columns: Column<Disk>[] = [
  { key: "mount", header: "Disk", cell: (d) => <span className="font-mono">{d.mount}</span> },
  {
    key: "space",
    header: "Space used",
    className: "w-2/3",
    cell: (d) => <Meter label={`${d.mount} space used`} hideLabel value={d.used} max={d.size} thresholds={diskThresholds} />,
  },
];

/** In a table row with `hideLabel`: the row names the disk, and the label stays the meter's accessible name. */
export const InATable: Story = {
  args: { label: "", value: 0 },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
  render: () => <DataTable caption="Disks" columns={columns} rows={serverStatus.disks} rowKey={(d) => d.id} />,
};
