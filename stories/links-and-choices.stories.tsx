import type { Meta, StoryObj } from "@storybook/react-vite";
import { Download, FileText } from "lucide-react";
import { ButtonLink, ChoiceGroup, NativeSelect, SayAgain, TextLink, ToggleGroup } from "../src";

const meta = { title: "Navigation/Links and URL choices" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** `ButtonLink` is a link drawn as a `Button`: the filled one is the view's one primary action. */
export const ButtonLinks: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <ButtonLink to="/learners/7" variant="default">Play as Fox</ButtonLink>
      <ButtonLink href="/export.csv" download icon={Download}>Export</ButtonLink>
      <ButtonLink to="/report" variant="ghost" icon={FileText} size="sm">Open the report</ButtonLink>
    </div>
  ),
};

/** `TextLink` is the in-app link inside a sentence or a table cell. */
export const TextLinks: Story = {
  render: () => (
    <p className="type-body">
      Nobody has played yet. <TextLink to="/learners">Add a learner</TextLink> or <TextLink href="https://example.test/guide" newTab>read the guide</TextLink>.
    </p>
  ),
};

/** The chosen option is held in the URL (`?round=due`) and the default is left out of it; try the controls and watch the address. */
export const InTheUrl: Story = {
  render: () => (
    <div className="grid max-w-xs gap-4">
      <NativeSelect aria-label="Round" param="round" paramDefault="all">
        <option value="all">All cards</option>
        <option value="due">Due today</option>
      </NativeSelect>
      <ChoiceGroup legend="Who is playing" name="who" param="who" choices={[{ value: "fox", label: "Fox" }, { value: "owl", label: "Owl" }]} />
      <ToggleGroup label="Size" param="size" options={[{ value: "s", label: "Small" }, { value: "l", label: "Large" }]} />
    </div>
  ),
};

/** Its name is the sentence it says; where the browser has no speech, or it is muted, nothing is drawn. */
export const SayIt: Story = {
  render: () => <SayAgain text="Which one is the cat?" lang="en-GB" />,
};

/** Recorded parts (a speech model's clips, or a person's recording of the sound /ʃ/): drawn wherever audio plays, even with no browser voice; the browser says `text` if a clip fails. */
export const SayItRecorded: Story = {
  render: () => (
    <SayAgain
      text="Listen. sh, as in ship."
      parts={[
        { text: "Listen.", clip: "voice/listen.wav" },
        { text: "sh, as in ship.", clip: "voice/sh.wav" },
      ]}
      verb="Hear"
      lang="en-GB"
    />
  ),
};
