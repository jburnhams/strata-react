import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragSource, Timeline, type TimelineDrop } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #286: a row dragged onto a drop target, by pointer or from the keyboard with its grip.

const TYPE = "application/x-clip";

function Screen({ onDrop, onDragEnd, disabled }: { onDrop: (d: TimelineDrop) => void; onDragEnd?: (dropped: boolean) => void; disabled?: boolean }) {
  return (
    <>
      <DragSource label="run-02.mp4" items={() => [{ [TYPE]: "clip-9", "text/plain": "run-02.mp4" }]} onDragEnd={onDragEnd} disabled={disabled}>
        <button type="button">Select run-02.mp4</button>
      </DragSource>
      <Timeline
        label="Edit"
        lanes={[{ id: "t1", label: "Track 1" }]}
        items={[]}
        to={120}
        zoom={10}
        position={30}
        dropTypes={[TYPE]}
        dropLength={4}
        onDrop={onDrop}
      />
    </>
  );
}

const announced = () => document.querySelector("[data-live-announcer]")?.textContent ?? "";

describe("DragSource", () => {
  it("names its grip after what it drags, and leaves the row's own buttons alone", async () => {
    const user = userEvent.setup();
    const drops: TimelineDrop[] = [];
    renderWithStrata(<Screen onDrop={(d) => drops.push(d)} />);
    expect(screen.getByRole("button", { name: "Drag run-02.mp4" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Select run-02.mp4" }));
    expect(announced()).not.toMatch(/Started dragging/);
    expect(drops).toHaveLength(0);
  });

  it("is dragged onto a timeline lane from the keyboard, and the lane gets its data", async () => {
    const user = userEvent.setup();
    const drops: TimelineDrop[] = [];
    const ends: boolean[] = [];
    renderWithStrata(<Screen onDrop={(d) => drops.push(d)} onDragEnd={(dropped) => ends.push(dropped)} />);
    screen.getByRole("button", { name: "Drag run-02.mp4" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(announced()).toMatch(/Started dragging/));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-label", "Track 1"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ lane: "t1", start: 30 });
    const item = drops[0].items[0];
    expect(item.kind).toBe("text");
    if (item.kind === "text") expect(await item.getText(TYPE)).toBe("clip-9");
    await waitFor(() => expect(ends).toEqual([true]));
  });

  it("says a cancelled drag was not dropped", async () => {
    const user = userEvent.setup();
    const ends: boolean[] = [];
    renderWithStrata(<Screen onDrop={() => {}} onDragEnd={(dropped) => ends.push(dropped)} />);
    screen.getByRole("button", { name: "Drag run-02.mp4" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-label", "Track 1"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(ends).toEqual([false]));
  });

  it("cannot be picked up when disabled", () => {
    renderWithStrata(<Screen onDrop={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Drag run-02.mp4" })).toBeDisabled();
  });
});
