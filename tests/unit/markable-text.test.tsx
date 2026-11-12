import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Check, X } from "lucide-react";
import { Mark, MarkableText, MarkSummary, countMarks, rangeBetween, stepId, type MarkKind } from "../../src";
import { renderWithStrata } from "../../src/testing";

const kinds: MarkKind[] = [
  { key: "use", label: "Must use", tone: "success", pattern: "solid", icon: Check, keys: ["g"] },
  { key: "never", label: "Never use", tone: "danger", pattern: "dashed", icon: X, keys: ["r"] },
];
const words = ["The", "kiln", "ran", "hot", "all", "night"];
const ids = words.map((_, i) => `w${i}`);

function Demo({ onMark, initial = {}, rows = false }: { onMark?: (ids: readonly string[], kind: string | null) => void; initial?: Record<string, string>; rows?: boolean }) {
  const [marks, setMarks] = React.useState<Record<string, string | undefined>>(initial);
  // Rows: only the first and last words are mounted, as a virtualised list would leave them.
  const shown = rows ? [0, 5] : ids.map((_, i) => i);
  return (
    <MarkableText label="Transcript" ids={ids} marks={marks} kinds={kinds} clearKeys={["w"]} onMark={(sel, k) => { onMark?.(sel, k); setMarks((m) => Object.fromEntries([...Object.entries(m), ...sel.map((id) => [id, k ?? undefined])])); }}>
      <p>{shown.map((i) => <React.Fragment key={i}><Mark id={ids[i]!}>{words[i]}</Mark>{" "}</React.Fragment>)}</p>
    </MarkableText>
  );
}

const word = (t: string) => screen.getByText(t, { selector: "[data-mark-id]" });

describe("mark helpers", () => {
  it("ranges in document order either way round, counts kinds, steps and holds at the ends", () => {
    expect(rangeBetween(ids, "w3", "w1")).toEqual(["w1", "w2", "w3"]);
    expect(rangeBetween(ids, "w1", "nope")).toEqual([]);
    expect(rangeBetween(ids, null, "w1")).toEqual([]);
    expect(countMarks({ a: "x", b: "x", c: "y", d: undefined })).toEqual({ x: 2, y: 1 });
    expect(stepId(ids, "w0", -1)).toBe("w0");
    expect(stepId(ids, "w5", 1)).toBe("w5");
    expect(stepId(ids, null, 1)).toBe("w0");
    expect(stepId(ids, null, -1)).toBe("w5");
  });
});

describe("MarkableText", () => {
  it("selects by drag across words and says how many", () => {
    renderWithStrata(<Demo />);
    fireEvent.pointerDown(word("kiln"), { button: 0 });
    fireEvent.pointerEnter(word("ran"));
    fireEvent.pointerEnter(word("hot"));
    fireEvent.pointerUp(window);
    expect(["kiln", "ran", "hot"].every((t) => word(t).hasAttribute("data-selected"))).toBe(true);
    expect(word("night")).not.toHaveAttribute("data-selected");
    expect(screen.getByRole("status")).toHaveTextContent("3 words selected");
    fireEvent.pointerEnter(word("all")); // released: no longer extends
    expect(word("all")).not.toHaveAttribute("data-selected");
  });

  it("a click selects one word; Shift+click extends from it", () => {
    renderWithStrata(<Demo />);
    fireEvent.pointerDown(word("kiln"), { button: 0 });
    fireEvent.pointerUp(window);
    expect(word("kiln")).toHaveAttribute("data-selected");
    fireEvent.pointerDown(word("all"), { button: 0, shiftKey: true });
    fireEvent.pointerUp(window);
    expect(["kiln", "ran", "hot", "all"].every((t) => word(t).hasAttribute("data-selected"))).toBe(true);
  });

  it("selects every id between two ends even when the rows between are not mounted", () => {
    const onMark = vi.fn();
    renderWithStrata(<Demo rows onMark={onMark} />);
    fireEvent.pointerDown(word("The"), { button: 0 });
    fireEvent.pointerDown(word("night"), { button: 0, shiftKey: true });
    fireEvent.pointerUp(window);
    fireEvent.click(screen.getByRole("button", { name: "Must use" }));
    expect(onMark).toHaveBeenCalledWith(ids, "use");
  });

  it("moves a caret with arrows and selects with Shift+arrows, all from the keyboard", async () => {
    const user = userEvent.setup();
    const onCaret = vi.fn();
    renderWithStrata(
      <MarkableText label="Transcript" ids={ids} marks={{}} kinds={kinds} onMark={() => {}} onCaretChange={onCaret}>
        <p>{words.map((w, i) => <Mark key={i} id={ids[i]!}>{w}</Mark>)}</p>
      </MarkableText>,
    );
    await user.tab();
    expect(screen.getByRole("group", { name: "Transcript" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(word("kiln")).toHaveAttribute("data-caret");
    expect(screen.getByRole("status")).toHaveTextContent("kiln");
    await user.keyboard("{Shift>}{ArrowRight}{ArrowRight}{/Shift}");
    expect(["kiln", "ran", "hot"].every((t) => word(t).hasAttribute("data-selected"))).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("3 words selected");
    expect(onCaret).toHaveBeenLastCalledWith("w3");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar", { name: "Marks" })).toBeNull();
    await user.keyboard("{End}");
    expect(word("night")).toHaveAttribute("data-caret");
  });

  it("marks the selection with a chord, announces it, and never while typing", async () => {
    const user = userEvent.setup();
    const onMark = vi.fn();
    renderWithStrata(<><input aria-label="Note" /><Demo onMark={onMark} /></>);
    await user.type(screen.getByRole("textbox", { name: "Note" }), "g");
    expect(onMark).not.toHaveBeenCalled();
    screen.getByRole("textbox", { name: "Note" }).blur();
    fireEvent.pointerDown(word("kiln"), { button: 0 });
    fireEvent.pointerDown(word("hot"), { button: 0, shiftKey: true });
    fireEvent.pointerUp(window);
    await user.keyboard("g");
    expect(onMark).toHaveBeenLastCalledWith(["w1", "w2", "w3"], "use");
    expect(screen.getByRole("status")).toHaveTextContent("3 words marked must use");
    await user.keyboard("r");
    expect(onMark).toHaveBeenLastCalledWith(["w1", "w2", "w3"], "never");
    await user.keyboard("w");
    expect(onMark).toHaveBeenLastCalledWith(["w1", "w2", "w3"], null);
    expect(screen.getByRole("status")).toHaveTextContent("3 words cleared");
  });

  it("does nothing on a chord while nothing is selected, and says so in the legend", async () => {
    const user = userEvent.setup();
    const onMark = vi.fn();
    renderWithStrata(<Demo onMark={onMark} />);
    await user.keyboard("g");
    expect(onMark).not.toHaveBeenCalled();
    expect(within(screen.getByLabelText("Mark keys")).getByText("Must use")).toBeInTheDocument();
  });

  it("names a mark by its meaning in text, not colour alone, with a pattern", () => {
    renderWithStrata(<Demo initial={{ w1: "use", w2: "never" }} />);
    expect(word("kiln")).toHaveTextContent("kiln (must use)");
    expect(word("kiln")).toHaveStyle({ textDecorationStyle: "solid" });
    expect(word("ran")).toHaveTextContent("ran (never use)");
    expect(word("ran")).toHaveStyle({ textDecorationStyle: "dashed" });
  });

  it("lists what is marked: '1 word must use, 2 words never use'", () => {
    renderWithStrata(<MarkSummary marks={{ a: "use", b: "never", c: "never" }} kinds={kinds} />);
    const list = screen.getByRole("list", { name: "Marked" });
    expect(list).toHaveTextContent("1 word must use");
    expect(list).toHaveTextContent("2 words never use");
  });

  it("says nothing is marked yet, and updates the summary as marks are made", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Demo />);
    expect(screen.getByText("Nothing marked yet.")).toBeInTheDocument();
    fireEvent.pointerDown(word("kiln"), { button: 0 });
    fireEvent.pointerUp(window);
    await user.click(screen.getByRole("button", { name: "Never use" }));
    expect(screen.getByRole("list", { name: "Marked" })).toHaveTextContent("1 word never use");
  });
});
