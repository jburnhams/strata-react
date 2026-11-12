import * as React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowAction, SortableList, type DropTarget } from "../../src";
import { renderWithStrata } from "../../src/testing";

type Row = { id: string; name: string; kind: "video" | "text" };
const ROW_H = 40;

// Rows need their own boxes for React Aria's keyboard drop-target search; the global shim gives
// every element the same one. Row n sits at y = n * ROW_H.
let restore: () => void;
beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const row = this.closest("[role=row]");
    if (row && row.parentElement) {
      const index = [...row.parentElement.querySelectorAll(":scope > [role=row]")].indexOf(row);
      return new DOMRect(0, index * ROW_H, 300, ROW_H);
    }
    return original.call(this);
  };
  restore = () => (Element.prototype.getBoundingClientRect = original);
});
afterEach(async () => {
  restore();
  await userEvent.keyboard("{Escape}"); // end any drag a failed test left running
});

const start: Row[] = [
  { id: "a", name: "Intro", kind: "video" },
  { id: "b", name: "Main run", kind: "video" },
  { id: "c", name: "Outro", kind: "video" },
];

function Tracks({ onChange }: { onChange?: (ids: string[], target: DropTarget) => void }) {
  const [rows, setRows] = React.useState(start);
  return (
    <SortableList
      label="Tracks"
      items={rows}
      getKey={(r) => r.id}
      getLabel={(r) => r.name}
      empty={<p>No tracks</p>}
      onReorder={(keys, target) => {
        onChange?.(keys, target);
        setRows((all) => {
          const moving = all.filter((r) => keys.includes(r.id));
          const rest = all.filter((r) => !keys.includes(r.id));
          const at = rest.findIndex((r) => r.id === target.key);
          const index = target.position === "after" ? at + 1 : at;
          return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
        });
      }}
      renderActions={(r) => <RowAction label="Remove" subject={r.name} />}
    >
      {(r) => <span>{r.name}</span>}
    </SortableList>
  );
}

const names = () => within(screen.getByRole("grid", { name: "Tracks" })).getAllByRole("row").map((r) => r.textContent?.replace("Remove", "").trim());

describe("SortableList", () => {
  it("is a grid named by its label, with a named grip per row and the row's own actions", () => {
    renderWithStrata(<Tracks />);
    expect(names()).toEqual(["Intro", "Main run", "Outro"]);
    expect(screen.getAllByRole("button", { name: /^Drag/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Remove Intro" })).toBeInTheDocument();
  });

  it("reorders from the keyboard alone, announcing the pick-up, each position and the drop", async () => {
    const user = userEvent.setup();
    const seen: { keys: string[]; target: DropTarget }[] = [];
    renderWithStrata(<Tracks onChange={(keys, target) => seen.push({ keys, target })} />);
    const announced = () => document.querySelector("[data-live-announcer]")?.textContent ?? "";
    screen.getAllByRole("button", { name: /^Drag/ })[0].focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(announced()).toMatch(/Started dragging/));
    // Focus lands on the first drop position; the arrows walk the others. Stop after "Main run".
    for (let i = 0; i < 6 && document.activeElement?.getAttribute("aria-label") !== "Insert between Main run and Outro"; i++) {
      await user.keyboard("{ArrowDown}");
    }
    expect(document.activeElement).toHaveAccessibleName("Insert between Main run and Outro");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(announced()).toMatch(/Drop complete/));
    expect(seen).toEqual([{ keys: ["a"], target: { key: "c", position: "before" } }]); // "between Main run and Outro", as React Aria names it
    expect(names()).toEqual(["Main run", "Intro", "Outro"]);
  });

  it("cancels with Escape and leaves the order alone", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    renderWithStrata(<Tracks onChange={(...a) => seen.push(a)} />);
    screen.getAllByRole("button", { name: /^Drag/ })[0].focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{Escape}");
    expect(document.querySelector("[data-live-announcer]")?.textContent).toMatch(/Drop canceled/);
    expect(seen).toEqual([]);
    expect(names()).toEqual(["Intro", "Main run", "Outro"]);
  });

  it("selects a row by clicking it without starting a drag, and runs a row action on its own", async () => {
    const user = userEvent.setup();
    const picked: string[][] = [];
    function Selecting() {
      return (
        <SortableList
          label="Tracks"
          items={start}
          getKey={(r) => r.id}
          getLabel={(r) => r.name}
          empty={<p>No tracks</p>}
          onReorder={() => {}}
          selectionMode="single"
          onSelectionChange={(k) => picked.push([...k])}
          renderActions={(r) => <RowAction label="Remove" subject={r.name} onClick={() => picked.push(["remove", r.id])} />}
        >
          {(r) => <span>{r.name}</span>}
        </SortableList>
      );
    }
    renderWithStrata(<Selecting />);
    await user.click(screen.getByText("Main run"));
    expect(picked).toEqual([["b"]]);
    await user.click(screen.getByRole("button", { name: "Remove Outro" }));
    expect(picked[picked.length - 1]).toEqual(["remove", "c"]);
  });
});

type Asset = { id: string; name: string; kind: "video" | "text" };
const assets: Asset[] = [
  { id: "v1", name: "run-02.mp4", kind: "video" },
  { id: "t1", name: "Title card", kind: "text" },
];

function TwoLists({ inserted }: { inserted: { ids: string[]; target: DropTarget }[] }) {
  const [tracks, setTracks] = React.useState<Asset[]>([]);
  return (
    <div>
      <SortableList label="Library" items={assets} getKey={(a) => a.id} getLabel={(a) => a.name} getKind={(a) => a.kind} empty={<p>No assets</p>} onReorder={() => {}}>
        {(a) => <span>{a.name}</span>}
      </SortableList>
      <SortableList
        label="Timeline"
        items={tracks}
        getKey={(a) => a.id}
        getLabel={(a) => a.name}
        getKind={(a) => a.kind}
        accepts={["video"]}
        refuses={{ text: "The timeline takes video, not text. Add text from the Titles tab." }}
        empty={<p>Drag a video here</p>}
        onReorder={() => {}}
        onInsert={(ids, target) => {
          inserted.push({ ids, target });
          setTracks((t) => [...t, ...assets.filter((a) => ids.includes(a.id))]);
        }}
      >
        {(a) => <span>{a.name}</span>}
      </SortableList>
    </div>
  );
}

describe("moving between lists", () => {
  it("moves an accepted item to the other list from the keyboard, reporting its id and where it landed", async () => {
    const user = userEvent.setup();
    const inserted: { ids: string[]; target: DropTarget }[] = [];
    renderWithStrata(<TwoLists inserted={inserted} />);
    screen.getByRole("button", { name: "Drag run-02.mp4" }).focus();
    await user.keyboard("{Enter}");
    // Tab moves between the lists that accept the item; stop on the empty timeline's drop target.
    await user.keyboard("{Tab}");
    expect(document.activeElement).toHaveAccessibleName("Drop on Timeline");
    expect(document.activeElement?.closest("[role=grid]")).toHaveAccessibleName("Timeline");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(inserted.length).toBe(1));
    expect(inserted[0].ids).toEqual(["v1"]);
    expect(await within(screen.getByRole("grid", { name: "Timeline" })).findByRole("row", { name: "run-02.mp4" })).toBeInTheDocument();
  });

  it("does not offer the timeline as a place to drop a text item, so nothing is inserted", async () => {
    const user = userEvent.setup();
    const inserted: { ids: string[]; target: DropTarget }[] = [];
    renderWithStrata(<TwoLists inserted={inserted} />);
    screen.getByRole("button", { name: "Drag Title card" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Tab}{Tab}{Tab}");
    await user.keyboard("{Enter}");
    expect(inserted).toEqual([]);
  });

  it("does not take an item of a kind it already holds when that kind is not in accepts", async () => {
    const user = userEvent.setup();
    const inserted: unknown[] = [];
    function Pair() {
      const vids: Asset[] = [{ id: "v9", name: "other.mp4", kind: "video" }];
      return (
        <div>
          <SortableList label="Library" items={assets} getKey={(a) => a.id} getLabel={(a) => a.name} getKind={(a) => a.kind} empty={<p>none</p>} onReorder={() => {}}>
            {(a) => <span>{a.name}</span>}
          </SortableList>
          {/* Holds a video already, but takes nothing from other lists. */}
          <SortableList label="Closed" items={vids} getKey={(a) => a.id} getLabel={(a) => a.name} getKind={(a) => a.kind} empty={<p>none</p>} onReorder={() => {}} onInsert={(...a) => inserted.push(a)}>
            {(a) => <span>{a.name}</span>}
          </SortableList>
        </div>
      );
    }
    renderWithStrata(<Pair />);
    screen.getByRole("button", { name: "Drag run-02.mp4" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{Tab}{Tab}{Tab}");
    expect(document.activeElement?.closest('[aria-label="Closed"]')).toBeNull();
    await user.keyboard("{Enter}");
    expect(inserted).toEqual([]);
  });

  it("says why a kind is refused while it is dragged over the list, in words with an icon", () => {
    renderWithStrata(<TwoLists inserted={[]} />);
    const timeline = screen.getByRole("grid", { name: "Timeline" });
    const types = ["strata-kind/text", "strata-item/id"];
    const dataTransfer = { types, items: types.map((type) => ({ kind: "string", type })), dropEffect: "none", effectAllowed: "all", getData: () => "" };
    fireEvent.dragEnter(timeline, { dataTransfer });
    fireEvent.dragOver(timeline, { dataTransfer, clientX: 5, clientY: 5 });
    expect(screen.getByRole("status")).toHaveTextContent("The timeline takes video, not text. Add text from the Titles tab.");
    fireEvent.dragLeave(timeline, { dataTransfer });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
