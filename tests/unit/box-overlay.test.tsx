import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoxList, BoxOverlay, ViewportFrame, useBoxes, useViewport, type PictureBox } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #237: read-only boxes on a picture, linked to a list beside it.

const lines: PictureBox[] = [
  { id: "l2", x: 40, y: 120, w: 500, h: 30, label: "Line 2: The Play of Puncn anp Jupy, 62%", tone: "warning" },
  { id: "l1", x: 40, y: 60, w: 500, h: 30, label: "Line 1: Punch and Judy, 97%" },
  { id: "l3", x: 40, y: 180, w: 500, h: 30, label: "Line 3: a scene in one act, 94%" },
];

function Screen({ onChoose }: { onChoose?: (b: PictureBox) => void }) {
  const state = useBoxes();
  const view = useViewport();
  return (
    <div>
      <ViewportFrame label="Page 22" aspect={2 / 3} {...view}>
        <BoxOverlay label="Lines the reader found" of={{ w: 600, h: 900 }} boxes={lines} state={state} onChoose={onChoose} />
      </ViewportFrame>
      <BoxList label="Lines on this page" boxes={lines} state={state} />
      <output aria-label="Active">{state.active ?? "none"}</output>
    </div>
  );
}

describe("BoxOverlay and BoxList", () => {
  it("names each box by its label and lists the lines in reading order", () => {
    renderWithStrata(<Screen />);
    const layer = screen.getByRole("group", { name: "Lines the reader found" });
    expect(within(layer).getAllByRole("button")).toHaveLength(3);
    expect(within(layer).getByRole("button", { name: "Line 2: The Play of Puncn anp Jupy, 62%" })).toBeInTheDocument();
    expect(within(screen.getByRole("listbox", { name: "Lines on this page" })).getAllByRole("option").map((o) => o.textContent?.slice(0, 6))).toEqual(["Line 1", "Line 2", "Line 3"]);
  });

  it("is one tab stop, and the arrows move through the boxes in reading order", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Screen />);
    const layer = screen.getByRole("group", { name: "Lines the reader found" });
    const box = (n: number) => within(layer).getByRole("button", { name: new RegExp(`^Line ${n}`) });
    expect(box(1)).toHaveAttribute("tabindex", "0");
    expect(box(2)).toHaveAttribute("tabindex", "-1");
    box(1).focus();
    await user.keyboard("{ArrowDown}");
    expect(box(2)).toHaveFocus();
    await user.keyboard("{End}");
    expect(box(3)).toHaveFocus();
    await user.keyboard("{Home}");
    expect(box(1)).toHaveFocus();
  });

  it("choosing a box in the picture marks it, scrolls the list to its line and focuses it", async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    renderWithStrata(<Screen onChoose={onChoose} />);
    const layer = screen.getByRole("group", { name: "Lines the reader found" });
    await user.click(within(layer).getByRole("button", { name: /^Line 3/ }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "l3" }));
    expect(screen.getByLabelText("Active")).toHaveTextContent("l3");
    expect(screen.getByRole("option", { name: /^Line 3/ })).toHaveFocus();
    expect(screen.getByRole("option", { name: /^Line 3/ })).toHaveAttribute("aria-selected", "true");
    expect(within(layer).getAllByRole("button", { name: /^Line 3/ }).find((b) => b.getAttribute("aria-pressed") === "true")).toBeDefined();
  });

  it("choosing a line in the list marks its box without taking focus from the list", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Screen />);
    await user.click(screen.getByRole("option", { name: /^Line 2/ }));
    expect(screen.getByLabelText("Active")).toHaveTextContent("l2");
    const layer = screen.getByRole("group", { name: "Lines the reader found" });
    expect(within(layer).getAllByRole("button", { name: /^Line 2/ }).some((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(screen.getByRole("option", { name: /^Line 2/ })).toHaveFocus();
  });

  it("Enter chooses the focused box", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Screen />);
    screen.getByRole("button", { name: /^Line 1/ }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Active")).toHaveTextContent("l1");
  });

  it("draws one svg layer in the picture's own units, not a node per box in HTML", () => {
    const { container } = renderWithStrata(<Screen />);
    const svg = container.querySelector("svg[role=group]")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 600 900");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.querySelectorAll("rect")).toHaveLength(3);
  });
});
