import { describe, expect, it, vi } from "vite-plus/test";
import * as React from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Console, type ConsoleLine } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #369: a log with levels over a command line with history and Tab completion.

const COMMANDS = ["map", "maplist", "quit", "echo"];
function Host({
  initial = [],
  historyKey,
  onRun,
  lineHeight,
}: {
  initial?: ConsoleLine[];
  historyKey?: string;
  onRun?: (c: string) => void;
  lineHeight?: number;
}) {
  const [lines, setLines] = React.useState<ConsoleLine[]>(initial);
  return (
    <Console
      label="Game console"
      lines={lines}
      historyKey={historyKey}
      lineHeight={lineHeight}
      complete={(text) => COMMANDS.filter((c) => c.startsWith(text))}
      onCommand={(text) => {
        onRun?.(text);
        setLines((l) => [
          ...l,
          { id: l.length, level: "echo", text },
          { id: l.length + 1, text: `ran ${text}` },
        ]);
      }}
    />
  );
}
const input = () => screen.getByRole("textbox", { name: "Command" });

describe("Console", () => {
  it("is a polite log region above a command line", () => {
    renderWithStrata(<Host initial={[{ id: 1, text: "Quake 2 ready" }]} />);
    const log = screen.getByRole("log", { name: "Game console: log" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(within(log).getByText("Quake 2 ready")).toBeInTheDocument();
  });

  it("says each level in a word, never by colour alone, and marks an echo as a command", () => {
    renderWithStrata(
      <Host
        initial={[
          { id: 1, level: "warning", text: "low memory" },
          { id: 2, level: "error", text: "no such map" },
          { id: 3, level: "echo", text: "map e1m1" },
        ]}
      />,
    );
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Command:")).toBeInTheDocument();
  });

  it("runs the trimmed command on Enter and on Run, then clears the line; an empty line runs nothing", async () => {
    const onRun = vi.fn();
    renderWithStrata(<Host onRun={onRun} />);
    await userEvent.type(input(), "  map e1m1  {Enter}");
    expect(onRun).toHaveBeenCalledWith("map e1m1");
    expect(input()).toHaveValue("");
    expect(await screen.findByText("ran map e1m1")).toBeInTheDocument();
    await userEvent.type(input(), "quit");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenLastCalledWith("quit");
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenCalledTimes(2);
  });

  it("walks the history with Up and Down and brings back what was being typed", async () => {
    renderWithStrata(<Host />);
    await userEvent.type(input(), "one{Enter}two{Enter}three");
    await userEvent.keyboard("{ArrowUp}");
    expect(input()).toHaveValue("two");
    await userEvent.keyboard("{ArrowUp}");
    expect(input()).toHaveValue("one");
    await userEvent.keyboard("{ArrowUp}");
    expect(input()).toHaveValue("one");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(input()).toHaveValue("three");
  });

  it("does not store a repeat of the last command twice", async () => {
    renderWithStrata(<Host />);
    await userEvent.type(input(), "a{Enter}a{Enter}b{Enter}");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(input()).toHaveValue("a");
    await userEvent.keyboard("{ArrowUp}");
    expect(input()).toHaveValue("a");
  });

  it("keeps the history under historyKey for the next visit", async () => {
    window.localStorage.removeItem("console-test");
    const first = renderWithStrata(<Host historyKey="console-test" />);
    await userEvent.type(input(), "echo hi{Enter}");
    first.unmount();
    renderWithStrata(<Host historyKey="console-test" />);
    await userEvent.click(input());
    await userEvent.keyboard("{ArrowUp}");
    expect(input()).toHaveValue("echo hi");
  });

  it("completes with Tab: one match fills the line, several fill their common start and are listed", async () => {
    renderWithStrata(<Host />);
    await userEvent.type(input(), "qu{Tab}");
    expect(input()).toHaveValue("quit");
    await userEvent.clear(input());
    await userEvent.type(input(), "ma{Tab}");
    expect(input()).toHaveValue("map");
    expect(screen.getByText("2 matches: map, maplist")).toBeInTheDocument();
  });

  it("lets Tab move on when nothing completes", async () => {
    renderWithStrata(<Host />);
    await userEvent.type(input(), "zz");
    await userEvent.tab();
    expect(input()).not.toHaveFocus();
  });

  it("draws a long session (virtualised) without every line in the DOM", () => {
    const lines = Array.from({ length: 1000 }, (_, id) => ({ id, text: `line ${id}` }));
    renderWithStrata(<Host initial={lines} lineHeight={24} />);
    expect(screen.getAllByRole("row").length).toBeLessThan(200);
  });
});
