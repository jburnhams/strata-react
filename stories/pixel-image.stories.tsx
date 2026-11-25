import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, PixelImage, TextLink, rgbaToBlob, useObjectUrl } from "../src";

// Issue #359: a decoded RGBA buffer on a canvas with square pixels. The textures are made from
// arithmetic (a brick wall, a round sprite with clear corners), so the baselines hold no font and no file.

const meta = { title: "Data/PixelImage", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function bricks(w: number, h: number) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 4);
      const shifted = (x + (row % 2) * 4) % 8;
      const mortar = y % 4 === 0 || shifted === 0;
      const i = (y * w + x) * 4;
      out.set(mortar ? [168, 160, 150, 255] : [150 + ((x * 7 + y * 3) % 24), 70 + ((x * 5) % 12), 52, 255], i);
    }
  return out;
}
/** A round sprite: the corners are fully clear (alpha 0), which is what palette index 255 becomes. */
function sprite(n: number) {
  const out = new Uint8Array(n * n * 4);
  const c = (n - 1) / 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c);
      out.set(d <= c ? [Math.round(255 - (d / c) * 140), 190, 40, 255] : [0, 0, 0, 0], (y * n + x) * 4);
    }
  return out;
}

/** A 32×32 texture fitted to 512px: sixteen screen pixels to each, square and unsmoothed. The canvas is named with its size and zoom. */
export const Texture: Story = { render: () => <PixelImage label="textures/e1u1/brick.wal" width={32} height={32} rgba={bricks(32, 32)} /> };

/** A sprite with clear corners over the checkerboard, so transparent reads as transparent. */
export const Transparency: Story = { render: () => <PixelImage label="sprites/orb" width={24} height={24} rgba={sprite(24)} zoom={8} /> };

/** A zoom is a whole number: 2.6 is drawn at 3. */
export const WholeZoom: Story = { render: () => <PixelImage label="Palette swatch" width={16} height={16} rgba={bricks(16, 16)} zoom={2.6} /> };

/** Bigger than `maxSize`: drawn at 1× and scrolled in its box, never shrunk by a fraction. */
export const LargerThanTheBox: Story = { render: () => <PixelImage label="lightmap" width={640} height={320} rgba={bricks(640, 320)} maxSize={400} className="max-w-md" /> };

/** A buffer of the wrong length is not half-drawn: it is named “no picture data”. */
export const WrongLength: Story = { render: () => <PixelImage label="broken.wal" width={8} height={8} rgba={new Uint8Array(20)} /> };

/** `rgbaToBlob` and `useObjectUrl` make the picture a download without the app writing either. Interactive. */
export const Download: Story = {
  tags: ["no-visual"],
  render: () => {
    const rgba = React.useMemo(() => bricks(32, 32), []);
    const [png, setPng] = React.useState<Blob | null>(null);
    const url = useObjectUrl(png);
    return (
      <div className="grid max-w-sm justify-items-start gap-3">
        <PixelImage label="brick.wal" width={32} height={32} rgba={rgba} zoom={6} />
        <Button onPress={() => void rgbaToBlob(32, 32, rgba).then(setPng)}>Prepare PNG</Button>
        {url && <TextLink href={url} download="brick.png">Download brick.png</TextLink>}
      </div>
    );
  },
};
