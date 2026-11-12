import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Check, Flag, X } from "lucide-react";
import { Mark, MarkableText, VirtualList, type MarkKind } from "../src";

// Issue #187: select words and mark them. The resting story has three kinds of mark on a short
// paragraph; the long one is a virtualised list of 300 lines, where a selection crosses rows that
// are not mounted.

const kinds: MarkKind[] = [
  { key: "use", label: "Must use", tone: "success", pattern: "solid", icon: Check, keys: ["g"] },
  { key: "never", label: "Never use", tone: "danger", pattern: "dashed", icon: X, keys: ["r"] },
  { key: "check", label: "Check later", tone: "warning", pattern: "dotted", icon: Flag, keys: ["c"] },
];

const paragraph = "Kiln two ran hot all night and the bottom shelf came out thin, so Priya wants the cobalt bowls fired again before the open day.".split(" ");
const lines = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}: the firing held at peak for forty minutes before it cooled`.split(" "));

type Kinds = Record<string, string | undefined>;

function Short({ initial }: { initial: Kinds }) {
  const [marks, setMarks] = React.useState<Kinds>(initial);
  const ids = paragraph.map((_, i) => `w${i}`);
  return (
    <div className="max-w-xl">
      <MarkableText label="Firing notes, for marking" ids={ids} marks={marks} kinds={kinds} clearKeys={["w"]} onMark={(sel, k) => setMarks((m) => ({ ...m, ...Object.fromEntries(sel.map((id) => [id, k ?? undefined])) }))}>
        <p className="type-body leading-8">{paragraph.map((w, i) => <React.Fragment key={i}><Mark id={ids[i]!}>{w}</Mark>{" "}</React.Fragment>)}</p>
      </MarkableText>
    </div>
  );
}

function Long() {
  const [marks, setMarks] = React.useState<Kinds>({});
  const rows = lines.map((words, row) => ({ row, ids: words.map((_, i) => `r${row}w${i}`), words }));
  const ids = rows.flatMap((r) => r.ids);
  return (
    <div className="max-w-xl">
      <MarkableText label="Log, for marking" ids={ids} marks={marks} kinds={kinds} onMark={(sel, k) => setMarks((m) => ({ ...m, ...Object.fromEntries(sel.map((id) => [id, k ?? undefined])) }))}>
        <VirtualList label="Log lines" items={rows} itemKey={(r) => String(r.row)} height={240}>
          {(r) => <p className="py-1">{r.words.map((w, i) => <React.Fragment key={i}><Mark id={r.ids[i]!}>{w}</Mark>{" "}</React.Fragment>)}</p>}
        </VirtualList>
      </MarkableText>
    </div>
  );
}

const meta = { title: "Actions/MarkableText", component: Short, parameters: { layout: "padded" } } satisfies Meta<typeof Short>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Three kinds of mark, each with a colour role, an underline pattern and an icon; none is told apart by colour alone. */
export const ThreeKinds: Story = { args: { initial: { w0: "check", w1: "check", w2: "never", w3: "never", w9: "use", w10: "use", w11: "use", w13: "use", w14: "use" } } };

/** A virtualised log: drag or Shift+click across rows that are not all mounted. */
export const Virtualised: Story = { args: { initial: {} }, tags: ["no-visual"], render: () => <Long /> };
