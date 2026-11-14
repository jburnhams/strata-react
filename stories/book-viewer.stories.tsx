import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { BookViewer, BoxOverlay, Status, pageName, useBoxes, type BookPage } from "../src";
import { bookPages, needsLook, pageLines, PAGE_SIZE } from "./fixtures/book";

// Issue #238: a scanned book read as a book. Facing pages with the first alone on the right, two
// names per page, go-to that takes "iv" or "6", a strip with a badge on the pages that need a look,
// and the transcript beside the pages. The overlay draws the reader's lines on each page.

function Book({ start = 0, layout }: { start?: number; layout?: "spread" | "single" }) {
  const [index, setIndex] = React.useState(start);
  const state = useBoxes();
  return (
    <div className="max-w-5xl">
      <BookViewer
        label="The Play of Punch and Judy"
        pages={bookPages}
        index={index}
        onIndexChange={setIndex}
        missing="This page could not be loaded."
        layout={layout}
        badge={(p) => (needsLook.has(p.id) ? <Status tone="warning">Look</Status> : null)}
        side={(shown: readonly BookPage[]) => (
          <div className="space-y-2 type-body-sm">
            {shown.map((p) => (
              <section key={p.id} aria-label={pageName(p)}>
                <h3 className="type-label">{pageName(p)}</h3>
                <p className="text-muted-foreground">THE PLAY OF PUNCH AND JUDY. Enter Punch with his stick, and a dog. A scene in one act.</p>
              </section>
            ))}
          </div>
        )}
        sideLabel="Transcript"
        overlay={(p) => <BoxOverlay label={`Lines on ${pageName(p)}`} of={{ w: PAGE_SIZE[0], h: PAGE_SIZE[1] }} boxes={pageLines(Number(p.scan))} state={state} />}
      />
    </div>
  );
}

const meta = { title: "Data/BookViewer", component: Book, parameters: { layout: "padded" }, tags: ["visual-wide"] } satisfies Meta<typeof Book>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Opens on the first page, alone on the right, as a printed book does. */
export const Cover: Story = {};

/** Pages 6 (iv) and 7 (1): the printed label and the scan position both shown. */
export const Spread: Story = { args: { start: 5 } };

/** One page at a time, for a narrow screen or a reader who wants it. */
export const SinglePage: Story = { args: { start: 8, layout: "single" } };
