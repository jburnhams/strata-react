import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Button,
  CommandLegend,
  CommandMenu,
  ContextMenu,
  Menu,
  commandShortcut,
  detectPlatform,
  formatChord,
  isReservedChord,
  matchesChord,
  useCommands,
  type Command,
  type MenuEntry,
} from "../../src";

const key = (init: KeyboardEventInit & { key: string }) => init;

describe("chords", () => {
  it("shows one chord per platform", () => {
    expect(formatChord("Mod+Z", "mac")).toBe("⌘Z");
    expect(formatChord("Mod+Z", "other")).toBe("Ctrl+Z");
    expect(formatChord("Mod+Shift+Z", "mac")).toBe("⇧⌘Z");
    expect(formatChord("Mod+Shift+Z", "other")).toBe("Ctrl+Shift+Z");
    expect(formatChord("Alt+ArrowLeft", "other")).toBe("Alt+←");
    expect(formatChord("Delete", "mac")).toBe("⌦");
    expect(formatChord("Delete", "other")).toBe("Delete");
    expect(formatChord("Mod++", "other")).toBe("Ctrl++");
  });

  it("matches exactly on modifiers: Undo is not Redo", () => {
    const undo = (e: KeyboardEventInit & { key: string }) => matchesChord({ code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...e }, "Mod+Z", "other");
    expect(undo(key({ key: "z", ctrlKey: true }))).toBe(true);
    expect(undo(key({ key: "Z", ctrlKey: true, shiftKey: true }))).toBe(false); // Shift held: that is Redo
    expect(undo(key({ key: "z" }))).toBe(false);
    expect(undo(key({ key: "z", metaKey: true }))).toBe(false); // Meta is not Mod on other platforms
  });

  it("matches Mod to Meta on macOS and Alt letters by physical key", () => {
    const base = { code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(matchesChord({ ...base, key: "z", metaKey: true }, "Mod+Z", "mac")).toBe(true);
    expect(matchesChord({ ...base, key: "Ω", code: "KeyZ", altKey: true }, "Alt+Z", "mac")).toBe(true);
  });

  it("ignores Shift for a symbol key such as ?", () => {
    const base = { code: "", ctrlKey: false, metaKey: false, altKey: false };
    expect(matchesChord({ ...base, key: "?", shiftKey: true }, "?", "other")).toBe(true);
  });

  it("knows which chords the browser keeps", () => {
    expect(isReservedChord("Mod+S", "other")).toBe(true);
    expect(isReservedChord("Mod+Z", "other")).toBe(false);
    expect(isReservedChord("Mod+s", "mac")).toBe(true);
  });

  it("detects a platform without throwing", () => {
    expect(["mac", "other"]).toContain(detectPlatform());
  });
});

// One list of commands, as an editor would have it, used by the key handler, a menu, the legend and the command menu.
function editor(over: Partial<Record<string, Partial<Command>>> = {}) {
  const log: string[] = [];
  const cmd = (id: string, label: Command["label"], extra: Partial<Command> = {}): Command => ({
    id,
    label,
    run: () => void log.push(id),
    ...extra,
    ...over[id],
  });
  const commands: Command[] = [
    cmd("undo", "Undo move clip", { keys: ["Mod+Z"] }),
    cmd("redo", "Redo", { keys: ["Mod+Shift+Z"], disabled: "Nothing to redo" }),
    cmd("split", "Split clip", { keys: ["s"] }),
    cmd("save", "Save project", { keys: ["Mod+S"], claim: true }),
    cmd("delete", "Delete clip", { keys: ["Delete"], destructive: true }),
  ];
  return { commands, log };
}

function Keys({ commands, platform = "other" as const }: { commands: Command[]; platform?: "mac" | "other" }) {
  useCommands(commands, { platform });
  return <input aria-label="Name" />;
}

describe("useCommands", () => {
  it("runs a chord once, and a disabled command's chord does nothing", async () => {
    const user = userEvent.setup();
    const { commands, log } = editor();
    render(<Keys commands={commands} />);
    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}"); // redo is disabled
    expect(log).toEqual(["undo"]);
  });

  it("never fires while typing in a field, unless the command says inFields", async () => {
    const user = userEvent.setup();
    const { commands, log } = editor({ undo: { inFields: false }, split: { inFields: false } });
    const { rerender } = render(<Keys commands={commands} />);
    await user.click(screen.getByRole("textbox", { name: "Name" }));
    await user.keyboard("s{Control>}z{/Control}");
    expect(log).toEqual([]);
    const second = editor({ undo: { inFields: true } });
    rerender(<Keys commands={second.commands} />);
    await user.keyboard("{Control>}z{/Control}");
    expect(second.log).toEqual(["undo"]);
  });

  it("leaves a browser chord alone unless the command claims it", async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { commands, log } = editor({ save: { claim: false } });
    render(<Keys commands={commands} />);
    await user.keyboard("{Control>}s{/Control}");
    expect(log).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("add `claim: true`"));
    warn.mockRestore();
    const claimed = editor();
    render(<Keys commands={claimed.commands} />);
    await user.keyboard("{Control>}s{/Control}");
    expect(claimed.log).toEqual(["save"]);
  });

  it("does not run during IME composition or on a held key", () => {
    const { commands, log } = editor();
    render(<Keys commands={commands} />);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, isComposing: true });
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, repeat: true });
    expect(log).toEqual([]);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(log).toEqual(["undo"]);
  });

  it("uses Meta as Mod on macOS", () => {
    const { commands, log } = editor();
    render(<Keys commands={commands} platform="mac" />);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(log).toEqual([]);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(log).toEqual(["undo"]);
  });

  it("warns when two commands share a chord", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const a: Command = { id: "a", label: "A", run: () => undefined, keys: ["x"] };
    const b: Command = { id: "b", label: "B", run: () => undefined, keys: ["x"] };
    render(<Keys commands={[a, b]} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('both "a" and "b"'));
    warn.mockRestore();
  });
});

describe("one list, every surface", () => {
  const entries = (commands: Command[]): MenuEntry[] => [commands[0], commands[1], "separator", commands[2], commands[4]];

  function Surfaces({ commands, platform = "other" as const }: { commands: Command[]; platform?: "mac" | "other" }) {
    useCommands(commands, { platform });
    return (
      <>
        <Menu label="Edit" trigger={<Button>Edit</Button>} items={entries(commands)} platform={platform} />
        <CommandLegend commands={commands} platform={platform} />
      </>
    );
  }

  it("changing a label or its keys changes the menu, the legend and the command menu", async () => {
    const user = userEvent.setup();
    let name = "Undo move clip";
    const { commands } = editor({ undo: { label: () => name } });
    const { rerender } = render(
      <>
        <Surfaces commands={commands} />
        <CommandMenu commands={commands} platform="other" />
      </>,
    );
    expect(screen.getByText("Undo move clip")).toBeInTheDocument(); // the legend
    name = "Undo trim clip";
    const next = editor({ undo: { label: () => name, keys: ["Mod+Y"] } });
    rerender(
      <>
        <Surfaces commands={next.commands} />
        <CommandMenu commands={next.commands} platform="other" />
      </>,
    );
    expect(screen.getByText("Undo trim clip")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Y")).toBeInTheDocument(); // legend
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const menu = await screen.findByRole("menu", { name: "Edit" });
    const item = within(menu).getByRole("menuitem", { name: /Undo trim clip/ });
    expect(item).toHaveTextContent("Ctrl+Y");
    await user.keyboard("{Escape}");
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Search commands" });
    expect(within(palette).getByRole("menuitem", { name: /Undo trim clip/ })).toBeInTheDocument();
  });

  it("shows the same shortcut text per platform in the menu", async () => {
    const user = userEvent.setup();
    const { commands } = editor();
    render(<Surfaces commands={commands} platform="mac" />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(within(await screen.findByRole("menu")).getByRole("menuitem", { name: /Undo move clip/ })).toHaveTextContent("Command Z");
    expect(commandShortcut(commands[1], "mac")).toBe("⇧⌘Z");
  });
});

describe("Menu", () => {
  it("opens by keyboard, runs an item with Enter, returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    const { commands, log } = editor();
    render(<Menu label="Edit" trigger={<Button>Edit</Button>} items={[commands[0], commands[2]]} platform="other" />);
    const trigger = screen.getByRole("button", { name: "Edit" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "Edit" });
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(log.length).toBe(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("opens by pointer, supports Home, End and typeahead", async () => {
    const user = userEvent.setup();
    const { commands } = editor();
    render(<Menu label="Edit" trigger={<Button>Edit</Button>} items={[commands[0], commands[2], commands[4]]} platform="other" />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const menu = await screen.findByRole("menu");
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: /Delete clip/ })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: /Undo move clip/ })).toHaveFocus();
    await user.keyboard("s");
    expect(screen.getByRole("menuitem", { name: /Split clip/ })).toHaveFocus();
  });

  it("says why an item is unavailable and does not run it", async () => {
    const user = userEvent.setup();
    const { commands, log } = editor();
    render(<Menu label="Edit" trigger={<Button>Edit</Button>} items={[commands[1]]} platform="other" />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const item = await screen.findByRole("menuitem", { name: /Redo/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveTextContent("Nothing to redo");
    await user.click(item);
    expect(log).toEqual([]);
  });

  it("marks a destructive item with an icon as well as colour", async () => {
    const user = userEvent.setup();
    const { commands } = editor();
    render(<Menu label="Clip" trigger={<Button>Clip</Button>} items={[commands[4]]} platform="other" />);
    await user.click(screen.getByRole("button", { name: "Clip" }));
    const item = await screen.findByRole("menuitem", { name: /Delete clip/ });
    expect(item.querySelector("svg")).not.toBeNull();
    expect(item.className).toContain("text-danger");
  });

  it("draws groups with a heading, separators, and checkable items that report their state", async () => {
    const user = userEvent.setup();
    const toggled: string[] = [];
    const view = (id: string, label: string, checked: boolean): Command => ({ id, label, checked, run: () => void toggled.push(id) });
    render(
      <Menu
        label="View"
        trigger={<Button>View</Button>}
        platform="other"
        items={[
          { group: "Overlays", items: [view("grid", "Show grid", true), view("safe", "Show safe areas", false)] },
          "separator",
          { id: "fit", label: "Fit to window", run: () => undefined },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "View" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Show grid" })).toBeChecked();
    expect(screen.getByRole("menuitemcheckbox", { name: "Show safe areas" })).not.toBeChecked();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByText("Overlays")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Show safe areas" }));
    expect(toggled).toEqual(["safe"]);
  });

  it("opens a submenu with the arrow key", async () => {
    const user = userEvent.setup();
    const ran: string[] = [];
    render(
      <Menu
        label="File"
        trigger={<Button>File</Button>}
        platform="other"
        items={[{ submenu: "Export", items: [{ id: "mp4", label: "As video", run: () => void ran.push("mp4") }] }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "File" }));
    const parent = await screen.findByRole("menuitem", { name: /Export/ });
    parent.focus();
    await user.keyboard("{ArrowRight}");
    const inner = await screen.findByRole("menuitem", { name: /As video/ });
    await user.click(inner);
    expect(ran).toEqual(["mp4"]);
  });
});

describe("ContextMenu", () => {
  function Clip({ commands }: { commands: Command[] }) {
    return (
      <ContextMenu label="Clip actions" items={[commands[2], commands[4]]} platform="other">
        <div role="button" tabIndex={0} aria-label="Clip run.mp4">run.mp4</div>
      </ContextMenu>
    );
  }

  it("opens on right-click with the same items", async () => {
    const user = userEvent.setup();
    const { commands, log } = editor();
    render(<Clip commands={commands} />);
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Clip run.mp4" }) });
    const menu = await screen.findByRole("menu", { name: "Clip actions" });
    await user.click(within(menu).getByRole("menuitem", { name: /Split clip/ }));
    expect(log).toEqual(["split"]);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("opens from the keyboard with the context-menu key and with Shift+F10", async () => {
    const user = userEvent.setup();
    const { commands } = editor();
    render(<Clip commands={commands} />);
    screen.getByRole("button", { name: "Clip run.mp4" }).focus();
    await user.keyboard("{ContextMenu}");
    await screen.findByRole("menu", { name: "Clip actions" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    screen.getByRole("button", { name: "Clip run.mp4" }).focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await screen.findByRole("menu", { name: "Clip actions" });
  });
});

describe("CommandMenu", () => {
  it("opens on its chord, filters as you type, runs the chosen command and closes", async () => {
    const user = userEvent.setup();
    const { commands, log } = editor();
    render(<CommandMenu commands={commands} platform="other" />);
    await user.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Search commands" });
    await user.type(within(dialog).getByRole("searchbox", { name: "Search commands" }), "split");
    const items = within(dialog).getAllByRole("menuitem");
    expect(items).toHaveLength(1);
    await user.click(items[0]);
    expect(log).toEqual(["split"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("ignores a held shortcut: auto-repeat does not toggle it shut", async () => {
    const user = userEvent.setup();
    const { commands } = editor();
    render(<CommandMenu commands={commands} platform="other" />);
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Search commands" });
    // dispatched on the window: the dialog's search field would otherwise be the target
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, repeat: true }));
    expect(screen.getByRole("dialog", { name: "Search commands" })).toBeInTheDocument();
  });

  it("says when nothing matches, and shows an unavailable command with its reason", async () => {
    const user = userEvent.setup();
    const { commands } = editor();
    render(<CommandMenu commands={commands} open platform="other" />);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("menuitem", { name: /Redo/ })).toHaveTextContent("Nothing to redo");
    await user.type(within(dialog).getByRole("searchbox"), "zzzz");
    expect(await within(dialog).findByText("No command matches.")).toBeInTheDocument();
  });

  it("is controlled and closes on Escape", async () => {
    const user = userEvent.setup();
    const { commands } = editor();
    function Harness() {
      const [open, setOpen] = useState(true);
      return <CommandMenu commands={commands} open={open} onOpenChange={setOpen} shortcut={null} platform="other" />;
    }
    render(<Harness />);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

afterEach(() => vi.restoreAllMocks());
