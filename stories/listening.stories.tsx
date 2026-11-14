import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Check, X } from "lucide-react";
import { Button, MediaGroup, MediaPlayer, PlayWindowButton, TranscriptView, Waveform, useMediaElement, type MarkKind, type TranscriptGroup, type TranscriptViewProps, type WaveformProps } from "../src";
import { longTalk, talkGroups, talkLength, trackDuration, trackMarks, trackPeaks, trackSpans } from "./fixtures/listening";
import { silentWav } from "./fixtures/media";

// Issues #180 (a window of a file, one player at a time), #185 (Waveform), #186 (TranscriptView) and
// #223 (its doubtful words, a phrase's own mark, correcting text and a hover card):
// listening to and reading timed material. The resting stories are the visual baselines; the ones that
// play are tagged `no-visual`.

const meta = { title: "Actions/Listening", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

// --- Waveform

function Track(props: Partial<WaveformProps> & { start?: number }) {
  const [time, setTime] = React.useState(props.start ?? 30);
  return (
    <div className="max-w-4xl">
      <Waveform label="Waveform of the demo track" duration={trackDuration} peaks={trackPeaks} marks={trackMarks} spans={trackSpans} {...(props as object)} time={time} onSeek={setTime} />
    </div>
  );
}

/** Peaks from the server: beats thin and faint, bars heavier, the first downbeat heaviest, chapters dashed; sung and instrumental stretches shaded and named in the key; the playhead, and what has played in the primary role. */
export const Peaks: Story = { render: () => <Track /> };

/** A chosen range (Shift and drag, or `[` and `]` at the playhead): for a loop or a `MediaPlayer` window. */
export const WithRange: Story = { render: () => <Track range={[20, 36]} /> };

/** Zoomed to part of the file (`+`, `-`, `0`, Ctrl and the wheel): the marks and spans follow, and the beats thin out only if they would crowd. */
export const Zoomed: Story = { render: () => <Track defaultView={[24, 44]} start={34} /> };

const spectrogram = (() => {
  const cells = Array.from({ length: 90 }, (_, x) => Array.from({ length: 24 }, (_, y) => `<rect x="${x * 10}" y="${y * 5}" width="10" height="5" fill="hsl(${240 - y * 6} 40% ${30 + 40 * Math.abs(Math.sin(x / 6 + y / 3)) * (x > 52 ? 1 : 0.5)}%)"/>`).join("")).join("");
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="120" preserveAspectRatio="none">${cells}</svg>`)}`;
})();

/** A spectrogram picture laid under the plot on the same time axis: it is stretched to the file and follows the zoom. */
export const WithSpectrogram: Story = { render: () => <Track underlay={<img alt="" src={spectrogram} />} /> };

/** Phone width. */
export const WaveformPhone: Story = { tags: ["visual-phone"], render: () => <Track defaultView={[20, 60]} /> };

/** Decoded in the browser from a URL (the file is served by the mock): reads with progress and Cancel, then draws. Skipped by the visual suite. */
export const Decoded: Story = {
  tags: ["no-visual"],
  render: () => {
    const [time, setTime] = React.useState(0);
    return (
      <div className="max-w-4xl">
        <Waveform label="Waveform of the three-second tone" source="/api/clips/a.wav" time={time} onSeek={setTime} buckets={300} />
      </div>
    );
  },
};

// --- A window, a group, speech rates

const phrases = [
  { start: 4, end: 7, text: "Welcome, everyone, and thank you for coming" },
  { start: 9, end: 13, text: "Tonight we look at how the kiln is loaded" },
  { start: 15, end: 18, text: "Can I ask about the shelves first" },
  { start: 21, end: 24, text: "Of course, the shelves come first" },
  { start: 27, end: 31, text: "A finger's width is enough for stoneware" },
];

function PhraseList() {
  const src = React.useMemo(() => silentWav(40), []);
  const ref = React.useRef<HTMLAudioElement>(null);
  const media = useMediaElement(ref);
  return (
    <div className="grid max-w-2xl gap-1">
      <audio ref={ref} src={src} />
      <ul className="grid gap-1">
        {phrases.map((p, i) => (
          <li key={i} className="flex items-center gap-3">
            <PlayWindowButton media={media} window={p} label={`Play phrase ${i + 1}`} />
            <span className="type-body">{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Five phrases on one shared element, each with a `PlayWindowButton`: a new one replaces the last, it stops at its own end, and the pressed state says which is playing. */
export const PlayWindowList: Story = { render: () => <PhraseList /> };

/** One window of a file as a player: the bar and time are the window; `showFull` shows the whole file with the window marked. */
export const WindowedPlayer: Story = {
  render: () => {
    const src = React.useMemo(() => silentWav(60), []);
    return (
      <div className="grid max-w-2xl gap-6">
        <MediaPlayer label="Phrase 3" src={src} window={{ start: 12, end: 15 }} controls="strata" />
        <MediaPlayer label="Phrase 3 in the whole file" src={src} window={{ start: 12, end: 15 }} showFull controls="strata" />
      </div>
    );
  },
};

/** Two players in a `MediaGroup`: starting one pauses the other. Skipped by the visual suite. */
export const OneAtATime: Story = {
  tags: ["no-visual"],
  render: () => {
    const a = React.useMemo(() => silentWav(30), []);
    const b = React.useMemo(() => silentWav(45), []);
    return (
      <MediaGroup>
        <div className="grid max-w-2xl gap-6">
          <MediaPlayer label="Reading A" src={a} controls="strata" shortcuts={false} />
          <MediaPlayer label="Reading B" src={b} controls="strata" shortcuts={false} />
        </div>
      </MediaGroup>
    );
  },
};

// --- Transcript

function Talk(props: Partial<TranscriptViewProps>) {
  return (
    <div className="max-w-2xl">
      <TranscriptView label="Transcript of the evening" groups={talkGroups} time={5.6} onSeek={() => {}} modeLabels={{ french: "Français" }} {...props} />
    </div>
  );
}

/** Phrases by clip with who spoke, the word being heard underlined and its phrase barred and `aria-current`; any word plays from there. */
export const Transcript: Story = { render: () => <Talk /> };

/** The French alternate: no word times, so each phrase is one button to play from. */
export const TranscriptTranslated: Story = { render: () => <Talk mode="french" /> };

/** One speaker, and the clips with nothing left are gone. */
export const TranscriptOneSpeaker: Story = { render: () => <Talk speaker="Ben" time={10.2} /> };

/** 2000 phrases: only the rows near the view are in the DOM. Follow is off here (the heard phrase is at 50 minutes), so the list stays at the top. */
export const LongTranscript: Story = { render: () => <Talk groups={longTalk} time={3000} follow={false} /> };

function TranscriptWithPlayer() {
  const src = React.useMemo(() => silentWav(Math.ceil(talkLength)), []);
  const ref = React.useRef<HTMLAudioElement>(null);
  const media = useMediaElement(ref);
  return (
    <div className="grid max-w-2xl gap-3">
      <audio ref={ref} src={src} />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={media.toggle}>
          {media.playing ? "Pause" : "Play"}
        </Button>
        <span className="type-body-sm tabular-nums text-muted-foreground">{media.time.toFixed(1)} s</span>
      </div>
      <TranscriptView
        label="Transcript of the evening"
        groups={talkGroups}
        time={media.time}
        onSeek={(t) => {
          media.seek(t);
          void media.play();
        }}
        renderPlay={(p) => <PlayWindowButton media={media} window={{ start: p.start, end: p.end }} label={`Play phrase ${p.id}`} />}
        modeLabels={{ french: "Français" }}
      />
    </div>
  );
}

/** With a player: the heard word moves as it plays, a word plays from there, each phrase has its own play button, and scrolling away shows Jump to now. Skipped by the visual suite. */
export const TranscriptWithPlayer_: Story = { name: "Transcript with a player", tags: ["no-visual"], render: () => <TranscriptWithPlayer /> };


// --- Transcript: doubt, marks, correction, card (issue #223)

const notSung = { id: "not-sung", label: "Not sung", tone: "neutral" } as const;
const notLyric = { id: "not-lyric", label: "Not a lyric", tone: "warning" } as const;

/** The recogniser's low-confidence words, as it gives them: a confidence per word, under 0.6 doubtful. */
const doubtfulTalk: TranscriptGroup[] = talkGroups.map((g, gi) => ({
  ...g,
  phrases: g.phrases.map((p, pi) => ({
    ...p,
    words: p.words.map((w, wi) => ((gi + pi) % 2 === 0 && wi === 2 ? { ...w, confidence: 0.32 } : gi === 1 && pi === 1 && wi === 4 ? { ...w, doubtful: true } : w)),
    state: gi === 1 && pi === 2 ? notSung : undefined,
  })),
}));

/** Doubtful words are dotted-underlined and named for a screen reader, their phrase says "Doubtful", a phrase can carry its own mark ("Not sung"), and the controls count both. */
export const TranscriptDoubtAndMarks: Story = { render: () => <Talk groups={doubtfulTalk} states={[notSung, notLyric]} onPhraseState={() => {}} time={0} follow={false} /> };

/** "Only doubtful" leaves the phrases that need a look, with their clip headings. */
export const TranscriptOnlyDoubtful: Story = {
  render: () => {
    const [only, setOnly] = React.useState(true);
    return (
      <div className="grid max-w-2xl gap-3">
        <Button size="sm" className="justify-self-start" onClick={() => setOnly((o) => !o)}>
          {only ? "Show the whole transcript" : "Show only doubtful"}
        </Button>
        <Talk groups={only ? doubtfulTalk.map((g) => ({ ...g, phrases: g.phrases.filter((p) => p.words.some((w) => w.doubtful || (w.confidence ?? 1) < 0.6)) })).filter((g) => g.phrases.length) : doubtfulTalk} time={0} follow={false} />
      </div>
    );
  },
};

function CorrectingTalk() {
  const [groups, setGroups] = React.useState(doubtfulTalk);
  const change = (id: string, f: (p: TranscriptGroup["phrases"][number]) => TranscriptGroup["phrases"][number]) => setGroups((gs) => gs.map((g) => ({ ...g, phrases: g.phrases.map((p) => (p.id === id ? f(p) : p)) })));
  return (
    <Talk
      groups={groups}
      states={[notSung, notLyric]}
      time={0}
      follow={false}
      onPhraseState={(id, state) => change(id, (p) => ({ ...p, state: [notSung, notLyric].find((s) => s.id === state) }))}
      onEdit={(id, text) =>
        change(id, (p) => {
          const parts = text.split(/\s+/);
          // The app keeps the timings: spread the words over the phrase, and the doubt is settled by a person.
          const step = (p.end - p.start) / parts.length;
          return { ...p, words: parts.map((t, i) => ({ text: t, start: p.start + i * step, end: p.start + (i + 1) * step })) };
        })
      }
      renderCard={(p) => (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-body-sm">
          <dt className="text-muted-foreground">Clip</dt>
          <dd>{groups.find((g) => g.phrases.some((x) => x.id === p.id))?.title}</dd>
          <dt className="text-muted-foreground">Spoken by</dt>
          <dd>{p.speaker}</dd>
          <dt className="text-muted-foreground">Real time</dt>
          <dd className="tabular-nums">19:{String(40 + Math.floor(p.start)).padStart(2, "0")}</dd>
        </dl>
      )}
    />
  );
}

/** Correcting by hand: focus a row and press Enter or F2 for its text, Ctrl+Enter saves, Escape cancels; the menu at the end of a row marks it; hover or focus a phrase for its card. Skipped by the visual suite. */
export const TranscriptCorrecting: Story = { name: "Transcript, correcting", tags: ["no-visual"], render: () => <CorrectingTalk /> };

// A review transcript with no player (issue #260): no time and no seek, words selected and marked
// "must use" or "never use", and a dotted underline where a person corrected a word.
const reviewKinds: MarkKind[] = [
  { key: "use", label: "Must use", tone: "success", pattern: "solid", icon: Check, keys: ["g"] },
  { key: "never", label: "Never use", tone: "danger", pattern: "dashed", icon: X, keys: ["r"] },
];
const reviewGroups: TranscriptGroup[] = talkGroups.map((g, gi) => ({
  ...g,
  phrases: g.phrases.map((p, pi) => ({
    ...p,
    words: p.words.map((w, wi) => (gi === 0 && pi === 1 && wi === 1 ? { ...w, correction: { original: "mourning", by: "Ada" } } : w)),
  })),
}));
function ReviewTranscript() {
  const [marks, setMarks] = React.useState<Record<string, string | undefined>>({ "t0:0": "use", "t0:1": "use", "t2:2": "never" });
  return (
    <TranscriptView
      label="Whole-race transcript"
      groups={reviewGroups}
      marking={{ kinds: reviewKinds, marks, clearKeys: ["w"], onMark: (ids, kind) => setMarks((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, kind ?? undefined])) })) }}
      onCorrectionPress={() => {}}
    />
  );
}
export const TranscriptReviewMarking: Story = { name: "Transcript, review with marking", render: () => <ReviewTranscript /> };
