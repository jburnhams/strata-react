import { describe, expect, it, vi } from "vite-plus/test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaContents, currentItem, type MediaContentsItem } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #372: one file's chapters beside its player.

const items: MediaContentsItem[] = [
  { id: "a", title: "Christmas morning", start: 0, end: 2401, detail: "3 scenes" },
  { id: "b", title: "Christmas dinner", start: 2412, end: 5642 },
  { id: "c", title: "The evening", start: 5650, end: 10812 },
];

describe("MediaContents", () => {
  it("names each row for what pressing it does, with its start and length", () => {
    renderWithStrata(<MediaContents label="Chapters" items={items} onSeek={() => {}} />);
    const list = screen.getByRole("list", { name: "Chapters" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual([
      "Play Christmas morning, from 0:00",
      "Play Christmas dinner, from 40:12",
      "Play The evening, from 1:34:10",
    ]);
    expect(screen.getByText("3 scenes")).toBeInTheDocument();
    expect(screen.getByText("53:50 long")).toBeInTheDocument();
  });

  it("marks the item the playhead is in, and none in a gap or before it plays", () => {
    const { rerender } = renderWithStrata(
      <MediaContents label="Chapters" items={items} time={3000} onSeek={() => {}} />,
    );
    const rows = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("aria-current"));
    expect(rows()).toEqual([null, "time", null]);
    rerender(<MediaContents label="Chapters" items={items} time={2405} onSeek={() => {}} />);
    expect(rows()).toEqual([null, null, null]);
    expect(currentItem(items, undefined)).toBe(-1);
  });

  it("plays from an item's start and says which was pressed", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const onSelect = vi.fn();
    renderWithStrata(<MediaContents label="Chapters" items={items} onSeek={onSeek} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /^Play Christmas dinner/ }));
    expect(onSeek).toHaveBeenCalledWith(2412);
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});
