import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { BoxList, BoxOverlay, ViewportFrame, useBoxes, useViewport, zoomToBox } from "../src";
import { bookPages, pageLines, PAGE_SIZE } from "./fixtures/book";

// Issue #237: read-only boxes on a picture, linked to the list of lines beside it. Hover or choose
// a line and its box lights; choose a box and the list scrolls to its line. Choosing zooms to it.

const page = bookPages[6]!;
const lines = pageLines(7);

function PageWithLines({ chosen = null }: { chosen?: string | null }) {
  const state = useBoxes(chosen);
  const view = useViewport();
  const frame = React.useRef<HTMLDivElement>(null);
  return (
    <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)_16rem] items-start gap-4">
      <ViewportFrame ref={frame} label="Page 7" aspect={PAGE_SIZE[0] / PAGE_SIZE[1]} maxHeight="70svh" {...view}>
        <img src={page.src} alt="" className="size-full object-contain" />
        <BoxOverlay
          label="Lines the reader found"
          of={{ w: PAGE_SIZE[0], h: PAGE_SIZE[1] }}
          boxes={lines}
          state={state}
          onChoose={(box) => {
            const r = frame.current?.getBoundingClientRect();
            if (r) view.setViewport(zoomToBox(box, { w: PAGE_SIZE[0], h: PAGE_SIZE[1] }, { width: r.width, height: r.height }));
          }}
        />
      </ViewportFrame>
      <BoxList label="Lines on this page" boxes={lines} state={state} className="max-h-[70svh]" />
    </div>
  );
}

const meta = { title: "Data/BoxOverlay", component: PageWithLines, parameters: { layout: "padded" }, tags: ["visual-wide"] } satisfies Meta<typeof PageWithLines>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Every line the reader found, outlined; the ones it was unsure of are in the warning role. */
export const Lines: Story = {};

/** One line chosen: its box is filled and heavier, and the list holds it selected. */
export const OneChosen: Story = { args: { chosen: "p7-l6" } };

