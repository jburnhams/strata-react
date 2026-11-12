import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Compare, CompareGrid, CompareVideo, FIT, boxViewport, regionShares, type Candidate, type CompareMode, type Region, type VideoMedia } from "../../src";
import { frameBoxToShares } from "../../src/lib/viewport";
import { installFakeMedia, type FakeMedia } from "../utils/media";

const frame = { width: 400, height: 300 };
const face: Region = { id: "face", label: "Face", box: [176, 144, 176, 144], of: [704, 576] };
const text: Region = { id: "text", label: "Handwriting", box: [0.5, 0.5, 0.25, 0.25] };

describe("region arithmetic", () => {
  it("turns a box in the source's pixels into shares of the frame, and leaves shares alone", () => {
    expect(regionShares(face)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(regionShares(text)).toEqual([0.5, 0.5, 0.25, 0.25]);
  });

  it("fills the frame with the box: scaled to fit it, its centre at the frame's centre", () => {
    const v = boxViewport([0.25, 0.25, 0.25, 0.25], frame);
    expect(v.scale).toBe(4);
    // The box's centre is at 0.375 of the width, which is 25 px left of the centre of 400: it must come to 0.
    expect(v.x).toBeCloseTo(4 * 50);
    expect(v.y).toBeCloseTo(4 * 37.5);
    // A box the shape of the whole frame is the whole frame.
    expect(boxViewport([0, 0, 1, 1], frame)).toEqual(FIT);
  });

  it("fits the longer side of a box that is not the frame's shape", () => {
    expect(boxViewport([0.4, 0.4, 0.5, 0.1], frame).scale).toBe(2);
  });

  it("turns a rectangle drawn on the frame into shares of the picture under the zoom now", () => {
    const whole = frameBoxToShares({ x0: 100, y0: 75, x1: 300, y1: 225 }, FIT, frame);
    expect(whole).toEqual([0.25, 0.25, 0.5, 0.5]);
    // At 2× about the centre, the same rectangle is half as much of the picture.
    const zoomed = frameBoxToShares({ x0: 100, y0: 75, x1: 300, y1: 225 }, { scale: 2, x: 0, y: 0 }, frame);
    expect(zoomed[0]).toBeCloseTo(0.375);
    expect(zoomed[2]).toBeCloseTo(0.25);
    // Dragged the other way, and past the edge, it is the same box inside the picture.
    expect(frameBoxToShares({ x0: 500, y0: 300, x1: 300, y1: 150 }, FIT, frame)).toEqual([0.75, 0.5, 0.25, 0.5]);
  });
});

const side = (label: string, id: string) => ({ id, label, note: `note-${id}`, media: { kind: "image" as const, src: `/img/${label}`, alt: `alt-${id}`, size: [704, 576] as const } });

function Harness({ regions = [face, text], blind = true, start = "side" as CompareMode }: { regions?: readonly Region[]; blind?: boolean; start?: CompareMode }) {
  const [mode, setMode] = React.useState<CompareMode>(start);
  return <Compare label="Photo 1" blind={blind} missing="Gone" mode={mode} onModeChange={setMode} regions={regions} a={side("A", "model-x")} b={side("B", "model-y")} />;
}
const transformOf = (name: string) => (screen.getByRole("group", { name }).firstElementChild as HTMLElement).style.transform;

describe("Compare regions", () => {
  it("offers the whole frame and each region as chips, and shows a region in both pictures", async () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Whole frame" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Face" }));
    expect(screen.getByRole("radio", { name: "Face" })).toBeChecked();
    expect(transformOf("Picture A")).toContain("scale(4)");
    expect(transformOf("Picture B")).toBe(transformOf("Picture A"));
  });

  it("draws nearest-neighbour while a region is shown, and not otherwise", async () => {
    render(<Harness />);
    const img = () => screen.getByRole("img", { name: "A" });
    expect(img().style.imageRendering).toBe("");
    await userEvent.click(screen.getByRole("radio", { name: "Face" }));
    expect(img().style.imageRendering).toBe("pixelated");
  });

  it("chooses a region from its key, and the whole frame from 0", async () => {
    render(<Harness />);
    await userEvent.keyboard("w");
    expect(screen.getByRole("radio", { name: "Handwriting" })).toBeChecked();
    await userEvent.keyboard("0");
    expect(screen.getByRole("radio", { name: "Whole frame" })).toBeChecked();
    expect(screen.getByText("Region: Face")).toBeInTheDocument(); // in the one legend
  });

  it("lets go of the chip when the view is moved by hand", async () => {
    render(<Harness />);
    await userEvent.keyboard("q");
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("radio", { name: "Whole frame" })).toBeChecked();
  });

  it("keeps working in swipe, fade and blink", async () => {
    render(<Harness start="swipe" />);
    await userEvent.keyboard("q");
    expect(transformOf("A over B")).toContain("scale(4)");
    await userEvent.keyboard("4");
    expect(transformOf("Picture A")).toContain("scale(4)");
  });

  it("outlines the box on the whole frame while its chip is pointed at", async () => {
    const { container } = render(<Harness />);
    expect(container.querySelector(".border-foreground.ring-1")).toBeNull();
    await userEvent.hover(screen.getByRole("radio", { name: "Face" }));
    expect(container.querySelector(".border-foreground.ring-1")).not.toBeNull();
    await userEvent.unhover(screen.getByRole("radio", { name: "Face" }));
    expect(container.querySelector(".border-foreground.ring-1")).toBeNull();
  });

  it("never writes a candidate's id, alt or note when blind, with regions", async () => {
    const { container } = render(<Harness />);
    await userEvent.keyboard("q");
    const html = container.ownerDocument.body.innerHTML;
    for (const leak of ["model-x", "model-y", "note-", "alt-"]) expect(html).not.toContain(leak);
  });

  it("makes a region from a Shift-drag, named for its number, and shows it", () => {
    const saved = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    try {
      render(<Harness />);
      const frameA = screen.getByRole("group", { name: "Picture A" });
      fireEvent.pointerDown(frameA, { clientX: 100, clientY: 75, shiftKey: true, button: 0 });
      fireEvent.pointerMove(frameA, { clientX: 300, clientY: 225 });
      fireEvent.pointerUp(frameA, { clientX: 300, clientY: 225 });
      expect(screen.getByRole("radio", { name: "Region 3" })).toBeChecked();
      expect(transformOf("Picture B")).toContain("scale(2)");
    } finally {
      Element.prototype.getBoundingClientRect = saved;
    }
  });

  it("drops a hand-drawn region when the pair changes", () => {
    const saved = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    try {
      const { rerender } = render(<Harness />);
      const frameA = screen.getByRole("group", { name: "Picture A" });
      fireEvent.pointerDown(frameA, { clientX: 100, clientY: 75, shiftKey: true, button: 0 });
      fireEvent.pointerMove(frameA, { clientX: 300, clientY: 225 });
      fireEvent.pointerUp(frameA, { clientX: 300, clientY: 225 });
      rerender(<Compare label="Photo 2" blind missing="Gone" mode="side" onModeChange={() => undefined} regions={[face, text]} a={side("A2", "x")} b={side("B2", "y")} />);
      expect(screen.queryByRole("radio", { name: "Region 3" })).toBeNull();
      expect(screen.getByRole("radio", { name: "Whole frame" })).toBeChecked();
    } finally {
      Element.prototype.getBoundingClientRect = saved;
    }
  });

  it("shows no strip when there are no regions", () => {
    render(<Harness regions={[]} />);
    expect(screen.queryByRole("radio", { name: "Whole frame" })).toBeNull();
  });
});

describe("CompareGrid regions", () => {
  it("shows the same region in every tile", async () => {
    const items: Candidate[] = ["A", "B", "C"].map((l) => ({ id: l, label: l, media: { kind: "image", src: `/img/${l}`, alt: l, size: [704, 576] } }));
    render(<CompareGrid label="Three versions" items={items} blind={false} missing="Gone" regions={[face]} />);
    await userEvent.click(screen.getByRole("radio", { name: "Face" }));
    for (const l of ["A", "B", "C"]) expect((within(screen.getByRole("group", { name: l })).getByRole("img") as HTMLImageElement).style.imageRendering).toBe("pixelated");
    const t = (l: string) => (screen.getByRole("group", { name: l }).firstElementChild as HTMLElement).style.transform;
    expect(t("B")).toBe(t("A"));
    expect(t("C")).toContain("scale(4)");
  });
});

describe("CompareVideo regions", () => {
  let media: FakeMedia;
  beforeEach(() => void (media = installFakeMedia()));
  afterEach(() => media.uninstall());
  const clip = (label: string, size: [number, number]): Candidate<VideoMedia> => ({ id: `id-${label}`, label, media: { kind: "video", src: `/clips/${label}.mp4`, width: size[0], height: size[1], fps: 25 } });

  it("shows the region in both videos, which keep playing on the clock, nearest-neighbour", async () => {
    render(<CompareVideo label="Pair" a={clip("A", [1440, 1080])} b={clip("B", [2816, 2304])} blind missing="Gone" mode="swipe" onModeChange={() => undefined} regions={[face]} />);
    act(() => {
      media.loaded(screen.getByLabelText("Video A"), 10);
      media.loaded(screen.getByLabelText("Video B"), 10);
    });
    await userEvent.keyboard(" ");
    await userEvent.keyboard("q");
    expect(screen.getByRole("radio", { name: "Face" })).toBeChecked();
    expect((screen.getByLabelText("Video A") as HTMLVideoElement).style.imageRendering).toBe("pixelated");
    expect((screen.getByLabelText("Video B") as HTMLVideoElement).style.imageRendering).toBe("pixelated");
    expect((screen.getByLabelText("Video A") as HTMLVideoElement).paused).toBe(false);
    expect((screen.getByLabelText("Video B") as HTMLVideoElement).paused).toBe(false);
  });

  it("makes a hand-drawn region only while paused", () => {
    const saved = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    try {
      render(<CompareVideo label="Pair" a={clip("A", [400, 300])} b={clip("B", [800, 600])} blind missing="Gone" mode="side" onModeChange={() => undefined} regions={[face]} />);
      const frameA = screen.getByRole("group", { name: "Frame A" });
      fireEvent.pointerDown(frameA, { clientX: 100, clientY: 75, shiftKey: true, button: 0 });
      fireEvent.pointerMove(frameA, { clientX: 300, clientY: 225 });
      fireEvent.pointerUp(frameA, { clientX: 300, clientY: 225 });
      expect(screen.getByRole("radio", { name: "Region 2" })).toBeChecked();
    } finally {
      Element.prototype.getBoundingClientRect = saved;
    }
  });
});
