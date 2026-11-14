import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegionEditor, type EditableRegion, type RegionEditorProps } from "../../src";
import { renderWithStrata } from "../../src/testing";

// jsdom has no layout: the overlay is given a 500 x 250 box for a 1000 x 500 picture, so one pixel is two units.
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = this.getAttribute("role") === "group" && this.getAttribute("aria-label") === "Cover crop" ? { width: 500, height: 250 } : { width: 0, height: 0 };
    return { ...box, left: 0, top: 0, right: box.width, bottom: box.height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => vi.restoreAllMocks());

const crop: EditableRegion = { id: "crop", label: "Crop", x: 100, y: 100, w: 400, h: 200, tone: "info" };

function Editor(props: Partial<RegionEditorProps> & { initial?: EditableRegion[]; onKept?: (r: readonly EditableRegion[]) => void }) {
  const [regions, setRegions] = React.useState<readonly EditableRegion[]>(props.initial ?? [crop]);
  return (
    <RegionEditor
      label="Cover crop"
      size={[1000, 500]}
      regions={regions}
      onChange={(r) => { setRegions(r); props.onKept?.(r); }}
      {...props}
    >
      <div data-testid="picture" className="size-full" />
    </RegionEditor>
  );
}

const box = () => screen.getByRole("group", { name: /^Crop:/ });

describe("RegionEditor", () => {
  it("is a labelled group with each window named in words and a hint for the keys", () => {
    renderWithStrata(<Editor />);
    expect(screen.getByRole("group", { name: "Cover crop" })).toHaveAccessibleDescription(/arrows move, Shift and arrows resize, Enter keeps, Escape undoes/);
    expect(box()).toHaveAccessibleName("Crop: 400 wide by 200 high, 100 across and 100 down");
  });

  it("drags a window to move it, keeping it on keeping when let go, and stops at the edge", () => {
    const onKept = vi.fn();
    renderWithStrata(<Editor onKept={onKept} />);
    const el = box();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 150, clientY: 130 }); // +100, +60 units
    expect(onKept).not.toHaveBeenCalled();
    expect(el).toHaveStyle({ left: "20%" });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 150, clientY: 130 });
    expect(onKept).toHaveBeenCalledWith([expect.objectContaining({ x: 200, y: 160, w: 400, h: 200 })]);
    fireEvent.pointerDown(box(), { pointerId: 1, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerMove(box(), { pointerId: 1, clientX: 5000, clientY: 5000 });
    fireEvent.pointerUp(box(), { pointerId: 1 });
    expect(onKept).toHaveBeenLastCalledWith([expect.objectContaining({ x: 600, y: 300 })]);
  });

  it("resizes from a handle with the aspect locked", () => {
    const onKept = vi.fn();
    renderWithStrata(<Editor aspect={2} onKept={onKept} />);
    const handle = box().querySelector('[data-handle="se"]')!;
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 250, clientY: 150, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 300, clientY: 160 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    const out = onKept.mock.calls[0]![0][0] as EditableRegion;
    expect(out.w / out.h).toBeCloseTo(2);
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
    expect(out.w).toBe(500);
  });

  it("draws a new window on the empty picture, only when the app lets it", () => {
    const onDraw = vi.fn();
    const { unmount } = renderWithStrata(<Editor />);
    const overlay = screen.getByRole("group", { name: "Cover crop" });
    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 100, clientY: 80 });
    fireEvent.pointerUp(overlay, { pointerId: 1 });
    expect(onDraw).not.toHaveBeenCalled();
    unmount();
    renderWithStrata(<Editor onDraw={onDraw} />);
    const o = screen.getByRole("group", { name: "Cover crop" });
    fireEvent.pointerDown(o, { pointerId: 1, clientX: 10, clientY: 10, button: 0 });
    fireEvent.pointerMove(o, { pointerId: 1, clientX: 100, clientY: 80 });
    fireEvent.pointerUp(o, { pointerId: 1 });
    expect(onDraw).toHaveBeenCalledWith({ x: 20, y: 20, w: 180, h: 140 });
    fireEvent.pointerDown(o, { pointerId: 1, clientX: 400, clientY: 200, button: 0 });
    fireEvent.pointerMove(o, { pointerId: 1, clientX: 401, clientY: 201 }); // a click, not a window
    fireEvent.pointerUp(o, { pointerId: 1 });
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it("does not let a handled arrow key reach an ancestor that pans", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    renderWithStrata(
      <div onKeyDown={outer}>
        <Editor />
      </div>,
    );
    box().focus();
    await user.keyboard("{ArrowRight}");
    expect(outer).not.toHaveBeenCalled();
  });

  it("moves with arrows, resizes with Shift+arrows, keeps on Enter and announces in words", async () => {
    const user = userEvent.setup();
    const onKept = vi.fn();
    renderWithStrata(<Editor onKept={onKept} />);
    box().focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
    expect(onKept).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Crop: 400 wide by 200 high, 120 across and 110 down");
    await user.keyboard("{Shift>}{ArrowRight}{ArrowDown}{/Shift}");
    expect(screen.getByRole("status")).toHaveTextContent("Crop: 410 wide by 210 high, 120 across and 110 down");
    await user.keyboard("{Enter}");
    expect(onKept).toHaveBeenCalledWith([expect.objectContaining({ x: 120, y: 110, w: 410, h: 210 })]);
  });

  it("Escape throws the draft away", async () => {
    const user = userEvent.setup();
    const onKept = vi.fn();
    renderWithStrata(<Editor onKept={onKept} />);
    box().focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{Escape}");
    expect(onKept).not.toHaveBeenCalled();
    expect(box()).toHaveAccessibleName("Crop: 400 wide by 200 high, 100 across and 100 down");
    expect(screen.getByRole("status")).toHaveTextContent("Crop: change undone");
  });

  it("holds the bounds and the minimum from the keyboard", async () => {
    const user = userEvent.setup();
    const onKept = vi.fn();
    renderWithStrata(<Editor bounds={{ x: 0, y: 0, w: 520, h: 320 }} min={{ w: 380, h: 190 }} onKept={onKept} />);
    box().focus();
    await user.keyboard("{ArrowRight>40/}{Enter}");
    expect(onKept).toHaveBeenLastCalledWith([expect.objectContaining({ x: 120, w: 400 })]);
    await user.keyboard("{Shift>}{ArrowLeft>40/}{ArrowUp>40/}{/Shift}{Enter}");
    expect(onKept).toHaveBeenLastCalledWith([expect.objectContaining({ w: 380, h: 190 })]);
  });

  it("keeps the numbers in step with the box, validating a typed value instead of clamping", async () => {
    const user = userEvent.setup();
    const onKept = vi.fn();
    renderWithStrata(<Editor aspect={2} onKept={onKept} />);
    const across = screen.getByRole("textbox", { name: "Across" });
    expect(across).toHaveValue("100");
    await user.clear(across);
    await user.type(across, "300{Enter}");
    expect(onKept).toHaveBeenLastCalledWith([expect.objectContaining({ x: 300 })]);
    const width = screen.getByRole("textbox", { name: "Width" });
    await user.clear(width);
    await user.type(width, "300{Enter}");
    expect(onKept).toHaveBeenLastCalledWith([expect.objectContaining({ w: 300, h: 150 })]);
    expect(box()).toHaveAccessibleName(/Crop: 300 wide by 150 high/);
  });

  it("shows Reset only while the windows differ from their defaults, and puts them back", async () => {
    const user = userEvent.setup();
    const onKept = vi.fn();
    renderWithStrata(<Editor defaults={[crop]} onKept={onKept} />);
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
    box().focus();
    await user.keyboard("{ArrowRight}{Enter}");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(onKept).toHaveBeenLastCalledWith([crop]);
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });
});

describe("RegionEditor, from and to", () => {
  const from: EditableRegion = { id: "from", label: "From", x: 0, y: 0, w: 500, h: 250, tone: "success" };
  const to: EditableRegion = { id: "to", label: "To", x: 400, y: 200, w: 300, h: 150, tone: "danger" };

  beforeEach(() => vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());

  it("names both windows and plays the move through onPreview, ending on the second", () => {
    const onPreview = vi.fn();
    renderWithStrata(<Editor initial={[from, to]} mode="move" onPreview={onPreview} duration={1000} easing="linear" />);
    expect(screen.getByRole("group", { name: /^From:/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /^To:/ })).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Watch" }).click());
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(500));
    const mid = onPreview.mock.calls.at(-1)!;
    expect(mid[1]).toBeGreaterThan(0.4);
    expect(mid[1]).toBeLessThan(0.6);
    expect(mid[0].x).toBeCloseTo(400 * mid[1], 0);
    expect(document.querySelector("[data-preview]")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(700));
    expect(onPreview).toHaveBeenLastCalledWith({ x: 400, y: 200, w: 300, h: 150 }, 1);
    act(() => void vi.advanceTimersByTime(500));
    expect(document.querySelector("[data-preview]")).toBeNull();
    expect(screen.getByRole("button", { name: "Watch" })).toBeInTheDocument();
  });

  it("Stop ends the preview where it is", () => {
    const onPreview = vi.fn();
    renderWithStrata(<Editor initial={[from, to]} mode="move" onPreview={onPreview} duration={1000} />);
    act(() => screen.getByRole("button", { name: "Watch" }).click());
    act(() => void vi.advanceTimersByTime(200));
    act(() => screen.getByRole("button", { name: "Stop" }).click());
    const calls = onPreview.mock.calls.length;
    act(() => void vi.advanceTimersByTime(2000));
    expect(onPreview.mock.calls.length).toBe(calls);
    expect(document.querySelector("[data-preview]")).toBeNull();
  });

  it("draws a line between the windows' centres only in move mode", () => {
    const { container, rerender } = renderWithStrata(<Editor initial={[from, to]} mode="move" />);
    expect(container.querySelector("line")).toBeInTheDocument();
    rerender(<Editor initial={[from, to]} />);
    expect(container.querySelector("line")).toBeNull();
  });
});

describe("RegionEditor turning (issue #241)", () => {
  it("draws the picture turned on the canvas it needs and works in that canvas's units", () => {
    renderWithStrata(<Editor angle={90} initial={[{ id: "crop", label: "Crop", x: 100, y: 100, w: 200, h: 100 }]} />);
    const turned = screen.getByTestId("picture").parentElement!;
    expect(turned.style.transform).toContain("rotate(90deg)");
    // The canvas is 500 wide by 1000 high at 90°: the picture (1000 by 500) is 2× its width and half its height.
    expect(turned.style.width).toBe("200%");
    expect(turned.style.height).toBe("50%");
  });

  it("turns the windows with the picture when the angle changes, in the same step", async () => {
    const onAngleChange = vi.fn();
    const onKept = vi.fn();
    renderWithStrata(<Editor angle={0} onAngleChange={onAngleChange} onKept={onKept} initial={[{ id: "crop", label: "Crop", x: 0, y: 0, w: 200, h: 100 }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Turn right 90°" }));
    expect(onAngleChange).toHaveBeenCalledWith(90);
    const kept = onKept.mock.calls[0][0][0];
    expect(kept).toMatchObject({ w: 200, h: 100 });
    expect(kept.x + kept.w).toBeLessThanOrEqual(500);
    expect(screen.getByRole("group", { name: "Turn the picture" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Fine turn" })).toBeInTheDocument();
  });

  it("has Level once the picture is turned a little, and a guide of level lines on request", async () => {
    const onAngleChange = vi.fn();
    const { container } = renderWithStrata(<Editor angle={1.5} onAngleChange={onAngleChange} guide />);
    expect(container.querySelector("svg[data-guide]")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Level" }));
    expect(onAngleChange).toHaveBeenCalledWith(0);
  });
});

describe("RegionEditor spread (issue #241)", () => {
  const spreadWindows: EditableRegion[] = [
    { id: "left", label: "Left page", x: 0, y: 0, w: 500, h: 500 },
    { id: "right", label: "Right page", x: 500, y: 0, w: 500, h: 500, tone: "info" },
  ];
  it("splits one window in two and makes two one again", async () => {
    const onKept = vi.fn();
    renderWithStrata(<Editor mode="spread" onKept={onKept} initial={[{ id: "page", label: "Page", x: 0, y: 0, w: 1000, h: 500 }]} />);
    await userEvent.click(screen.getByRole("button", { name: "Split into two" }));
    expect(onKept.mock.calls[0][0].map((r: EditableRegion) => [r.label, r.x, r.w])).toEqual([["Left page", 0, 500], ["Right page", 500, 500]]);
    await userEvent.click(screen.getByRole("button", { name: "Make one" }));
    expect(onKept.mock.calls[1][0]).toEqual([expect.objectContaining({ id: "page", label: "Page", x: 0, w: 1000 })]);
  });
  it("moves the gutter from the keyboard so both windows resize together", async () => {
    const onKept = vi.fn();
    renderWithStrata(<Editor mode="spread" onKept={onKept} initial={spreadWindows} />);
    const gutter = screen.getByRole("separator", { name: "Gutter between the two pages" });
    expect(gutter).toHaveAttribute("aria-valuenow", "500");
    gutter.focus();
    await userEvent.keyboard("{ArrowRight}");
    const [l, r] = onKept.mock.calls[0][0];
    expect(l.w).toBe(510);
    expect(r.x).toBe(510);
    expect(r.w).toBe(490);
  });
});
