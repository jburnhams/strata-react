import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { DataView, Status, TileGrid, TileGridSkeleton, type TileGridProps } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #240: a grid of picture tiles that open something, with no selection.

type Page = { id: string; n: number; label: string; words: number | null; look: boolean };
const pages: Page[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, n: i + 1, label: `${i + 1 + 8}`, words: i === 3 ? null : 100 + i, look: i === 1 }));
const name = (p: Page) => `Page ${p.n}, ${p.label}, ${p.words === null ? "blank" : `${p.words} words`}${p.look ? ", needs a look" : ""}`;

const Path = () => <output aria-label="Path">{useLocation().pathname}</output>;

function Grid(props: Partial<TileGridProps<Page>> & { items?: Page[] }) {
  return (
    <>
      <Path />
      <TileGrid
        label="Pages of the book"
        items={pages}
        itemKey={(p) => p.id}
        itemLabel={name}
        renderImage={(p) => <img alt="" src={`/pages/${p.id}.jpg`} />}
        caption={(p) => `Page ${p.n}, ${p.label}`}
        detail={(p) => (p.words === null ? "blank" : `${p.words} words`)}
        badge={(p) => (p.look ? <Status tone="warning">Look</Status> : null)}
        href={(p) => `/books/1/pages/${p.id}`}
        {...props}
      />
    </>
  );
}

describe("TileGrid", () => {
  it("is a named grid of tiles, each named by one sentence, with its caption, detail and badge", () => {
    renderWithStrata(<Grid />);
    const grid = screen.getByRole("grid", { name: "Pages of the book" });
    expect(within(grid).getAllByRole("row")).toHaveLength(pages.length);
    const tile = within(grid).getByRole("row", { name: "Page 2, 10, 101 words, needs a look" });
    expect(within(tile).getByText("Look")).toBeInTheDocument();
    expect(within(tile).getByText("Page 2, 10")).toBeInTheDocument();
    expect(within(grid).getByRole("row", { name: "Page 4, 12, blank" })).toHaveTextContent("blank");
    expect(within(grid).queryByRole("checkbox")).toBeNull();
  });

  it("opens a route in the app on a press, and again from the keyboard", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid />);
    await user.click(screen.getByText("Page 3, 11"));
    expect(screen.getByLabelText("Path")).toHaveTextContent("/books/1/pages/p3");
    await user.keyboard("{ArrowRight}{Enter}");
    expect(screen.getByLabelText("Path")).toHaveTextContent("/books/1/pages/p4");
  });

  it("does not choose anything: no selected state, and a press is not a toggle", async () => {
    renderWithStrata(<Grid />);
    await userEvent.click(screen.getByText("Page 3, 11"));
    expect(document.querySelectorAll("[aria-selected=true]")).toHaveLength(0);
  });

  it("calls onAction with the item when the tiles are not links", async () => {
    const onAction = vi.fn();
    renderWithStrata(<Grid href={undefined} onAction={onAction} />);
    await userEvent.click(screen.getByText("Page 5, 13"));
    expect(onAction).toHaveBeenCalledWith(pages[4]);
    expect(screen.getByLabelText("Path")).toHaveTextContent("/");
  });

  it("moves in two dimensions with the arrow keys", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid />);
    await user.tab();
    expect(screen.getByRole("row", { name: /^Page 1,/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("row", { name: /^Page 2,/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("row", { name: /^Page 12,/ })).toHaveFocus();
  });

  it("gives DataView its skeleton: the same grid of picture boxes, hidden from assistive technology", () => {
    const { container } = renderWithStrata(
      <DataView state={{ status: "loading" }} isEmpty={(p: Page[]) => p.length === 0} skeleton={<TileGridSkeleton count={6} />} empty={<p>No pages yet.</p>}>
        {(rows) => <Grid items={rows} />}
      </DataView>,
    );
    expect(container.querySelector("[aria-hidden=true]")?.children).toHaveLength(6);
  });
});
