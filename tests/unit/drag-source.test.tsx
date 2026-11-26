import { describe, expect, it } from "vite-plus/test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragSource, FileButton, FileDropZone, Timeline, type TimelineDrop } from "../../src";
import { refusesDrag } from "../../src/components/file-intake";
import { renderWithStrata } from "../../src/testing";

// Issue #286: a row dragged onto a drop target, by pointer or from the keyboard with its grip.

const TYPE = "application/x-clip";

function Screen({
  onDrop,
  onDragEnd,
  disabled,
}: {
  onDrop: (d: TimelineDrop) => void;
  onDragEnd?: (dropped: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <DragSource
        label="run-02.mp4"
        items={() => [{ [TYPE]: "clip-9", "text/plain": "run-02.mp4" }]}
        onDragEnd={onDragEnd}
        disabled={disabled}
      >
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

// Issue #291: a drop zone for files is not a target for the app's own drags.
describe("FileDropZone and an in-app drag", () => {
  const withZone = (refuseTypes?: string[], drag = { [TYPE]: "clip-9" }) => (
    <>
      <DragSource label="run-02.mp4" items={() => [drag]}>
        <button type="button">Select run-02.mp4</button>
      </DragSource>
      <FileDropZone title="Drag more files here" acceptLabel="a video" onFiles={() => {}} refuseTypes={refuseTypes}>
        <FileButton accept={["video/*"]} onFiles={() => {}}>
          Add files
        </FileButton>
      </FileDropZone>
      <Timeline
        label="Edit"
        lanes={[{ id: "t1", label: "Track 1" }]}
        items={[]}
        to={120}
        zoom={10}
        position={30}
        dropTypes={[TYPE]}
        dropLength={4}
        onDrop={() => {}}
      />
    </>
  );

  it("is skipped by a DragSource's keyboard drag: focus goes straight to the lane", async () => {
    const user = userEvent.setup();
    renderWithStrata(withZone());
    screen.getByRole("button", { name: "Drag run-02.mp4" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-label", "Track 1"));
    await user.keyboard("{Escape}");
  });

  it("is skipped for a type the app names in refuseTypes, too", async () => {
    const user = userEvent.setup();
    // The zone is told to refuse the app's own type; with `DragSource` the type is the app's and Strata's.
    renderWithStrata(withZone([TYPE]));
    screen.getByRole("button", { name: "Drag run-02.mp4" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.activeElement).toHaveAttribute("aria-label", "Track 1"));
    await user.keyboard("{Escape}");
  });
});

describe("refusesDrag", () => {
  const set = (...types: string[]) => ({ has: (t: string) => types.includes(t) });
  it("refuses a drag that carries a listed type, and not a drag of files", () => {
    expect(refusesDrag(set("application/x-strata-drag", "text/plain"), ["application/x-strata-drag"])).toBe(true);
    expect(refusesDrag(set("video/mp4"), ["application/x-strata-drag", "text/plain"])).toBe(false);
    expect(refusesDrag(set("application/octet-stream"), ["application/x-strata-drag"])).toBe(false);
  });
  it("never refuses a drag whose types the browser did not say (Safari's files answer true for every type)", () => {
    expect(refusesDrag({ has: () => true }, ["application/x-strata-drag"])).toBe(false);
  });
});
