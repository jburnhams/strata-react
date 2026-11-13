import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, Button, SaveStatus, useAutoSave, useCommands, useHistoryState, useLeaveGuard, type SaveState } from "../../src";
import { renderWithStrata } from "../../src/testing";

function Editor({ limit }: { limit?: number }) {
  const { value, set, history } = useHistoryState({ x: 0, volume: 50 }, { limit });
  const [undo, redo] = history.commands;
  useCommands(history.commands, { platform: "other" });
  return (
    <>
      <output data-testid="x">{value.x}</output>
      <output data-testid="volume">{value.volume}</output>
      <output data-testid="past">{history.past.join("|")}</output>
      <output data-testid="limit">{String(history.atLimit)}</output>
      <button onClick={() => set((v) => ({ ...v, x: v.x + 1 }), "move clip")}>Move</button>
      <button
        onClick={() => {
          const end = history.begin("move clip");
          for (let i = 1; i <= 5; i++) set((v) => ({ ...v, x: v.x + 10 }), "drag");
          end();
        }}
      >
        Drag
      </button>
      <button onClick={() => set((v) => ({ ...v, volume: v.volume + 1 }), "change volume", { key: "volume" })}>Louder</button>
      <Menu label="Edit" trigger={<Button>Edit</Button>} items={[undo, redo]} />
    </>
  );
}

const x = () => screen.getByTestId("x");

describe("useHistory", () => {
  it("undoes a grouped drag in one step, and redo repeats it", async () => {
    renderWithStrata(<Editor />);
    await userEvent.click(screen.getByRole("button", { name: "Drag" }));
    expect(x()).toHaveTextContent("50");
    expect(screen.getByTestId("past")).toHaveTextContent("move clip");
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(x()).toHaveTextContent("0");
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(x()).toHaveTextContent("50");
    await userEvent.keyboard("{Control>}z{/Control}");
    await userEvent.keyboard("{Control>}y{/Control}");
    expect(x()).toHaveTextContent("50");
  });

  it("reads the next step's name from the menu item and the command", async () => {
    renderWithStrata(<Editor />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("menuitem", { name: /^Undo/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Undo move clip/ })).not.toHaveAttribute("aria-disabled");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Undo move clip/ }));
    expect(x()).toHaveTextContent("0");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("menuitem", { name: /Redo move clip/ })).toBeInTheDocument();
  });

  it("merges pushes that share a key into one step, and a new step drops the redo", async () => {
    renderWithStrata(<Editor />);
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Louder" }));
    expect(screen.getByTestId("volume")).toHaveTextContent("53");
    expect(screen.getByTestId("past")).toHaveTextContent(/^change volume$/);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(screen.getByTestId("volume")).toHaveTextContent("50");
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(screen.getByTestId("volume")).toHaveTextContent("50");
  });

  it("drops the oldest step at its limit and says so", async () => {
    renderWithStrata(<Editor limit={2} />);
    expect(screen.getByTestId("limit")).toHaveTextContent("false");
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByTestId("limit")).toHaveTextContent("true");
    await userEvent.keyboard("{Control>}z{/Control}{Control>}z{/Control}{Control>}z{/Control}");
    expect(x()).toHaveTextContent("1");
  });

  it("leaves a text field its own undo", async () => {
    renderWithStrata(
      <>
        <Editor />
        <input aria-label="Name" />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await userEvent.click(screen.getByRole("textbox", { name: "Name" }));
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(x()).toHaveTextContent("1");
  });
});

const failing = (n: number) => {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    if (calls <= n) throw new Error("The connection dropped.");
  });
};

function Doc({ save, delayMs = 10 }: { save: (v: string) => Promise<unknown>; delayMs?: number | null }) {
  const [text, setText] = React.useState("a");
  const { state, saveNow } = useAutoSave({ value: text, save, delayMs });
  useLeaveGuard(state.status !== "saved");
  return (
    <>
      <button onClick={() => setText((t) => t + "b")}>Edit</button>
      <SaveStatus state={state} onRetry={() => void saveNow()} />
      <button onClick={() => void saveNow()}>Save now</button>
    </>
  );
}

const sign = (container: HTMLElement) => container.querySelector("[data-status]")!.getAttribute("data-status");

describe("useAutoSave and SaveStatus", () => {
  it("moves saved, unsaved, saving, saved, and keeps one fixed-width sign", async () => {
    // The wait before an automatic save is a real timer: with a short one, a click that takes longer than it on a loaded
    // machine finds "saving" where it expects "dirty". A wait that never ends in the test, and "Save now", walk the same states.
    let release!: () => void;
    const save = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { container } = render(<Doc save={save} delayMs={60_000} />);
    expect(sign(container)).toBe("saved");
    const width = container.querySelector("[data-status]")!.className;
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(sign(container)).toBe("dirty");
    await userEvent.click(screen.getByRole("button", { name: "Save now" }));
    await vi.waitFor(() => expect(sign(container)).toBe("saving"));
    expect(save).toHaveBeenCalledWith("ab");
    await act(async () => release());
    expect(sign(container)).toBe("saved");
    expect(container.querySelector("[data-status]")!.className).toBe(width);
    expect(container.querySelector("[data-status]")).toHaveClass("w-72");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces a failure once with its reason, retries, and announces the recovery", async () => {
    const save = failing(1);
    const { container } = render(<Doc save={save} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await vi.waitFor(() => expect(sign(container)).toBe("failed"));
    expect(screen.getByRole("status")).toHaveTextContent("Not saved: The connection dropped. Your changes are still here.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(sign(container)).toBe("saved"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("saves edits made during a save afterwards, never two at once", async () => {
    let active = 0;
    let peak = 0;
    const seen: string[] = [];
    const save = vi.fn(async (v: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 200));
      seen.push(v);
      active--;
    });
    const { container } = render(<Doc save={save} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await vi.waitFor(() => expect(sign(container)).toBe("saving"));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await vi.waitFor(() => expect(seen).toEqual(["ab", "abb"]));
    await vi.waitFor(() => expect(sign(container)).toBe("saved"));
    expect(peak).toBe(1);
  });

  it("with no delay it stays unsaved until told to save", async () => {
    const save = vi.fn(async () => undefined);
    const { container } = render(<Doc save={save} delayMs={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await new Promise((r) => setTimeout(r, 40));
    expect(sign(container)).toBe("dirty");
    await userEvent.click(screen.getByRole("button", { name: "Save now" }));
    await vi.waitFor(() => expect(sign(container)).toBe("saved"));
  });

  it("asks before the page closes only while there is something unsaved", async () => {
    const { container } = render(<Doc save={async () => undefined} delayMs={null} />);
    const fire = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(fire()).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(fire()).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Save now" }));
    await vi.waitFor(() => expect(sign(container)).toBe("saved"));
    expect(fire()).toBe(false);
  });

  it("returns to saved when the document is edited back to what was saved", async () => {
    function Toggle() {
      const [on, setOn] = React.useState(false);
      const { state } = useAutoSave({ value: on, save: async () => undefined, delayMs: null });
      return (
        <>
          <button onClick={() => setOn((v) => !v)}>Flip</button>
          <SaveStatus state={state} onRetry={() => undefined} />
        </>
      );
    }
    const { container } = render(<Toggle />);
    await userEvent.click(screen.getByRole("button", { name: "Flip" }));
    expect(sign(container)).toBe("dirty");
    await userEvent.click(screen.getByRole("button", { name: "Flip" }));
    expect(sign(container)).toBe("saved");
  });

  it("can save again after a saver that throws before it awaits", async () => {
    let calls = 0;
    const save = vi.fn((): Promise<unknown> | void => {
      calls++;
      if (calls === 1) throw new Error("No connection.");
    });
    const { container } = render(<Doc save={save as (v: string) => Promise<unknown>} delayMs={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save now" }));
    await vi.waitFor(() => expect(sign(container)).toBe("failed"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(sign(container)).toBe("saved"));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("shows each state's word", () => {
    const states: SaveState[] = [{ status: "saved", at: new Date("2026-11-12T10:42:00Z") }, { status: "saving" }, { status: "dirty" }, { status: "failed", reason: "Disk is full." }];
    render(<>{states.map((s) => <SaveStatus key={s.status} state={s} onRetry={() => undefined} />)}</>);
    const saved = document.querySelector('[data-status="saved"]') as HTMLElement;
    expect(saved).toHaveTextContent(/Saved \d\d:\d\d/);
    expect(screen.getByText("Not saved: Disk is full.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
