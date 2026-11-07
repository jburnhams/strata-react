import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveList, KeysLegend, useActiveItem, useHotkeys, type Shortcut } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { bookingsEmpty } from "../../stories/mocks/handlers";
import { ReviewBookingsScreen } from "../../stories/screens/review-bookings";
import { server } from "../utils/server";

describe("useHotkeys", () => {
  function Keys({ run, repeat }: { run: () => void; repeat?: boolean }) {
    useHotkeys([{ keys: ["a"], label: "Approve", run, repeat }]);
    return (
      <>
        <input aria-label="Note" />
        <textarea aria-label="Reason" />
        <select aria-label="Kiln">
          <option>1</option>
        </select>
        <div contentEditable aria-label="Rich" role="textbox" suppressContentEditableWarning />
        <input type="checkbox" aria-label="Select" />
      </>
    );
  }

  it("runs on its key, and not while the person is typing in a field", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Keys run={run} />);
    await user.keyboard("a");
    expect(run).toHaveBeenCalledOnce();
    for (const name of ["Note", "Reason", "Rich"]) {
      await user.click(screen.getByRole("textbox", { name }));
      await user.keyboard("a");
    }
    screen.getByRole("combobox", { name: "Kiln" }).focus();
    await user.keyboard("a");
    expect(run).toHaveBeenCalledOnce();
    // A checkbox is not typing: the shortcut still works from it.
    await user.click(screen.getByRole("checkbox", { name: "Select" }));
    await user.keyboard("a");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("leaves chords to the browser, and Shift makes a different key", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Keys run={run} />);
    await user.keyboard("{Control>}a{/Control}{Meta>}a{/Meta}{Alt>}a{/Alt}A");
    expect(run).not.toHaveBeenCalled();
  });

  it("does not repeat an answer while the key is held, unless asked to", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const { unmount } = render(<Keys run={run} />);
    await user.keyboard("{a>3/}");
    expect(run).toHaveBeenCalledOnce();
    unmount();
    const moving = vi.fn();
    render(<Keys run={moving} repeat />);
    await user.keyboard("{a>3/}");
    expect(moving).toHaveBeenCalledTimes(3);
  });

  it("ignores a disabled shortcut", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    function Off() {
      useHotkeys([{ keys: ["z"], label: "Undo", run, disabled: true }]);
      return null;
    }
    render(<Off />);
    await user.keyboard("z");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("KeysLegend", () => {
  it("lists each shortcut as keys and what they do", () => {
    const shortcuts: Pick<Shortcut, "keys" | "label">[] = [
      { keys: ["j", "ArrowDown"], label: "Next booking" },
      { keys: ["a"], label: "Approve" },
    ];
    render(<KeysLegend shortcuts={shortcuts} />);
    const legend = screen.getByLabelText("Keyboard shortcuts");
    expect(legend.tagName).toBe("DL");
    const terms = within(legend).getAllByRole("term");
    expect(terms[0]).toHaveTextContent("j or ↓");
    expect(within(legend).getAllByRole("definition").map((d) => d.textContent)).toEqual(["Next booking", "Approve"]);
  });
});

type Item = { id: string; name: string };
const five: Item[] = ["Priya", "Tom", "Aoife", "Sam", "Marta"].map((name, i) => ({ id: String(i), name }));

function Queue({ initial }: { initial?: string }) {
  const [items, setItems] = React.useState(five);
  const [removed, setRemoved] = React.useState<Item | null>(null);
  const active = useActiveItem(items, (i) => i.id, { initial, noun: "person" });
  const remove = (item: Item | null) => {
    if (!item) return;
    setRemoved(item);
    setItems((xs) => xs.filter((x) => x.id !== item.id));
  };
  useHotkeys([
    ...active.shortcuts,
    { keys: ["a"], label: "Answer", run: () => remove(active.activeItem) },
    { keys: ["z"], label: "Undo", run: () => removed && setItems(five.filter((x) => items.includes(x) || x === removed)) },
  ]);
  return (
    <>
      <input aria-label="Filter" />
      <ActiveList label="People" active={active} empty={<p>No one left</p>}>
        {(item) => (
          <span>
            {item.name} <button onClick={() => remove(item)}>Answer {item.name}</button>
          </span>
        )}
      </ActiveList>
    </>
  );
}

const current = () => screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "true");

describe("useActiveItem and ActiveList", () => {
  it("starts on the first item, a single tab stop marked aria-current", () => {
    render(<Queue />);
    expect(current()).toHaveTextContent("Priya");
    expect(screen.getAllByRole("listitem").map((li) => li.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("j and k move the active item and focus, and stop at the ends", async () => {
    const user = userEvent.setup();
    render(<Queue />);
    await user.keyboard("jj");
    expect(current()).toHaveTextContent("Aoife");
    expect(current()).toHaveFocus();
    await user.keyboard("kkkk");
    expect(current()).toHaveTextContent("Priya");
    await user.keyboard("jjjjjjj");
    expect(current()).toHaveTextContent("Marta");
  });

  it("the arrow keys, Home and End move inside the list", async () => {
    const user = userEvent.setup();
    render(<Queue />);
    await user.tab(); // the filter
    await user.tab(); // the active item
    expect(current()).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(current()).toHaveTextContent("Aoife");
    await user.keyboard("{End}");
    expect(current()).toHaveTextContent("Marta");
    await user.keyboard("{Home}");
    expect(current()).toHaveTextContent("Priya");
  });

  it("does not move while the person types j into a field", async () => {
    const user = userEvent.setup();
    render(<Queue />);
    await user.click(screen.getByRole("textbox", { name: "Filter" }));
    await user.keyboard("jj");
    expect(current()).toHaveTextContent("Priya");
    expect(screen.getByRole("textbox", { name: "Filter" })).toHaveFocus();
  });

  it("answering the active item moves to the next one and keeps focus in the list", async () => {
    const user = userEvent.setup();
    render(<Queue />);
    await user.keyboard("ja");
    expect(screen.queryByText("Tom")).toBeNull();
    expect(current()).toHaveTextContent("Aoife");
    expect(current()).toHaveFocus();
    // Clicking a row's own button: the row goes, focus lands on the one that took its place.
    await user.click(screen.getByRole("button", { name: "Answer Aoife" }));
    expect(current()).toHaveTextContent("Sam");
    expect(current()).toHaveFocus();
  });

  it("answering the last item moves back to the one before it", async () => {
    const user = userEvent.setup();
    render(<Queue initial="4" />);
    await user.keyboard("a");
    expect(current()).toHaveTextContent("Sam");
  });

  it("an undo makes the restored item active again", async () => {
    const user = userEvent.setup();
    render(<Queue />);
    await user.keyboard("jaj");
    expect(current()).toHaveTextContent("Sam");
    await user.keyboard("z");
    // Moving on after the answer chose Sam, so Sam stays active; Tom is back in place.
    expect(screen.getAllByRole("listitem").map((li) => li.textContent?.split(" ")[0])).toEqual(["Priya", "Tom", "Aoife", "Sam", "Marta"]);
    expect(current()).toHaveTextContent("Sam");
  });

  it("does not take focus from elsewhere on the page when the list changes", async () => {
    const user = userEvent.setup();
    render(<Queue />);
    await user.click(screen.getByRole("textbox", { name: "Filter" }));
    screen.getByRole("button", { name: "Answer Priya" }).click(); // a programmatic removal
    expect(await screen.findByText("Tom")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Filter" })).toHaveFocus();
  });

  it("shows its empty state when the queue is clear", async () => {
    const user = userEvent.setup();
    render(<Queue />);
    await user.keyboard("aaaaa");
    expect(screen.getByText("No one left")).toBeInTheDocument();
  });
});

describe("Bookings to check (the whole pattern)", () => {
  it("approves from the keyboard, offers Undo, and the legend lists the same keys", async () => {
    const user = userEvent.setup();
    renderWithStrata(<ReviewBookingsScreen />);
    expect(await screen.findByRole("list", { name: "Bookings to check" })).toBeInTheDocument();
    const legend = screen.getByLabelText("Keyboard shortcuts");
    expect(within(legend).getAllByRole("definition").map((d) => d.textContent)).toEqual([
      "Next booking",
      "Previous booking",
      "Approve",
      "Return to member",
      "Undo",
    ]);
    await user.keyboard("a");
    expect(screen.getByText(/^Approved Priya Natarajan's 6\spieces\.$/)).toBeInTheDocument();
    expect(current()).toHaveTextContent("Tom Ellery");
    await user.keyboard("z");
    expect(current()).toHaveTextContent("Priya Natarajan");
  });

  it("says every booking is checked when the server has none", async () => {
    server.use(bookingsEmpty);
    renderWithStrata(<ReviewBookingsScreen />);
    expect(await screen.findByText("Every booking is checked")).toBeInTheDocument();
    expect(screen.queryByLabelText("Keyboard shortcuts")).toBeNull();
  });
});
