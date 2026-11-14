import * as React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { SelectableGrid, SelectableGridSkeleton, DataView, useSelection } from "../../src";
import { LayoutInfo, Rect } from "react-stately";
import { justifyRows, stuckHeader } from "../../src/lib/grouped-grid-layout";
import { renderWithStrata } from "../../src/testing";

// Issue #246, the rest: the justified layout (aspect="natural"), the marquee, touch pinch and the
// heading pushed up by the next one.

describe("justifyRows", () => {
  it("fills each row to the width exactly and keeps the last row at the target height", () => {
    const items = [2, 1, 1, 2, 1].map((aspect, i) => ({ key: `k${i}`, aspect }));
    const { placed, heights } = justifyRows(items, 600, 100, 10, 0);
    // 2+1+1 at 100px is 400 plus 20 of gaps: not full; adding the 2 makes 620 >= 600, so row one holds four.
    expect(placed.filter((p) => p.row === 0)).toHaveLength(4);
    const row0 = placed.filter((p) => p.row === 0);
    expect(row0.at(-1)!.x + row0.at(-1)!.width).toBeCloseTo(600, 5);
    expect(heights[0]).toBeLessThan(100); // scaled down to fit
    expect(heights[1]).toBe(100); // the short last row is not stretched
    expect(placed.find((p) => p.key === "k0")!.width / placed.find((p) => p.key === "k1")!.width).toBeCloseTo(2, 5);
  });

  it("allows for each tile's own padding", () => {
    const { placed } = justifyRows([{ key: "a", aspect: 1 }, { key: "b", aspect: 1 }, { key: "c", aspect: 1 }], 320, 100, 10, 14);
    const row = placed.filter((p) => p.row === 0);
    expect(row.at(-1)!.x + row.at(-1)!.width).toBeCloseTo(320, 5);
  });
});

type P = { id: string; name: string; w: number; h: number };
const photos: P[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Photo ${i}`, w: i % 3 === 0 ? 300 : 200, h: 200 }));

function Grid(props: { size?: number; onSize?: (n: number) => void; selectionMode?: "multiple" | "none" }) {
  const selection = useSelection(photos, (p) => p.id);
  const [size, setSize] = React.useState(props.size ?? 120);
  return (
    <>
      <SelectableGrid<P>
        label="Photos"
        rows={photos}
        rowKey={(p) => p.id}
        renderImage={() => <span />}
        aspect="natural"
        naturalAspect={(p) => p.w / p.h}
        selection={{ ...selection, rowLabel: (p) => p.name }}
        tileSize={size}
        onTileSizeChange={(n) => { setSize(n); props.onSize?.(n); }}
        selectionMode={props.selectionMode}
      />
      <p data-testid="count">{selection.count}</p>
    </>
  );
}

describe("SelectableGrid aspect natural", () => {
  it("draws each picture at its own shape", () => {
    renderWithStrata(<Grid />);
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBeGreaterThan(0);
    const wide = rows.find((r) => r.getAttribute("data-key") === "p0")!;
    const normal = rows.find((r) => r.getAttribute("data-key") === "p1")!;
    expect((wide.querySelector("span[style]") as HTMLElement).style.aspectRatio).toBe("1.5 / 1");
    expect((normal.querySelector("span[style]") as HTMLElement).style.aspectRatio).toBe("1 / 1");
  });
});

describe("marquee and pinch", () => {
  const rects = (hit: (key: string) => DOMRect) => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const key = this.getAttribute("data-key");
      return key ? hit(key) : original.call(this);
    };
    return () => void (HTMLElement.prototype.getBoundingClientRect = original);
  };
  const box = (l: number, t: number): DOMRect => ({ left: l, top: t, right: l + 50, bottom: t + 50, width: 50, height: 50, x: l, y: t, toJSON: () => ({}) });

  it("a drag from between tiles chooses the tiles it touches; a drag from a tile does not", () => {
    // p0..p3 laid out in a row, 60px apart.
    const restore = rects((k) => box(Number(k.slice(1)) * 60, 0));
    try {
      renderWithStrata(<Grid />);
      const grid = screen.getByRole("grid", { name: "Photos" });
      fireEvent.pointerDown(grid, { button: 0, pointerType: "mouse", clientX: 55, clientY: 100 });
      fireEvent(window, new MouseEvent("pointermove", { clientX: 130, clientY: 25, bubbles: true }));
      // The rectangle from (55,100) to (130,25) touches p1 (60-110) and p2 (120-170) but not p0 (0-50) or p3 (180-230).
      expect(screen.getByTestId("count")).toHaveTextContent("2");
      fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));

      const first = screen.getAllByRole("row")[0]!;
      fireEvent.pointerDown(first, { button: 0, pointerType: "mouse", clientX: 10, clientY: 10 });
      fireEvent(window, new MouseEvent("pointermove", { clientX: 500, clientY: 500, bubbles: true }));
      // The press itself chose that tile (3), and no rectangle was drawn from it (that would be all 12).
      expect(screen.getByTestId("count")).toHaveTextContent("3");
      fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    } finally {
      restore();
    }
  });

  it("two fingers moving apart make the tiles larger, within their range", () => {
    const sizes: number[] = [];
    renderWithStrata(<Grid size={100} onSize={(n) => sizes.push(n)} />);
    const grid = screen.getByRole("grid", { name: "Photos" });
    const t = (x1: number, x2: number) => [{ clientX: x1, clientY: 0, identifier: 1 }, { clientX: x2, clientY: 0, identifier: 2 }];
    fireEvent.touchStart(grid, { touches: t(0, 100) });
    fireEvent.touchMove(grid, { touches: t(0, 200) });
    expect(sizes.at(-1)).toBe(200);
    fireEvent.touchMove(grid, { touches: t(0, 1000) });
    expect(sizes.at(-1)).toBe(320); // the zoom range's top
    fireEvent.touchEnd(grid, { touches: [] });
  });
});

describe("stuckHeader", () => {
  const h = (y: number) => new LayoutInfo("item", `h${y}`, new Rect(0, y, 400, 40));
  it("keeps the heading of the group at the top, and lets the next one push it up", () => {
    const headers = [h(0), h(300)];
    expect(stuckHeader(headers, 0)).toBeNull(); // the real heading is already at the top
    expect(stuckHeader(headers, 100)!.rect.y).toBe(100);
    expect(stuckHeader(headers, 100)!.key).toBe("h0");
    expect(stuckHeader(headers, 280)!.rect.y).toBe(260); // 300 - 40: the next heading is arriving
    expect(stuckHeader(headers, 310)!.key).toBe("h300");
  });
});

describe("tile slots, fit, ratio and loading (#246)", () => {
  function Slots(props: Record<string, unknown>) {
    const selection = useSelection(photos, (p) => p.id);
    return (
      <SelectableGrid<P>
        label="Photos"
        rows={photos.slice(0, 4)}
        rowKey={(p) => p.id}
        renderImage={() => <img alt="" src="/x.jpg" />}
        selection={{ ...selection, rowLabel: (p) => p.name, isSelectable: (p) => p.id !== "p1" }}
        unselectableReason={() => "Already in this project"}
        {...props}
      />
    );
  }

  it("takes a ratio, a fit, a second corner and names why a tile cannot be chosen", () => {
    renderWithStrata(<Slots aspect={16 / 9} fit="contain" mark={(p: P) => `n${p.id.slice(1)}`} />);
    const rows = screen.getAllByRole("row");
    expect((rows[0]!.querySelector("span[style]") as HTMLElement).style.aspectRatio).toBe("1.77778 / 1");
    expect(rows[0]!.querySelector("img")!.parentElement!.className).toContain("object-contain");
    expect(screen.getByText("n2")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "Photo 1, Already in this project" })).toBeInTheDocument();
  });

  it("has a loading shape for DataView, in rows at their own shapes when given them", () => {
    const { container } = renderWithStrata(
      <DataView state={{ status: "loading" }} isEmpty={(r: P[]) => r.length === 0} skeleton={<SelectableGridSkeleton count={5} shapes={[1.5, 0.66]} tileSize={100} />} empty={<p>No pictures</p>}>
        {() => <span />}
      </DataView>,
    );
    expect(container.querySelectorAll("div.p-1\\.5")).toHaveLength(5);
  });
});
