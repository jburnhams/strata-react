import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompositionBar, format, type CompositionPart } from "../src";
import { serverStatus } from "./fixtures/server";

// The props are a union (`total` comes with `restLabel`), which Storybook's args types collapse,
// so each story renders the component directly.

const meta = {
  title: "Status and figures/CompositionBar",
  component: CompositionBar,
  decorators: [(Story) => <div className="max-w-lg"><Story /></div>],
} satisfies Meta;
export default meta;
type Story = StoryObj;

const { memory } = serverStatus;
const bytes = (v: number) => format.bytes(v);
const memoryParts: CompositionPart[] = [
  { key: "used", label: "Used by apps", value: memory.used },
  { key: "cached", label: "Cached files", value: memory.cached },
  { key: "buffers", label: "Buffers", value: memory.buffers },
];

/** Parts of a whole they do not fill: the remainder is the empty track, named "Free" in the table. */
export const Memory: Story = {
  render: () => (
    <CompositionBar label="Memory, 16 GB in all" parts={memoryParts} total={memory.total} restLabel="Free" formatValue={bytes} />
  ),
};

/** Parts that are the whole: no `total`, so the bar is full and there is no remainder row. */
export const KilnLoad: Story = {
  render: () => (
    <CompositionBar
      label="Friday's bisque, by member"
      parts={[
        { key: "priya", label: "Priya Shah", value: 14 },
        { key: "tom", label: "Tom Ellery", value: 9 },
        { key: "dev", label: "Dev Raman", value: 6 },
        { key: "other", label: "Four others", value: 11 },
      ]}
      formatValue={(v) => format.count(v, "piece")}
    />
  ),
};

/** A part with no amount keeps its row (saying 0) but draws no segment. */
export const EmptyPart: Story = {
  render: () => (
    <CompositionBar
      label="Memory, 16 GB in all"
      parts={[...memoryParts, { key: "swap", label: "Swap", value: 0 }]}
      total={memory.total}
      restLabel="Free"
      formatValue={bytes}
    />
  ),
};

/** On a phone: the bar and the table keep their order and the figures stay right-aligned. */
export const Phone: Story = { ...Memory, tags: ["visual-phone"] };

/** A part that is small but not zero (2.4 GB of a 512 GB disk) reads "<1%", never "0%", and keeps a sliver of the bar. */
export const SmallPart: Story = {
  render: () => (
    <CompositionBar
      label="Disk, 512 GB in all"
      parts={[
        { key: "photos", label: "Kiln photos", value: 180e9 },
        { key: "app", label: "This app's data", value: 2.4e9 },
      ]}
      total={512e9}
      restLabel="Free"
      formatValue={(v) => format.bytes(v)}
    />
  ),
};
