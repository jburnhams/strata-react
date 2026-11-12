import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { FileButton, FileDropZone, FileOutcomes, MissingFile, useFileIntake, type FileIntake, type FileOutcome } from "../src";

// Bringing files into the kiln room's photo library (issue #75): pick or drop, then one outcome per
// file, inline. The stories with outcomes build the intake state by hand so each state is
// drawn the same way every time; the live one runs `useFileIntake` for real.

const accept = ["image/*", ".csv"];
const acceptLabel = "a photo or a firing log (CSV)";

function fixed(outcomes: FileOutcome[]): FileIntake {
  return { outcomes, add: () => {}, retry: () => {}, dismiss: () => {}, clear: () => {}, pending: outcomes.filter((o) => o.status === "processing").length };
}

function Zone({ dragOver, children }: { dragOver?: boolean; children?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!dragOver) return;
    // Put React Aria's own drag-over state on the zone, as a real drag would.
    const zone = ref.current?.querySelector("[data-rac]");
    const dataTransfer = { types: ["Files"], items: [], dropEffect: "copy", effectAllowed: "all" };
    for (const type of ["dragenter", "dragover"]) {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 8, clientY: 8 });
      Object.defineProperty(e, "dataTransfer", { value: dataTransfer });
      zone?.dispatchEvent(e);
    }
  }, [dragOver]);
  return (
    <div ref={ref} className="grid w-96 gap-4">
      <FileDropZone title="Drag photos or a firing log here" acceptLabel={acceptLabel} onFiles={() => {}}>
        <FileButton accept={accept} multiple onFiles={() => {}}>
          Add files
        </FileButton>
      </FileDropZone>
      {children}
    </div>
  );
}

const meta = { title: "Actions/File intake", component: Zone } satisfies Meta<typeof Zone>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Resting: what to do, and the button that does it for a keyboard or a phone. */
export const Empty: Story = {};

/** A file is being dragged over: the words change to what it takes, as well as the border. */
export const DragOver: Story = { args: { dragOver: true } };

/** A mixed drop: each file has its own word, and a rejected or failed one says why in the product's words. */
export const MixedOutcomes: Story = {
  render: () => (
    <Zone>
      <FileOutcomes
        intake={fixed([
          { id: "1", name: "moonbeam-front.jpg", size: 1, status: "added" },
          { id: "2", name: "tea-jar.jpg", size: 1, status: "processing" },
          { id: "3", name: "notes.txt", size: 1, status: "rejected", reason: `notes.txt is not a type this accepts. Add ${acceptLabel}.` },
          { id: "4", name: "firing-0411.csv", size: 1, status: "failed", reason: "firing-0411.csv has no temperature column. Export it again with temperatures." },
        ])}
      />
    </Zone>
  ),
};

/** A saved item whose file is gone: a word and an icon, and a relink that opens the picker for it. */
export const MissingWithRelink: Story = {
  render: () => (
    <div className="grid w-96 gap-2">
      <MissingFile name="moonbeam-front.jpg" accept={accept} onRelink={() => {}} />
      <MissingFile name="firing-log-with-a-very-long-name-from-the-autumn-glaze-run.csv" accept={accept} onRelink={() => {}} />
    </div>
  ),
};

/** A 280px library column: the name keeps its own line in full, the status and Relink wrap under it, and a thumbnail sits beside all three. */
export const MissingInNarrowColumn: Story = {
  render: () => (
    <div className="grid w-70 gap-3">
      <MissingFile name="parkrun-saturday-morning.gpx" accept={accept} onRelink={() => {}} />
      <MissingFile
        name="moonbeam-front-with-the-glaze-test-tile.jpg"
        accept={accept}
        onRelink={() => {}}
        thumbnail={<div role="img" aria-label="Last seen picture" className="size-12 rounded-control bg-muted" />}
      />
    </div>
  ),
};

/** Phone width: the zone's prompt and the picker; there is nothing to drag from on a phone, so the button is the way in. */
export const Phone: Story = { tags: ["visual-phone"], render: () => <Zone /> };

function LiveLibrary() {
  const intake = useFileIntake({
    accept,
    acceptLabel,
    process: (file) => new Promise<void>((resolve) => setTimeout(resolve, 600 + file.size % 400)),
  });
  return (
    <div className="grid w-96 gap-4">
      <FileDropZone title="Drag photos or a firing log here" acceptLabel={acceptLabel} onFiles={intake.add}>
        <FileButton accept={accept} multiple onFiles={intake.add}>
          Add files
        </FileButton>
      </FileDropZone>
      <FileOutcomes intake={intake} />
    </div>
  );
}

/** Live: drop or pick real files. Skipped by the visual suite. */
export const Live: Story = { tags: ["no-visual"], render: () => <LiveLibrary /> };
