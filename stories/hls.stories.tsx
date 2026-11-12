import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { MediaPlayer } from "../src";
import { attachHls } from "../src/hls";

// Issue #179: a stream. The segments are a real twelve-second test card (`.storybook/public/hls/`), so
// hls.js plays real media in the browser (native HLS in Safari). The growing playlist is the mock's
// (`stories/mocks/handlers.ts`): one segment at first, one more every three seconds, an end-list at six.
// Both stories are skipped by the visual suite: they play.

const meta = { title: "Actions/Media player (streams)", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A finished HLS stream through `attach={attachHls}`: the same player, with its seek bar, time and speed. */
export const Stream: Story = {
  tags: ["no-visual"],
  render: () => (
    <div className="max-w-xl">
      <MediaPlayer label="Preview" kind="video" src="hls/film.m3u8" attach={attachHls} controls="strata" />
    </div>
  ),
};

function Growing() {
  // One showing of the stream: the mock counts from this moment.
  const [src] = React.useState(() => `hls/growing.m3u8?start=${Date.now()}`);
  const [made, setMade] = React.useState(1);
  React.useEffect(() => {
    const t = setInterval(() => setMade((m) => Math.min(6, m + 1)), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="max-w-xl">
      <MediaPlayer
        label="Preview of the film"
        kind="video"
        sources={[{ src, title: "Film", duration: 12 }]}
        attach={attachHls}
        growing={made < 6 ? { status: `${made} of 6 scenes made` } : undefined}
        controls="strata"
      />
    </div>
  );
}

/** A stream still being made: it starts after one segment, the seek bar shows the part that exists, "Still being made" says how far, and playing to the end of what exists waits (and says so) until the next scene lands. */
export const StillBeingMade: Story = { tags: ["no-visual"], render: () => <Growing /> };
