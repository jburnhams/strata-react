import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompareAudio, CompareText, EmptyState, PairJudge, Skeleton, type AudioMedia, type Candidate, type TextMedia } from "../src";

// Two readings of one phrase (the MSW handler `/api/clips/:variant` serves real WAVs, so the browser
// decodes them and the loudness measure runs) and two transcripts of one recording.

const a: Candidate<AudioMedia> = { id: "model-x", label: "A", note: "Voice X, 3.1 s", media: { kind: "audio", src: "/api/clips/a.wav" } };
const b: Candidate<AudioMedia> = { id: "model-y", label: "B", note: "Voice Y, 3.0 s", media: { kind: "audio", src: "/api/clips/b.wav" } };

const meta = {
  title: "Data/CompareAudio",
  component: CompareAudio,
  args: { label: "Pair 3 of 12, two readings of one sentence", a, b, blind: true, missing: "Clip not found" },
  render: (args) => (
    <div className="max-w-3xl">
      <CompareAudio {...args} />
    </div>
  ),
} satisfies Meta<typeof CompareAudio>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One transport and a switch that keeps the playhead; the louder clip is turned down to the quieter, and the line says by how much. */
export const Blind: Story = {};

/** Not blind: the notes show under the switch. */
export const Named: Story = { args: { blind: false } };

/** Matching off: both clips play as recorded. */
export const NotMatched: Story = { args: { levelMatch: false } };

/** As the answering half of a blind pairwise judgment: the same keys and bar as pictures. */
export const Judged: Story = {
  render: (args) => (
    <div className="max-w-3xl">
      <PairJudge
        pair={{ status: "ready", data: { label: args.label, a: args.a, b: args.b } }}
        skeleton={<Skeleton className="h-40 w-full" />}
        empty={<EmptyState title="Nothing left to judge" />}
        onAnswer={() => undefined}
        pending={false}
        progress="12 pairs left"
        view={(slot, pair) => <CompareAudio {...args} {...pair} {...slot} />}
      />
    </div>
  ),
};

const ta: Candidate<TextMedia> = { id: "model-x", label: "A", note: "Model X", media: { kind: "text", text: "Pass me the blue glaze, it's on the second shelf, next to the celadon bowl that we fired on Tuesday." } };
const tb: Candidate<TextMedia> = { id: "model-y", label: "B", note: "Model Y", media: { kind: "text", text: "Pass me the blue glaze it's on the second shelf next to the celadon bowls that we fired on Tuesday morning." } };

/** Two transcripts, scrolled together. */
export const Text: StoryObj<typeof CompareText> = {
  render: () => (
    <div className="max-w-3xl">
      <CompareText label="Pair 3 of 12, two transcripts" a={ta} b={tb} blind />
    </div>
  ),
};

/** The words that differ marked (a background and an underline, so not by colour alone), with a count. */
export const TextDiff: StoryObj<typeof CompareText> = {
  render: () => (
    <div className="max-w-3xl">
      <CompareText label="Pair 3 of 12, two transcripts" a={ta} b={tb} blind defaultDiff />
    </div>
  ),
};

/** A ground truth above both, and the difference taken against it. */
export const TextWithReference: StoryObj<typeof CompareText> = {
  render: () => (
    <div className="max-w-3xl">
      <CompareText label="Pair 3 of 12, two transcripts" a={ta} b={tb} blind defaultDiff reference={{ label: "What was said", text: "Pass me the blue glaze, it's on the second shelf, next to the celadon bowl that we fired on Tuesday." }} />
    </div>
  ),
};
