import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertDialog, Button, Tree, useChoices, useExpanded, type Load } from "../src";

// Choosing several in a tree, with what depends on a choice ticked for you (issue #222), shown as
// strata-360's "redo" dialog: clips by stage, where choosing a stage chooses the stages after it.
// The summary line is the confirm's own count.

const meta = { title: "Data/Tree choices", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

type Item = { id: string; name: string; branch: boolean };
const clips = ["Start line", "Hill climb", "Summit", "Descent"].map((name, i): Item => ({ id: `c${i + 1}`, name, branch: true }));
const stages = ["Detect faces", "Track people", "Match to runners", "Render highlights"];
const stagesOf = (clip: string): Item[] => stages.map((name, i) => ({ id: `${clip}/${i}`, name, branch: false }));
// A stage implies the stages after it in the same clip: they were made from its result.
const implies = (key: string): string[] => {
  const [clip, stage] = key.split("/");
  return stage === undefined ? [] : stages.map((_, i) => i).filter((i) => i > Number(stage)).map((i) => `${clip}/${i}`);
};
const roots: Load<readonly Item[]> = { status: "ready", data: clips, refreshing: false } as never;
const childrenOf = (n: Item): Load<readonly Item[]> => ({ status: "ready", data: stagesOf(n.id), refreshing: false }) as never;

function Redo({ initial = [] as string[], open = ["c1", "c2"] }: { initial?: string[]; open?: string[] }) {
  const choices = useChoices({ initial, implies });
  const expanded = useExpanded({ initial: open });
  const [confirming, setConfirming] = React.useState(false);
  const total = choices.counts.total;
  return (
    <div className="grid max-w-xl gap-3">
      <Tree label="Results to process again" roots={roots} useChildren={childrenOf} nodeKey={(n) => n.id} nodeLabel={(n) => n.name} isBranch={(n) => n.branch} expanded={expanded} emptyRow="No results" choices={choices} height="18rem" />
      <p className="type-body-sm tabular-nums text-muted-foreground">{choices.summary(["result", "results"], "will be forgotten")}</p>
      <div>
        <Button variant="destructive" disabled={total === 0} onPress={() => setConfirming(true)}>
          {`Forget ${total} ${total === 1 ? "result" : "results"}`}
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming} title={`Forget ${total} ${total === 1 ? "result" : "results"}?`} description={choices.summary(["result", "results"], "will be forgotten")} confirm={`Forget ${total} ${total === 1 ? "result" : "results"}`} onConfirm={() => choices.clear()} />
    </div>
  );
}

/** Clips by stage, two open. Nothing is chosen: every box is empty, and the line under says so. */
export const Nothing: Story = { render: () => <Redo /> };

/** Opened for a stage, as the dialog is: "Track people" is chosen for the person in two clips, and the stages that depend on it are ticked and say, in words, which row they are included because of. A parent with only some of its rows chosen is mixed. */
export const FromAStage: Story = { render: () => <Redo initial={["c1/1", "c2/1"]} /> };

/** All four clips for one stage, as the app pre-chooses them; the summary names what was chosen and what came with it. */
export const EveryClip: Story = { render: () => <Redo open={["c1", "c2", "c3", "c4"]} initial={clips.map((c) => `${c.id}/2`)} /> };

/** Skipped by the visual suite: tick a stage and watch what it brings; try to clear one of those; open the confirm. */
export const Interactive: Story = { tags: ["no-visual"], render: () => <Redo /> };
