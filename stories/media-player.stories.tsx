import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button, MediaPlayer, SPEECH_RATES, useMediaElement, SeekBar, TimeReadout, type MediaElementState, type MediaSource, type MediaSpanData, type SpanKind } from "../src";
import { silentWav } from "./fixtures/media";
import clipSrc from "./fixtures/video/a.webm?url";

// Issue #134: playing a file without the glue. `MediaPlayer` is the element, its state
// (`useMediaElement`) and the parts of #78; the stories are the cases strata-listory had: one file,
// a book in chapters, and a file that will not load. Files are generated silent WAVs, so the
// duration is real and nothing is fetched.

const useWav = (seconds: number) => React.useMemo(() => silentWav(seconds), [seconds]);

const meta = { title: "Actions/Media player", component: MediaPlayer, parameters: { layout: "padded" } } satisfies Meta<typeof MediaPlayer>;
export default meta;
type Story = StoryObj<typeof meta>;

function One(props: Partial<React.ComponentProps<typeof MediaPlayer>>) {
  const src = useWav(245);
  return <div className="max-w-3xl"><MediaPlayer label="Kiln walk-through recording" src={src} controls="strata" {...props} /></div>;
}

/** One file with Strata's controls: seek bar and time, play, speed, volume. The element is hidden; the browser's own bar is `controls="native"`. */
export const OneFile: Story = { args: { label: "x" }, render: () => <One /> };

/** Spoken-word speeds (0.75 to 3), for an audiobook or a lecture. `rates` is a prop; `SPEECH_RATES` is the usual set. */
export const SpeechSpeeds: Story = { args: { label: "x" }, render: () => <One rates={SPEECH_RATES} /> };

const chapterLengths = [90, 60, 120];
const titles = ["Loading the kiln", "Reading the cones", "Cooling down"];

function Book({ index }: { index?: number }) {
  const urls = [useWav(chapterLengths[0]), useWav(chapterLengths[1]), useWav(chapterLengths[2])];
  const sources: MediaSource[] = urls.map((src, i) => ({ src, title: titles[i], duration: chapterLengths[i] }));
  return <div className="max-w-3xl"><MediaPlayer label="A potter's year" sources={sources} index={index} controls="strata" /></div>;
}

/** Chapters: the seek bar spans the whole book with a mark at each chapter; ending moves to the next and keeps playing on the same element. */
export const Chapters: Story = { args: { label: "x" }, render: () => <Book /> };

/** The app holds the chapter (a list beside the player) with `index` and `onIndexChange`. */
export const ThirdChapter: Story = { args: { label: "x" }, render: () => <Book index={2} /> };

/** The browser's own controls: lock screen and headset, AirPlay and Cast, picture in picture. The hook still reads the element. Skipped by the visual suite: the bar is the browser's own and draws differently in each. */
export const NativeControls: Story = { tags: ["no-visual"], args: { label: "x" }, render: () => <One controls="native" /> };

/** A file that will not load says so in words, with Try again. */
export const CouldNotLoad: Story = { args: { label: "x" }, render: () => <div className="max-w-3xl"><MediaPlayer label="Firing log, 4 November" src="media/does-not-exist.mp3" controls="strata" /></div> };

/** Phone width: the controls wrap, and `controls="auto"` would hand a touch device the browser's bar. */
export const Phone: Story = { ...OneFile, tags: ["visual-phone"] };

function Reader() {
  const ref = React.useRef<HTMLAudioElement>(null);
  const src = useWav(120);
  const media = useMediaElement(ref);
  return (
    <div className="grid max-w-3xl gap-2">
      <audio ref={ref} src={src} controls aria-label="Kiln recording" className="w-full" />
      <div className="flex items-center gap-3">
        <SeekBar time={media.time} duration={media.duration} onSeek={media.seek} label="Our own seek bar" />
        <TimeReadout time={media.time} duration={media.duration} />
      </div>
      <p className="type-body-sm text-muted-foreground">{media.playing ? "Playing" : "Not playing"}: the browser draws its bar, the app reads the same element.</p>
    </div>
  );
}

/** Live: use the hook alone with the browser's controls and read the time for something else (a chapter list). Skipped by the visual suite. */
export const HookWithNativeControls: Story = { tags: ["no-visual"], args: { label: "x" }, render: () => <Reader /> };

// Marked stretches (issue #207): an intro skipped as it starts, a recap offered as a button, a sponsor read
// muted, credits only drawn. The kind's tone is a status role the product sets.
const spanKinds: Record<string, SpanKind> = {
  intro: { label: "Intro", behaviour: "auto", tone: "info" },
  recap: { label: "Recap", behaviour: "ask", tone: "warning" },
  sponsor: { label: "Sponsor", behaviour: "auto", tone: "danger" },
  credits: { label: "Credits", behaviour: "off", tone: "neutral" },
};
const spans: MediaSpanData[] = [
  { start: 0, end: 12, kind: "intro" },
  { start: 40, end: 70, kind: "recap" },
  { start: 120, end: 150, kind: "sponsor", action: "mute" },
  { start: 225, end: 245, kind: "credits" },
];

/** Stretches on the seek bar, each a named range in its kind's tone (the title and the screen reader say "Recap, 0:40 to 1:10"); a one-second span keeps a visible width. */
export const Spans: Story = { args: { label: "x" }, render: () => <One spans={spans} spanKinds={spanKinds} /> };

/** What each kind does on reaching a stretch: `auto` skips (or mutes) it with "Skipped intro" and Undo, `ask` offers "Skip recap ›" over the picture and on the S key, `off` only draws it. Play it to see. */
export const SpanBehaviours: Story = {
  tags: ["no-visual"],
  args: { label: "x" },
  render: () => (
    <div className="max-w-3xl">
      <MediaPlayer label="Episode 4" kind="video" src={clipSrc} controls="strata" spans={[{ start: 0, end: 1, kind: "intro" }, { start: 1.2, end: 1.8, kind: "recap" }]} spanKinds={spanKinds} />
    </div>
  ),
};

/** The app's own thing over the picture (a comment pinned to a time, in the corner its classes choose), and the player's state through `mediaRef`, so a list beside the player can seek. */
export const OverlayAndState: Story = {
  tags: ["no-visual"],
  args: { label: "x" },
  render: () => {
    const state = React.useRef<MediaElementState | null>(null);
    return (
      <div className="grid max-w-3xl gap-2">
        <MediaPlayer
          label="Kiln cam" kind="video" src={clipSrc} controls="strata" mediaRef={state}
          overlay={(m) => <p className="absolute top-3 left-3 rounded-control bg-background px-2 py-1 type-caption tabular-nums">{m.time.toFixed(1)} s</p>}
        />
        <Button onClick={() => state.current?.seek(1)}>Jump to 1 s</Button>
      </div>
    );
  },
};

/** A video player a phone wide, with a side rail's width taken off (issue #213): the speed and volume row wraps, the volume track gives way, and "100%" stays inside the player. */
export const VideoPhone: Story = {
  tags: ["visual-phone"],
  args: { label: "x" },
  render: () => <div className="w-80"><MediaPlayer label="Kiln cam" kind="video" src={clipSrc} controls="strata" /></div>,
};
