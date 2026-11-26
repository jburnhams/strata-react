import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  Alert,
  Button,
  InputLevel,
  ListeningLevel,
  MediaPlayer,
  MicrophoneContext,
  TakeLevel,
  format,
  useAutoRecorder,
  useRecorder,
  type AutoTake,
  type Recording,
} from "../src";
import { fakeMicrophone, speechScript } from "../src/testing/microphone";

// Recording speech (from strata-voice's studio): the live level while a take runs, the verdict on a
// take once it ends, and a whole booth on the fake microphone (`strata-react/testing`), since
// Storybook and the visual suite have no hardware. The resting states are the baselines; the booth
// records, so it is tagged `no-visual`. The hands-free booth (`useAutoRecorder`) is the same: its level's three
// resting states are baselines, and the booth itself listens to a fake speaker reading with gaps.

const meta = {
  title: "Actions/Recording",
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="grid max-w-xl gap-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;
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
      {recorder.state.phase === "recording" && (
        <InputLevel level={recorder.state.level} seconds={recorder.state.seconds} maxSeconds={maxSeconds} />
      )}
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
    <MicrophoneContext.Provider
      value={fakeMicrophone({
        refuse: "The browser was not allowed to use the microphone. Allow it from the address bar, then try again.",
      })}
    >
      <Booth maxSeconds={20} />
    </MicrophoneContext.Provider>
  ),
};

/** The browser's own microphone, with its processing off. Needs a secure page and a microphone; Chromium only in CI. */
export const ThisDevice: Story = { tags: ["no-visual"], render: () => <Booth maxSeconds={60} /> };

/** Hands-free, between takes: the level, and the room's quiet the next take must rise above. */
export const ListeningForSpeech: Story = {
  render: () => (
    <ListeningLevel
      state={{ phase: "listening", level: -52, noise: -63, speaking: false, seconds: 0, paused: false }}
      maxSeconds={60}
    />
  ),
};

/** Hands-free, hearing a take: how long it has run against the longest take. */
export const ListeningHearingYou: Story = {
  render: () => (
    <ListeningLevel
      state={{ phase: "listening", level: -11, noise: -63, speaking: true, seconds: 2.4, paused: false }}
      maxSeconds={60}
    />
  ),
};

/** Hands-free and paused: the microphone is open, so the level still moves, but nothing is kept. */
export const ListeningPaused: Story = {
  render: () => (
    <ListeningLevel
      state={{ phase: "listening", level: -40, noise: -63, speaking: false, seconds: 0, paused: true }}
      maxSeconds={60}
    />
  ),
};

function HandsFreeBooth({ maxSeconds }: { maxSeconds: number }) {
  const [paused, setPaused] = React.useState(false);
  const [takes, setTakes] = React.useState<{ n: number; take: AutoTake }[]>([]);
  // The newest five, each numbered from the first.
  const recorder = useAutoRecorder({
    maxSeconds,
    paused,
    onTake: (take) => setTakes((all) => [{ n: (all[0]?.n ?? 0) + 1, take }, ...all].slice(0, 5)),
  });
  return (
    <>
      <div className="flex gap-3">
        {recorder.listening ? (
          <>
            <Button variant="default" onClick={() => setPaused((p) => !p)}>
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button onClick={recorder.stop}>Stop listening</Button>
          </>
        ) : (
          <Button variant="default" onClick={() => void recorder.start()}>
            Start listening
          </Button>
        )}
      </div>
      {recorder.state.phase === "listening" && <ListeningLevel state={recorder.state} maxSeconds={maxSeconds} />}
      {recorder.state.phase === "failed" && (
        <Alert tone="danger" title="Not listening" announce>
          {recorder.state.reason}
        </Alert>
      )}
      {takes.map(({ n, take }) => (
        <TakeLevel
          key={n}
          peak={take.peak}
          lead={`Take ${n}: ${format.runningTime(take.seconds)}${take.cut ? ", cut at the longest" : ""}`}
        />
      ))}
    </>
  );
}

/** Start listening once, then each stretch of speech becomes its own take: a fake speaker reading for 2 s with 2 s gaps, in real time. */
export const HandsFree: Story = {
  tags: ["no-visual"],
  render: () => (
    <MicrophoneContext.Provider
      value={fakeMicrophone({ speed: 1, loop: true, script: speechScript(1, { speak: 2, gap: 2 }) })}
    >
      <HandsFreeBooth maxSeconds={20} />
    </MicrophoneContext.Provider>
  ),
};

/** Hands-free on the browser's own microphone. Needs a secure page and a microphone; Chromium only in CI. */
export const HandsFreeThisDevice: Story = { tags: ["no-visual"], render: () => <HandsFreeBooth maxSeconds={60} /> };
