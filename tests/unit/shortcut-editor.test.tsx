import { describe, expect, it, vi } from "vite-plus/test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeysLegend, ShortcutEditor, checkKey, useHotkeys, useRebindableShortcuts, type Shortcut } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #361: rebind the keys useHotkeys runs and KeysLegend shows, from one list.

const jump = vi.fn();
const fire = vi.fn();
const defaults = (): Shortcut[] => [
  { id: "jump", keys: ["j", "ArrowDown"], label: "Jump", run: jump },
  { id: "fire", keys: ["f"], label: "Fire", run: fire },
  { id: "off", keys: ["x"], label: "Hidden", run: () => {}, disabled: true },
];
const stable = defaults();

function Host({ storageKey, onChange }: { storageKey?: string; onChange?: (o: Record<string, string[]>) => void }) {
  const rebinding = useRebindableShortcuts(stable, { storageKey, onChange });
  useHotkeys(rebinding.shortcuts);
  return (
    <>
      <KeysLegend shortcuts={rebinding.shortcuts} />
      <ShortcutEditor rebinding={rebinding} />
      <button>Elsewhere</button>
    </>
  );
}
const change = (name: string) => userEvent.click(screen.getByRole("button", { name: `Change ${name}` }));

describe("checkKey", () => {
  it("refuses a chord, naming a browser one, and Tab; names a conflict; takes a free key", () => {
    const list = defaults();
    const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(checkKey({ ...base, key: "w", ctrlKey: true }, "fire", list)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("belongs to the browser"),
    });
    expect(checkKey({ ...base, key: "q", altKey: true }, "fire", list)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("single keys"),
    });
    expect(checkKey({ ...base, key: "Tab" }, "fire", list)).toMatchObject({ ok: false });
    expect(checkKey({ ...base, key: "j" }, "fire", list)).toMatchObject({ ok: "conflict" });
    expect(checkKey({ ...base, key: "x" }, "fire", list)).toEqual({ ok: true, key: "x" }); // a disabled shortcut does not conflict
    expect(checkKey({ ...base, key: "?", shiftKey: true }, "fire", list)).toEqual({
      ok: true,
      key: "?",
    });
  });
});

describe("ShortcutEditor", () => {
  it("lists each action with its keys", () => {
    renderWithStrata(<Host />);
    expect(screen.getByRole("button", { name: "Change Jump" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Fire" })).toBeInTheDocument();
  });

  it("records the next key: the action runs on it, the legend shows it and the old key stops", async () => {
    jump.mockClear();
    renderWithStrata(<Host />);
    await change("Fire");
    const recording = screen.getByRole("button", { name: /Press a key for Fire/ });
    expect(recording).toHaveFocus();
    await userEvent.keyboard("g");
    expect(screen.getByRole("status")).toHaveTextContent("Fire is now g.");
    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    await userEvent.keyboard("g");
    expect(fire).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("f");
    expect(fire).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dl")).toHaveTextContent("Fire");
    expect(document.querySelector("dl kbd:last-of-type")).toBeTruthy();
  });

  it("a key pressed while recording does not run the page's own shortcut", async () => {
    jump.mockClear();
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.keyboard("j"); // Jump's key: a conflict to ask about, not a jump
    expect(jump).not.toHaveBeenCalled();
    expect(screen.getByText("Already “Jump”: swap?")).toBeInTheDocument();
  });

  it("Escape cancels and keeps the key", async () => {
    fire.mockClear();
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Change Fire" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Kept f for Fire.");
  });

  it("refuses Ctrl chords with the reason and keeps recording", async () => {
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.keyboard("{Control>}w{/Control}");
    expect(screen.getByRole("status")).toHaveTextContent("Ctrl+W belongs to the browser.");
    expect(screen.getByRole("button", { name: /Press a key for Fire/ })).toBeInTheDocument();
  });

  it("Tab leaves the recording and lets focus move", async () => {
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Change Fire" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Press a key/ })).toBeNull();
  });

  it("waits for the key a modifier goes with", async () => {
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.keyboard("{Shift}");
    expect(screen.getByRole("button", { name: /Press a key for Fire/ })).toBeInTheDocument();
    await userEvent.keyboard("{Shift>}?{/Shift}");
    expect(screen.getByRole("status")).toHaveTextContent("Fire is now ?.");
  });

  it("names a conflict and swaps: the other action gets the key this one gave up", async () => {
    jump.mockClear();
    fire.mockClear();
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.keyboard("j");
    await userEvent.click(screen.getByRole("button", { name: "Swap" }));
    expect(screen.getByRole("status")).toHaveTextContent("Fire is now j, and Jump has f.");
    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    await userEvent.keyboard("j");
    expect(fire).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("f");
    expect(jump).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{ArrowDown}"); // Jump's alternative stays
    expect(jump).toHaveBeenCalledTimes(2);
  });

  it("keeps things as they were when the swap is declined", async () => {
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.keyboard("j");
    await userEvent.click(screen.getByRole("button", { name: "Keep as it was" }));
    expect(screen.queryByRole("button", { name: "Reset Fire" })).toBeNull();
  });

  it("resets one action and all of them", async () => {
    renderWithStrata(<Host />);
    await change("Fire");
    await userEvent.keyboard("g");
    await change("Jump");
    await userEvent.keyboard("k");
    await userEvent.click(screen.getByRole("button", { name: "Reset Fire" }));
    expect(screen.queryByRole("button", { name: "Reset Fire" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset Jump" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(screen.queryByRole("button", { name: /^Reset (Fire|Jump)$/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Every shortcut is back to its default.");
  });

  it("hands the overrides to onChange and keeps them under the storage key", async () => {
    window.localStorage.removeItem("keys-test");
    const onChange = vi.fn();
    const first = renderWithStrata(<Host storageKey="keys-test" onChange={onChange} />);
    await change("Fire");
    await userEvent.keyboard("g");
    expect(onChange).toHaveBeenLastCalledWith({ fire: ["g"] });
    first.unmount();
    renderWithStrata(<Host storageKey="keys-test" />);
    expect(screen.getByRole("button", { name: "Reset Fire" })).toBeInTheDocument();
  });

  it("ignores a stored value that is not a map of keys", () => {
    window.localStorage.setItem("keys-bad", JSON.stringify({ fire: "g", jump: [] }));
    renderWithStrata(<Host storageKey="keys-bad" />);
    expect(screen.queryByRole("button", { name: /^Reset/ })).toBeNull();
  });
});
