import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ByteView, PropertyList, type ByteRange } from "../src";

// Issue #360: a windowed hex dump for the file nothing else understands. Fixed bytes only (no random),
// so the baselines are stable.

const meta = { title: "Data/ByteView", component: ByteView, parameters: { layout: "padded" }, args: { label: "bytes", bytes: new Uint8Array() } } satisfies Meta<typeof ByteView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A PAK header and some names: magic, a directory offset and length, then text. */
const pak = (() => {
  const out = new Uint8Array(420);
  out.set(new TextEncoder().encode("PACK"), 0);
  new DataView(out.buffer).setUint32(4, 0x0000_0c04, true);
  new DataView(out.buffer).setUint32(8, 64, true);
  const names = ["textures/e1u1/clip.wal", "maps/base1.bsp", "sound/world/klaxon2.wav", "models/items/adrenal/tris.md2"];
  let at = 12;
  for (const n of names) {
    out.set(new TextEncoder().encode(n), at);
    at += 56;
  }
  for (let i = 300; i < out.length; i++) out[i] = (i * 37) % 251;
  return out;
})();

/** The whole dump: offsets, sixteen bytes a row in two groups of eight, and the printable characters. The group is one tab stop; the status line says where the cursor is. */
export const Default: Story = { args: { label: "pak0.pak", bytes: pak, className: "max-w-3xl" } };

/** A byte range chosen, with the app's own ranges tinted by tone and named in the status ("in header"): colour is never the only word. */
export const SelectionAndHighlights: Story = {
  args: {
    label: "pak0.pak",
    bytes: pak,
    className: "max-w-3xl",
    defaultSelection: { start: 4, end: 8 },
    highlight: [
      { start: 0, end: 4, tone: "info", label: "magic" },
      { start: 4, end: 12, tone: "success", label: "directory offset and length" },
      { start: 12, end: 34, tone: "warning", label: "first name" },
    ],
  },
};

/** A window into a larger file: the offsets column starts at 0x4000. */
export const WithOffset: Story = { args: { label: "pak0.pak, window", bytes: pak.slice(0, 96), offset: 0x4000, className: "max-w-3xl" } };

/** No bytes: the status says so instead of drawing an empty box. */
export const Empty: Story = { args: { label: "empty.bin", bytes: new Uint8Array(), className: "max-w-3xl" } };

/** A 50 MB file scrolls: only the rows in view exist, and the scroll bar is scaled past the browser's element height limit. Interactive. */
export const FiftyMegabytes: Story = {
  tags: ["no-visual"],
  args: { label: "huge.bin", bytes: new Uint8Array(50 * 1024 * 1024).map((_, i) => (i * 31) & 255), className: "max-w-3xl" },
};

/** The range is reported as `{ start, end }` (end exclusive), so a decoder can sit beside it: here the first four selected bytes as a little-endian integer. Interactive. */
export const WithADecoder: Story = {
  tags: ["no-visual"],
  render: () => {
    const [range, setRange] = React.useState<ByteRange>({ start: 4, end: 8 });
    const view = new DataView(pak.buffer, range.start, Math.max(0, Math.min(4, range.end - range.start)));
    const complete = range.end - range.start >= 4;
    return (
      <div className="grid max-w-3xl gap-4">
        <ByteView label="pak0.pak" bytes={pak} defaultSelection={range} onSelectionChange={setRange} />
        <PropertyList
          label="Selection"
          items={[
            { term: "Bytes", value: `${range.end - range.start}` },
            { term: "As uint32", value: complete ? view.getUint32(0, true).toLocaleString("en-US") : null },
            { term: "As float32", value: complete ? String(Math.round(view.getFloat32(0, true) * 1e6) / 1e6) : null },
          ]}
        />
      </div>
    );
  },
};
