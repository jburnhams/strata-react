import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkflowSummary, type WorkflowSummaryProps } from "../src";
import { firingRuns } from "./fixtures/workflow";

// Each firing's run in a few words, as a list of firings shows them (issue #373): the word, then the
// one stage it is about. The same runs as WorkflowSteps' stories, so the two can be read side by side.

function Firings(props: Pick<WorkflowSummaryProps, "words">) {
  const rows: [string, WorkflowSummaryProps][] = [
    ["f-0409", { stages: firingRuns.notStarted.stages }],
    ["f-0410", { stages: firingRuns.running.stages, running: true }],
    ["f-0411", { stages: firingRuns.failed.stages }],
    ["f-0412", { stages: firingRuns.waiting.stages }],
    ["f-0413", { stages: firingRuns.done.stages }],
  ];
  return (
    <ul aria-label="Firings" className="grid max-w-xl divide-y divide-border">
      {rows.map(([name, run]) => (
        <li key={name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
          <span className="type-label font-mono">{name}</span>
          <WorkflowSummary {...run} {...props} />
        </li>
      ))}
    </ul>
  );
}

const meta = {
  title: "Status and figures/WorkflowSummary",
  component: Firings,
} satisfies Meta<typeof Firings>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Not started, running on a step, failed at a step, waiting for review at a gate, and done. */
export const States: Story = {};
/** The studio's own words. */
export const OwnWords: Story = { args: { words: { running: "Firing", waiting: "To inspect", done: "Finished" } } };
/** On a phone: the stage wraps under the word. */
export const Phone: Story = { tags: ["visual-phone"] };
