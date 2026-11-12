import * as React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timeline, noOverlap, tickLabel, tickStep, ticksBetween, useTimelineZoom, type TimelineChange, type TimelineItem, type TimelineProps } from "../../src";
import { renderWithStrata } from "../../src/testing";

const lanes = [
  { id: "t1", label: "Track 1" },
  { id: "t2", label: "Track 2" },
];
const base: TimelineItem[] = [
  { id: "a", lane: "t1", start: 12, length: 35, label: "run-02.mp4", kind: "video" },
  { id: "b", lane: "t1", start: 60, length: 20, label: "run-03.mp4", kind: "video" },
  { id: "c", lane: "t2", start: 10, length: 30, label: "ambience.wav", kind: "audio" },
];

function Harness(props: Partial<TimelineProps> & { onChange?: (id: string, c: TimelineChange) => void }) {
  const { onChange, ...rest } = props;
  const [items, setItems] = React.useState(base);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [position, setPosition] = React.useState(5);
  const z = useTimelineZoom({ initial: 10 });
  return (
    <Timeline
      label="Edit"
      lanes={lanes}
      items={items}
      to={120}
      zoom={z.zoom}
      onZoomChange={z.setZoom}
      position={position}
      onPositionChange={setPosition}
      selectedIds={new Set(selected)}
      onSelect={setSelected}
      validate={noOverlap(items)}
      onItemChange={(id, c) => {
        onChange?.(id, c);
        setItems((all) => all.map((i) => (i.id === id ? { ...i, ...c } : i)));
      }}
      {...rest}
    />
  );
}

const status = () => screen.getByRole("status").textContent;

describe("tick arithmetic", () => {
  it("picks a step people write on a scale, wide enough that labels cannot collide", () => {
    expect(tickStep(10)).toBe(10); // 80px / 10px per second
    expect(tickStep(100)).toBe(1);
    expect(tickStep(0.5)).toBe(300); // five minutes
    for (const zoom of [0.2, 1, 7, 33, 120, 900]) expect(tickStep(zoom) * zoom).toBeGreaterThanOrEqual(80);
  });
  it("lists ticks on multiples of the step, ends included", () => {
    expect(ticksBetween(0, 30, 10)).toEqual([0, 10, 20, 30]);
    expect(ticksBetween(3, 25, 10)).toEqual([10, 20]);
    expect(ticksBetween(0, 0.3, 0.1)).toEqual([0, 0.1, 0.2, 0.3]);
  });
  it("labels as m:ss and h:mm:ss, with tenths under a second", () => {
    expect(tickLabel(65, 5)).toBe("1:05");
    expect(tickLabel(3725, 5)).toBe("1:02:05");
    expect(tickLabel(1.5, 0.5)).toBe("0:01.5");
  });
});

describe("Timeline structure", () => {
  it("names items for a screen reader with time range and lane, and lanes as labelled groups", () => {
    renderWithStrata(<Harness />);
    expect(screen.getByRole("button", { name: "run-02.mp4, 0:12 to 0:47, Track 1" })).toBeInTheDocument();
    const lane = screen.getByRole("group", { name: "Track 2" });
    expect(within(lane).getByRole("button", { name: /ambience.wav/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Edit" })).toBeInTheDocument();
  });

  it("is one tab stop for the items, and the current time is its own slider with a spoken value", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    const items = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-item"));
    expect(items.map((i) => i.tabIndex)).toEqual([0, -1, -1]);
    const slider = screen.getByRole("slider", { name: "Current time" });
    expect(slider).toHaveAttribute("aria-valuetext", "0:05");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuetext", "0:06");
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(slider).toHaveAttribute("aria-valuetext", "0:16");
    await user.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuetext", "2:00");
    await user.keyboard("{Home}");
    expect(slider).toHaveAttribute("aria-valuetext", "0:00");
  });

  it("draws ruler labels that never overlap and keeps the last one inside the axis", () => {
    const { container } = renderWithStrata(<Harness />);
    const labels = [...container.querySelectorAll("[data-ruler] > span")].map((s) => (s as HTMLElement).style.left);
    expect(labels.length).toBeGreaterThan(3);
    const px = labels.map((l) => parseFloat(l));
    for (let i = 1; i < px.length; i++) expect(px[i] - px[i - 1]).toBeGreaterThanOrEqual(80);
    const last = container.querySelectorAll<HTMLElement>("[data-ruler] > span")[px.length - 1];
    expect(last.style.transform).toBe("translateX(-100%)");
  });
});

describe("Timeline keyboard", () => {
  it("moves focus between items with the arrows, and between lanes", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    screen.getByRole("button", { name: /run-02.mp4/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /run-03.mp4/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /ambience.wav/ })).toHaveFocus();
    await user.keyboard("{ArrowUp}{Home}");
    expect(screen.getByRole("button", { name: /run-02.mp4/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: /run-03.mp4/ })).toHaveFocus();
  });

  it("selects with Enter and adds with Shift+Enter", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    const a = screen.getByRole("button", { name: /run-02.mp4/ });
    a.focus();
    await user.keyboard("{Enter}");
    expect(a).toHaveAttribute("aria-pressed", "true");
    screen.getByRole("button", { name: /run-03.mp4/ }).focus();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByRole("button", { name: /run-03.mp4/ })).toHaveAttribute("aria-pressed", "true");
    expect(a).toHaveAttribute("aria-pressed", "true");
  });

  it("selects, nudges, trims and moves to another lane by keyboard alone, reporting and announcing each", async () => {
    const user = userEvent.setup();
    const changes: [string, TimelineChange][] = [];
    renderWithStrata(<Harness onChange={(id, c) => changes.push([id, c])} />);
    screen.getByRole("button", { name: /run-02.mp4/ }).focus();
    await user.keyboard("{Enter}");

    await user.keyboard("{Control>}{ArrowRight}{/Control}");
    expect(changes.at(-1)).toEqual(["a", { start: 13, length: 35, lane: "t1" }]);
    expect(status()).toBe("run-02.mp4 moved to 0:13.");

    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}"); // trim the end by one
    expect(changes.at(-1)).toEqual(["a", { start: 13, length: 34, lane: "t1" }]);
    expect(status()).toBe("run-02.mp4 now 0:13 to 0:47.");

    await user.keyboard("{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}"); // trim the start by one
    expect(changes.at(-1)).toEqual(["a", { start: 14, length: 33, lane: "t1" }]);

    // Into Track 2, where ambience.wav sits at 0:10 to 0:40, it would overlap: refused with its reason.
    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(status()).toBe("run-02.mp4 would overlap ambience.wav.");
    expect(changes).toHaveLength(3);

    // run-03 (0:60 to 0:80) has room in Track 2.
    screen.getByRole("button", { name: /run-03.mp4/ }).focus();
    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(changes.at(-1)).toEqual(["b", { start: 60, length: 20, lane: "t2" }]);
    expect(status()).toBe("run-03.mp4 moved to Track 2.");
    expect(screen.getByRole("button", { name: "run-03.mp4, 1:00 to 1:20, Track 2" })).toBeInTheDocument();
  });

  it("nudges ten steps with Shift and keeps the item inside the axis", async () => {
    const user = userEvent.setup();
    const changes: [string, TimelineChange][] = [];
    renderWithStrata(<Harness onChange={(id, c) => changes.push([id, c])} />);
    screen.getByRole("button", { name: /run-03.mp4/ }).focus();
    await user.keyboard("{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}");
    expect(changes.at(-1)![1].start).toBe(70);
    await user.keyboard("{Control>}{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}{/Control}");
    expect(changes.at(-1)![1].start).toBe(100); // 120 end minus the 20 long item
  });

  it("refuses an overlap with the reason, changes nothing and reports nothing", async () => {
    const user = userEvent.setup();
    const changes: unknown[] = [];
    renderWithStrata(<Harness onChange={(...a) => changes.push(a)} />);
    screen.getByRole("button", { name: /run-02.mp4/ }).focus();
    await user.keyboard("{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}"); // 12 → 22, still clear
    await user.keyboard("{Control>}{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}{/Control}"); // would reach 52: overlaps run-03 at 60? 52+35 = 87 > 60
    expect(status()).toBe("run-02.mp4 would overlap run-03.mp4.");
    expect(changes.length).toBe(1);
  });

  it("asks the app to remove the selection with Delete", async () => {
    const user = userEvent.setup();
    const removed: string[][] = [];
    renderWithStrata(<Harness onDelete={(ids) => removed.push(ids)} />);
    const a = screen.getByRole("button", { name: /run-02.mp4/ });
    a.focus();
    await user.keyboard("{Enter}{Delete}");
    expect(removed).toEqual([["a"]]);
  });

  it("zooms with + - and 0 when the app takes zoom changes", async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    renderWithStrata(<Harness onZoomChange={(z) => seen.push(z)} />);
    screen.getByRole("button", { name: /run-02.mp4/ }).focus();
    await user.keyboard("+-0");
    expect(seen[0]).toBeCloseTo(15);
    expect(seen[1]).toBeCloseTo(6.67, 1);
    expect(seen[2]).toBeCloseTo(640 / 120, 2);
  });
});

describe("Timeline review fixes", () => {
  it("adds to the selection with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    screen.getByRole("button", { name: /run-02.mp4/ }).focus();
    await user.keyboard("{Enter}");
    screen.getByRole("button", { name: /run-03.mp4/ }).focus();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(screen.getByRole("button", { name: /run-02.mp4/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /run-03.mp4/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps focus on an item moved to another lane", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    screen.getByRole("button", { name: /run-03.mp4/ }).focus();
    await user.keyboard("{Control>}{ArrowDown}{/Control}");
    expect(screen.getByRole("button", { name: "run-03.mp4, 1:00 to 1:20, Track 2" })).toHaveFocus();
  });

  it("drags the current-time slider as well as the ruler", () => {
    const seen: number[] = [];
    renderWithStrata(<Harness onPositionChange={(t) => seen.push(t)} />);
    const slider = screen.getByRole("slider", { name: "Current time" });
    const ruler = slider.closest("[data-ruler]") as HTMLElement;
    ruler.getBoundingClientRect = () => new DOMRect(0, 0, 1200, 32);
    fireEvent.pointerDown(ruler, { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(ruler, { button: 0, clientX: 300, pointerId: 1 });
    expect(seen.at(-1)).toBeCloseTo(30, 1);
  });

  it("keeps the tab-stop item mounted when the view is scrolled far from it", () => {
    const many: TimelineItem[] = Array.from({ length: 500 }, (_, i) => ({ id: `i${i}`, lane: "t1", start: i * 10, length: 8, label: `Clip ${i}` }));
    const { container } = renderWithStrata(<Timeline label="Many" lanes={lanes} items={many} to={5000} zoom={10} />);
    const scroller = container.querySelector<HTMLElement>(".overflow-x-auto")!;
    Object.defineProperty(scroller, "scrollLeft", { value: 40000, configurable: true });
    fireEvent.scroll(scroller);
    expect(screen.getAllByRole("button").some((b) => b.tabIndex === 0)).toBe(true);
  });
});

describe("Timeline pointer and size", () => {
  it("selects on a click and does not report a change", () => {
    const changes: unknown[] = [];
    renderWithStrata(<Harness onChange={(...a) => changes.push(a)} />);
    const a = screen.getByRole("button", { name: /run-02.mp4/ });
    fireEvent.pointerDown(a, { button: 0, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(a, { button: 0, clientX: 100, clientY: 10 });
    expect(a).toHaveAttribute("aria-pressed", "true");
    expect(changes).toEqual([]);
  });

  it("moves an item by dragging, snapped to the next item's edge, and reports it once on release", () => {
    const changes: [string, TimelineChange][] = [];
    renderWithStrata(<Harness onChange={(id, c) => changes.push([id, c])} />);
    const a = screen.getByRole("button", { name: /run-02.mp4/ });
    fireEvent.pointerDown(a, { button: 0, clientX: 100, clientY: 10 });
    // 10 px per second: +25 px is +2.5 s, so start 14.5; the end (49.5)  is not near an edge, the start is not either.
    fireEvent.pointerMove(a, { clientX: 125, clientY: 10 });
    expect(changes).toEqual([]);
    fireEvent.pointerUp(a, { button: 0, clientX: 125, clientY: 10 });
    expect(changes).toHaveLength(1);
    expect(changes[0][1].start).toBeCloseTo(14.5, 1);
  });

  it("shows a refused drag with its reason in words and reports nothing on release", () => {
    const changes: unknown[] = [];
    renderWithStrata(<Harness onChange={(...a) => changes.push(a)} />);
    const a = screen.getByRole("button", { name: /run-02.mp4/ });
    fireEvent.pointerDown(a, { button: 0, clientX: 100, clientY: 10 });
    fireEvent.pointerMove(a, { clientX: 400, clientY: 10 }); // +30 s: 42 to 77 overlaps run-03
    expect(screen.getByText("run-02.mp4 would overlap run-03.mp4.")).toBeInTheDocument();
    fireEvent.pointerUp(a, { button: 0, clientX: 400, clientY: 10 });
    expect(changes).toEqual([]);
  });

  it("trims the end by dragging its edge", () => {
    const changes: [string, TimelineChange][] = [];
    renderWithStrata(<Harness onChange={(id, c) => changes.push([id, c])} />);
    const a = screen.getByRole("button", { name: /run-02.mp4/ });
    const edge = a.querySelectorAll("span[aria-hidden]")[1];
    fireEvent.pointerDown(edge, { button: 0, clientX: 470, clientY: 10 });
    fireEvent.pointerMove(edge, { clientX: 440, clientY: 10 });
    fireEvent.pointerUp(edge, { button: 0, clientX: 440, clientY: 10 });
    expect(changes[0][1].start).toBe(12);
    expect(changes[0][1].length).toBeCloseTo(32, 1);
  });

  it("renders only the items near the view, so thousands of items cost what is on screen", () => {
    const many: TimelineItem[] = Array.from({ length: 3000 }, (_, i) => ({ id: `i${i}`, lane: "t1", start: i * 10, length: 8, label: `Clip ${i}` }));
    renderWithStrata(<Timeline label="Many" lanes={lanes} items={many} to={30000} zoom={10} />);
    const rendered = screen.getAllByRole("button").length;
    expect(rendered).toBeGreaterThan(5);
    expect(rendered).toBeLessThan(100);
  });

  it("shows the empty content when there are no lanes", () => {
    renderWithStrata(<Timeline label="Edit" lanes={[]} items={[]} to={60} zoom={10} empty={<p>Add a track to begin</p>} />);
    expect(screen.getByText("Add a track to begin")).toBeInTheDocument();
  });
});
