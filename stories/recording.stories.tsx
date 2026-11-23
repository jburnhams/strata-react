import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Alert, Button, InputLevel, MediaPlayer, MicrophoneContext, TakeLevel, format, useRecorder, type Recording } from "../src";
import { fakeMicrophone } from "../src/testing/microphone";

// Recording speech (from strata-voice's studio): the live level while a take runs, the verdict on a
// take once it ends, and a whole booth on the fake microphone (`strata-react/testing`), since
// Storybook and the visual suite have no hardware. The resting states are the baselines; the booth
// records, so it is tagged `no-visual`.

const meta = { title: "Actions/Recording", parameters: { layout: "padded" }, decorators: [(Story) => <div className="grid max-w-xl gap-4"><Story /></div>] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A good level for speech, partway through a take: the peak in dBFS and the running time against the longest take. */
export const LevelWhileRecording: Story = { render: () => <InputLevel level={-12} seconds={4.2} maxSeconds={60} /> };

/** Past -3 dBFS: the fill takes the danger ink and "Too loud" is said as a word, before the take clips. */
export const LevelTooLoud: Story = { render: () => <InputLevel level={-1.5} seconds={7} maxSeconds={60} /> };

/** The verdict on each kind of take, with what to do about it. */
export const TakeVerdicts: Story = {
  render: () => (
    <>
      <TakeLevel peak={-9.6} lead={`Kept ${format.runningTime(4.2)}`} />
      <TakeLevel peak={-38} lead={`Kept ${format.runningTime(3.1)}`} />
      <TakeLevel peak={-0.2} lead={`Kept ${format.runningTime(5.8)}`} />
    </>
  ),
};

function Booth({ maxSeconds }: { maxSeconds: number }) {
  const recorder = useRecorder({ maxSeconds });
  const [take, setTake] = React.useState<(Recording & { url: string }) | null>(null);
  React.useEffect(
    () => () => {
      if (take) URL.revokeObjectURL(take.url);
    },
    [take],
  );
  const record = async () => {
    const r = await recorder.start();
    if (r) setTake({ ...r, url: URL.createObjectURL(r.wav) });
  };
  return (
    <>
      <div className="flex gap-3">
        {recorder.recording ? (
          <Button variant="default" onClick={recorder.stop}>
            Stop
          </Button>
        ) : (
          <Button variant="default" onClick={() => void record()}>
            {take ? "Record again" : "Record"}
          </Button>
        )}
      </div>
      {recorder.state.phase === "recording" && <InputLevel level={recorder.state.level} seconds={recorder.state.seconds} maxSeconds={maxSeconds} />}
      {recorder.state.phase === "failed" && (
        <Alert tone="danger" title="Nothing was recorded" announce>
          {recorder.state.reason}
        </Alert>
      )}
      {take && !recorder.recording && (
        <>
          <MediaPlayer label="Your take" kind="audio" src={take.url} />
          <TakeLevel peak={take.peak} lead={`Kept ${format.runningTime(take.seconds)}`} />
        </>
      )}
    </>
  );
}

/** Record, Stop, listen back: a tone from the fake microphone at a good level, in real time, up to 20 seconds. */
export const Live: Story = {
  tags: ["no-visual"],
  render: () => (
    <MicrophoneContext.Provider value={fakeMicrophone({ speed: 1 })}>
      <Booth maxSeconds={20} />
    </MicrophoneContext.Provider>
  ),
};

/** A microphone the browser was not allowed to use: the sentence says what to do. */
export const Refused: Story = {
  tags: ["no-visual"],
  render: () => (
    <MicrophoneContext.Provider value={fakeMicrophone({ refuse: "The browser was not allowed to use the microphone. Allow it from the address bar, then try again." })}>
      <Booth maxSeconds={20} />
    </MicrophoneContext.Provider>
  ),
};

/** The browser's own microphone, with its processing off. Needs a secure page and a microphone; Chromium only in CI. */
export const ThisDevice: Story = { tags: ["no-visual"], render: () => <Booth maxSeconds={60} /> };
