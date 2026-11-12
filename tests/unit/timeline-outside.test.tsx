import { describe, expect, it } from "vitest";
import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import { Timeline, noOverlap, type TimelineDrop, type TimelineItem } from "../../src";
import userEvent from "@testing-library/user-event";
import { useDrag } from "react-aria";
import { renderWithStrata } from "../../src/testing";

// Issue #121: drops from outside, lane height, kind colours, header width.

const lanes = [
  { id: "t1", label: "Track 1" },
  { id: "t2", label: "Track 2 (locked)" },
];
const items: TimelineItem[] = [{ id: "a", lane: "t1", start: 12, length: 8, label: "run-02.mp4", kind: "video" }];

function Harness({ onDrop, position }: { onDrop: (d: TimelineDrop) => void; position?: number }) {
  return (
    <Timeline
      label="Edit"
      lanes={lanes}
      items={items}
      to={120}
      zoom={10}
      position={position}
      dropTypes={["application/x-clip"]}
      dropLength={4}
      onDrop={onDrop}
      validateDrop={(c) => (c.lane === "t2" ? "Track 2 is locked." : noOverlap(items)("", c))}
    />
  );
}

const lane = (name: string) => screen.getByRole("group", { name });

function drag(target: HTMLElement, clientX: number, type = "application/x-clip") {
  const dataTransfer = {
    types: [type],
    items: [{ kind: "string", type, getAsString: (cb: (s: string) => void) => cb("clip-9"), getAsFile: () => null }],
    getData: () => "clip-9",
    dropEffect: "copy",
    effectAllowed: "all",
  };
  // jsdom's drag events carry no coordinates, so they are set on the event.
  const send = (name: "dragEnter" | "dragOver" | "drop" | "dragLeave") => {
    const event = createEvent[name](target, { dataTransfer });
    Object.defineProperty(event, "clientX", { value: clientX });
    Object.defineProperty(event, "clientY", { value: 0 });
    fireEvent(target, event);
  };
  send("dragEnter");
  send("dragOver");
  return { drop: () => send("drop"), leave: () => send("dragLeave") };
}

describe("Timeline: drops from outside", () => {
  it("reports the lane and the time the drop landed on", () => {
    const drops: TimelineDrop[] = [];
    renderWithStrata(<Harness onDrop={(d) => drops.push(d)} />);
    drag(lane("Track 1"), 400).drop();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ lane: "t1", start: 40, length: 4 });
    expect(drops[0].items[0].kind).toBe("text");
    expect(screen.getByRole("status")).toHaveTextContent("Added at 0:40, Track 1.");
  });

  it("snaps the dropped item's edge to a neighbour like a move", () => {
    const drops: TimelineDrop[] = [];
    renderWithStrata(<Harness onDrop={(d) => drops.push(d)} />);
    // 20 is the end of run-02.mp4; 20.2 is within the snap distance at 10px a second.
    drag(lane("Track 1"), 202).drop();
    expect(drops[0].start).toBe(20);
  });

  it("shows the refusal while hovering, and does not report a refused drop", () => {
    const drops: TimelineDrop[] = [];
    renderWithStrata(<Harness onDrop={(d) => drops.push(d)} />);
    const d = drag(lane("Track 2 (locked)"), 300);
    expect(screen.getByText("Track 2 is locked.")).toBeInTheDocument();
    d.drop();
    expect(drops).toEqual([]);
    expect(screen.getByRole("status")).toHaveTextContent("Track 2 is locked.");
    expect(screen.queryByText("Track 2 is locked.", { selector: "p[aria-hidden]" })).not.toBeInTheDocument();
  });

  it("refuses a drop that would overlap, with the item named", () => {
    const drops: TimelineDrop[] = [];
    renderWithStrata(<Harness onDrop={(d) => drops.push(d)} />);
    const d = drag(lane("Track 1"), 150);
    expect(screen.getByText("This would overlap run-02.mp4.")).toBeInTheDocument();
    d.drop();
    expect(drops).toEqual([]);
  });

  it("clears the preview when the drag leaves", () => {
    renderWithStrata(<Harness onDrop={() => {}} />);
    const d = drag(lane("Track 1"), 400);
    expect(screen.getByText(/0:40 to 0:44, Track 1/)).toBeInTheDocument();
    d.leave();
    expect(screen.queryByText(/0:40 to 0:44/)).not.toBeInTheDocument();
  });

  it("ignores a drag of a type it does not take", () => {
    const drops: TimelineDrop[] = [];
    renderWithStrata(<Harness onDrop={(d) => drops.push(d)} />);
    drag(lane("Track 1"), 400, "text/uri-list").drop();
    expect(drops).toEqual([]);
  });

  it("drops at the current time when the lane is the focused element (the keyboard drag)", () => {
    const drops: TimelineDrop[] = [];
    renderWithStrata(<Harness onDrop={(d) => drops.push(d)} position={60} />);
    const el = lane("Track 1");
    act(() => el.focus());
    expect(el).toHaveFocus();
    drag(el, 5).drop();
    expect(drops[0]).toMatchObject({ lane: "t1", start: 60 });
    expect(screen.getByRole("status")).toHaveTextContent("Added at 1:00, Track 1.");
  });

  it("is not a drop target without dropTypes", () => {
    renderWithStrata(<Timeline label="Edit" lanes={lanes} items={items} to={120} zoom={10} />);
    expect(lane("Track 1")).not.toHaveAttribute("tabindex");
  });
});

describe("Timeline: lane height, kind colours, header", () => {
  it("makes lanes and their headers laneRows control heights tall", () => {
    const { container } = renderWithStrata(<Timeline label="Edit" lanes={lanes} items={items} to={120} zoom={10} laneRows={3} />);
    expect(container.querySelector<HTMLElement>("[role=group]")!.style.getPropertyValue("--lane-h")).toBe("calc(var(--control-h) * 3)");
    expect(lane("Track 1").className).toContain("h-(--lane-h)");
  });

  it("colours a kind as the app says, and keeps the stripe when the set of kinds changes", () => {
    const more: TimelineItem[] = [{ id: "z", lane: "t2", start: 0, length: 5, label: "notes.gpx", kind: "gpx" }, ...items];
    const stripe = (list: TimelineItem[], kinds?: Record<string, string>) => {
      const { unmount } = renderWithStrata(<Timeline label="Edit" lanes={lanes} items={list} to={120} zoom={10} kindColours={kinds} />);
      const colour = screen.getByRole("button", { name: /^run-02/ }).style.borderTopColor;
      unmount();
      return colour;
    };
    const kinds = { video: "var(--info)", gpx: "var(--warning)" };
    expect(stripe(items, kinds)).toBe("var(--info)");
    expect(stripe(more, kinds)).toBe("var(--info)");
    // Without the map, the palette follows the order kinds appear in.
    expect(stripe(items)).toBe("var(--chart-1)");
    expect(stripe([{ id: "z", lane: "t2", start: 0, length: 5, label: "notes.gpx", kind: "gpx" }, ...items])).toBe("var(--chart-2)");
  });

  it("sizes the header column to its content with a cap, and names a truncated lane", () => {
    const long = [{ id: "t1", label: "Footage from the north ridge, take two", header: <button type="button">Mute</button> }];
    renderWithStrata(<Timeline label="Edit" lanes={long} items={[]} to={120} zoom={10} />);
    const name = screen.getByTitle("Footage from the north ridge, take two");
    expect(name).toHaveTextContent("Footage from the north ridge, take two");
    expect(name.parentElement!.parentElement!.className).toMatch(/w-max/);
  });
});

function Source() {
  const { dragProps } = useDrag({ getItems: () => [{ "application/x-clip": "clip-9" }], getAllowedDropOperations: () => ["copy"] });
  return (
    <div {...dragProps} role="button" tabIndex={0} aria-label="Drag clip-9">
      clip-9
    </div>
  );
}

describe("Timeline: a complete keyboard drag", () => {
  it("picks a clip up, moves to a lane that takes it and drops it at the current time", async () => {
    const user = userEvent.setup();
    const drops: TimelineDrop[] = [];
    renderWithStrata(
      <>
        <Source />
        <Harness onDrop={(d) => drops.push(d)} position={60} />
      </>,
    );
    const announced = () => document.querySelector("[data-live-announcer]")?.textContent ?? "";
    screen.getByRole("button", { name: "Drag clip-9" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(announced()).toMatch(/Started dragging/));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-label", "Track 1"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ lane: "t1", start: 60 });
  });
});
