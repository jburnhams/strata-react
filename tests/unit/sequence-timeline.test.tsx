import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SequenceTimeline, clampToRoom, gridPoints, settleCut, snapToGrid, stepOnGrid, type CutRoom, type SequenceItem, type SequenceTimelineProps } from "../../src";
import { renderWithStrata } from "../../src/testing";

describe("sequence grid maths", () => {
  it("snaps to a step or to the beats' own times, or not at all", () => {
    expect(snapToGrid(1.26, 0.5)).toBe(1.5);
    expect(snapToGrid(1.2, 0.5)).toBe(1);
    expect(snapToGrid(7.9, [2, 5.5, 8.1])).toBe(8.1);
    expect(snapToGrid(1.26, undefined)).toBe(1.26);
  });
  it("steps along the grid past the point it is on, with a fallback when there is none", () => {
    expect(stepOnGrid(1.5, 1, 0.5, 0.1)).toBe(2);
    expect(stepOnGrid(1.5, -1, 0.5, 0.1)).toBe(1);
    expect(stepOnGrid(1.3, 1, 0.5, 0.1)).toBe(1.5);
    expect(stepOnGrid(1.3, -1, 0.5, 0.1)).toBe(1);
    expect(stepOnGrid(5.5, 1, [2, 5.5, 8.1], 0.1)).toBe(8.1);
    expect(stepOnGrid(5.5, -1, [2, 5.5, 8.1], 0.1)).toBe(2);
    expect(stepOnGrid(9, 1, [2, 5.5, 8.1], 0.1)).toBe(9.1);
    expect(stepOnGrid(1, 1, undefined, 0.1)).toBe(1.1);
  });
  it("lists grid points inside a range", () => {
    expect(gridPoints(0.5, 0, 2)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(gridPoints([1, 5, 9], 2, 8)).toEqual([5]);
    expect(gridPoints(undefined, 0, 5)).toEqual([]);
  });
  it("clamps to the room, saying which end held it and why", () => {
    const room = { min: 10, max: 20, minReason: "Window 3 has no more media before 0:10.", maxReason: "Window 4 would be empty." };
    expect(clampToRoom(15, room)).toEqual({ time: 15, limit: null });
    expect(clampToRoom(5, room)).toEqual({ time: 10, limit: { side: "min", at: 10, reason: room.minReason } });
    expect(clampToRoom(25, room)).toEqual({ time: 20, limit: { side: "max", at: 20, reason: room.maxReason } });
  });
  it("snaps a drag to the grid but never to a point outside the room", () => {
    const room = { min: 10.2, max: 20 };
    expect(settleCut(12.3, 0.5, room).time).toBe(12.5);
    expect(settleCut(10.3, 0.5, room)).toEqual({ time: 10.5, limit: null });
    expect(settleCut(10.1, 0.5, room)).toMatchObject({ time: 10.2, limit: { side: "min" } });
    expect(settleCut(3, 0.5, room).limit?.side).toBe("min");
  });
});

// jsdom has no layout: the track is 1000 px wide (50 px a second over 20 s).
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const wide = this.className?.toString().includes("relative") && this.getAttribute("style")?.includes("width");
    const w = wide ? 1000 : 0;
    return { left: 0, top: 0, right: w, bottom: 0, width: w, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => vi.restoreAllMocks());

const windows: SequenceItem[] = [
  { id: "w1", label: "Start line", start: 0, end: 5 },
  { id: "w2", label: "First climb", start: 5, end: 12 },
  { id: "w3", label: "Summit", start: 12, end: 16 },
  { id: "w4", label: "Descent", start: 16, end: 20 },
];

function Strip(props: Partial<SequenceTimelineProps> & { onChange?: SequenceTimelineProps["onCutChange"] }) {
  const [items, setItems] = React.useState(windows);
  return (
    <SequenceTimeline
      label="Film, windows in order"
      zoom={50}
      items={items}
      onCutChange={(i, time, change) => {
        props.onChange?.(i, time, change);
        setItems((cur) => cur.map((w) => (w.id === change.before.id ? change.before : w.id === change.after.id ? change.after : w)));
      }}
      {...props}
    />
  );
}

const cut = (n: number) => screen.getByRole("slider", { name: new RegExp(`^Cut ${n},`) });

describe("SequenceTimeline", () => {
  it("draws windows named with their times, and a slider per cut with its room", () => {
    renderWithStrata(<Strip room={(i) => ({ min: [3, 8, 13][i]!, max: [9, 15, 19][i]! })} />);
    expect(screen.getByRole("group", { name: "Film, windows in order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First climb, 0:05.0 to 0:12.0" })).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(3);
    expect(cut(2)).toHaveAttribute("aria-valuenow", "12");
    expect(cut(2)).toHaveAttribute("aria-valuemin", "8");
    expect(cut(2)).toHaveAttribute("aria-valuemax", "15");
    expect(cut(2)).toHaveAttribute("aria-valuetext", "0:12.0");
  });

  it("steps a cut along the grid with the arrows, Shift for a second, and announces both windows", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithStrata(<Strip grid={0.5} onChange={onChange} />);
    cut(2).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(1, 12.5, { before: { ...windows[1], end: 12.5 }, after: { ...windows[2], start: 12.5 } });
    expect(screen.getByRole("status")).toHaveTextContent("Cut 2 moved to 0:12.5. Window 2 is 7.5 s, window 3 is 3.5 s.");
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(onChange).toHaveBeenLastCalledWith(1, 11.5, expect.anything());
    expect(screen.getByRole("status")).toHaveTextContent("Cut 2 moved to 0:11.5. Window 2 is 6.5 s, window 3 is 4.5 s.");
  });

  it("Home and End go to the ends of the room, and a refused step says why", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const room: (i: number) => CutRoom = () => ({ min: 10, max: 14, minReason: "Window 2 has no media before 0:10.", maxReason: "Window 3 is only 0:14 long." });
    renderWithStrata(<Strip room={room} onChange={onChange} />);
    cut(2).focus();
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith(1, 14, expect.anything());
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Cut 2 stays at 0:14.0. Window 3 is only 0:14 long.");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(1, 10, expect.anything());
  });

  it("drags a cut, showing it live and reporting once on release, snapped to the grid", () => {
    const onChange = vi.fn();
    renderWithStrata(<Strip grid={0.5} onChange={onChange} />);
    const el = cut(2);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 600, button: 0 }); // 12 s is at 600 px (50 px a second)
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 707 }); // 14.14 s
    expect(onChange).not.toHaveBeenCalled();
    expect(el).toHaveAttribute("aria-valuenow", "14");
    expect(screen.getByRole("button", { name: /First climb, 0:05.0 to 0:14.0/ })).toBeInTheDocument();
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1, 14, expect.anything());
  });

  it("stops a drag at the room and says why, in words, while it is held there", () => {
    const onChange = vi.fn();
    renderWithStrata(<Strip onChange={onChange} room={() => ({ min: 8, max: 15, maxReason: "Window 3 would have no media left." })} />);
    const el = cut(2);
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 600, button: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 900 });
    expect(el).toHaveAttribute("aria-valuenow", "15");
    expect(screen.getByText("Cut 2 stops at 0:15.0. Window 3 would have no media left.")).toBeInTheDocument();
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(1, 15, expect.anything());
    expect(screen.queryByText(/stops at/, { selector: "p" })).toBeNull();
  });

  it("a click on a cut that does not move reports nothing", () => {
    const onChange = vi.fn();
    renderWithStrata(<Strip onChange={onChange} />);
    fireEvent.pointerDown(cut(1), { pointerId: 1, clientX: 250, button: 0 });
    fireEvent.pointerUp(cut(1), { pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("draws the grid on the ruler", () => {
    const { container } = renderWithStrata(<Strip grid={5} />);
    expect(container.querySelectorAll("[data-beat]")).toHaveLength(5);
  });

  it("chooses a window, and a run with Shift+click, in order whichever way it is made", async () => {
    const user = userEvent.setup();
    const onSelectRange = vi.fn();
    renderWithStrata(<Strip onSelectRange={onSelectRange} selected={["w2"]} />);
    expect(screen.getByRole("button", { name: /First climb/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Descent/ }));
    expect(onSelectRange).toHaveBeenLastCalledWith(["w4"]);
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: /First climb/ }));
    await user.keyboard("{/Shift}");
    expect(onSelectRange).toHaveBeenLastCalledWith(["w2", "w3", "w4"]);
  });

  it("draws a window's content from the slot", () => {
    renderWithStrata(<Strip renderItem={(w, on) => <img alt="" data-on={on} src={`/t/${w.id}.jpg`} />} />);
    expect(document.querySelectorAll("img[src^='/t/']")).toHaveLength(4);
  });
});
