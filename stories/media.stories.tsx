import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { MediaStage, RateChoice, SeekBar, StageGuides, TimeReadout, Transport, VolumeControl } from "../src";

// Issue #78: the controls around anything that plays. The app owns the player; these are drawn
// from its state, so the same set serves a video, a recording and a replay of a kiln firing. The
// stories show each resting state; the stage stories show a picture at three aspect ratios with
// guides over it.

type Props = { playing?: boolean; time?: number; volume?: number; marks?: boolean; precision?: "seconds" | "ms" | "frames"; compact?: boolean };

function Player({ playing = false, time: t0 = 83, volume: v0 = 80, marks, precision, compact }: Props) {
  const [time, setTime] = React.useState(t0);
  const [volume, setVolume] = React.useState(v0);
  const [rate, setRate] = React.useState(1);
  const duration = 245;
  return (
    <div data-density={compact ? "compact" : undefined} className="grid w-full max-w-3xl gap-2">
      <SeekBar time={time} duration={duration} onSeek={setTime} buffered={170} precision={precision} marks={marks ? [{ time: 40, label: "Pour begins" }, { time: 150, label: "Peak" }] : []} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Transport playing={playing} onPlayPause={() => {}} onStop={() => {}} onStepBack={() => {}} onStepForward={() => {}} onToStart={() => {}} onToEnd={() => {}} />
        <TimeReadout time={time} duration={duration} precision={precision} />
        <span className="ml-auto flex items-center gap-3">
          <RateChoice rate={rate} onRateChange={setRate} />
          <VolumeControl volume={volume} onVolumeChange={setVolume} />
        </span>
      </div>
    </div>
  );
}

const meta = { title: "Actions/Media playback", component: Player } satisfies Meta<typeof Player>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Playing: Story = { args: { playing: true, time: 120 } };
export const Muted: Story = { args: { volume: 0 } };
export const AtTheEnd: Story = { args: { time: 245 } };
/** Named points on the bar (chapters, markers); each can be pressed to seek there. */
export const WithMarks: Story = { args: { marks: true } };
/** Frame-accurate timecode for an editor: m:ss:ff at 30 frames a second. */
export const FrameTimecode: Story = { args: { precision: "frames", time: 83.5 } };
export const Compact: Story = { args: { compact: true } };
export const Phone: Story = { tags: ["visual-phone"], render: () => <div className="w-full"><Player marks /></div> };

function Stage({ aspect, guides }: { aspect: `${number}/${number}`; guides?: boolean }) {
  return (
    <div className="h-64 w-96">
      <MediaStage aspect={aspect} label="Preview" className="size-full">
        <div className="grid size-full place-items-center bg-muted type-heading">Frame</div>
        {guides && <StageGuides safe thirds centre />}
      </MediaStage>
    </div>
  );
}

/** Landscape, portrait and square pictures in the same pane: the stage letterboxes on the sunken surface role. */
export const StageAspectRatios: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Stage aspect="16/9" guides />
      <Stage aspect="9/16" guides />
      <Stage aspect="1/1" />
    </div>
  ),
};
