import * as React from "react";
import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkBar, Button, DataTable, SelectableGrid, useSelection, type Column, type InitialSelection } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { shelfPhotos, type ShelfPhoto } from "../../stories/fixtures/kiln";

const photos = shelfPhotos();
const label = (p: ShelfPhoto) => `${p.member}, ${p.piece}`;
const box = (p: ShelfPhoto) => screen.getByRole("checkbox", { name: `Select ${label(p)}` });
const selectAll = () => screen.getByRole("checkbox", { name: "Select all shown" });
const uncollected = (p: ShelfPhoto) => !p.collected;

function Grid({ rows = photos, initial }: { rows?: ShelfPhoto[]; initial?: InitialSelection<ShelfPhoto> }) {
  const selection = useSelection(rows, (p) => p.id, initial);
  return (
    <>
      <BulkBar count={selection.count} noun="piece" onClear={selection.clear}>
        <Button variant="default">Reglaze {selection.count}</Button>
      </BulkBar>
      <SelectableGrid
        label="Pieces from kiln 2"
        rows={rows}
        rowKey={(p) => p.id}
        renderImage={(p) => <img alt="" src={`/photos/${p.id}.jpg`} />}
        detail={(p) => p.piece}
        selection={{ ...selection, rowLabel: label, isSelectable: uncollected }}
      />
    </>
  );
}

describe("SelectableGrid", () => {
  it("is a named list of tiles, each a box named from its row, disabled where it cannot be chosen", () => {
    renderWithStrata(<Grid />);
    const list = screen.getByRole("list", { name: "Pieces from kiln 2" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(photos.length);
    expect(box(photos[0])).toBeEnabled();
    expect(box(photos.find((p) => p.collected)!)).toBeDisabled();
    expect(screen.getByText(photos[0].piece)).toBeInTheDocument();
  });

  it("toggles from a click anywhere on the tile, not only the box", async () => {
    renderWithStrata(<Grid />);
    await userEvent.click(screen.getByText(photos[1].piece));
    expect(box(photos[1])).toBeChecked();
    expect(screen.getByText("1 piece selected")).toBeInTheDocument();
  });

  it("Shift-click chooses the run from the last tile clicked, skipping tiles that cannot be chosen", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid />);
    await user.click(box(photos[5]));
    await user.keyboard("{Shift>}");
    await user.click(box(photos[10]));
    await user.keyboard("{/Shift}");
    const run = photos.slice(5, 11);
    for (const p of run) {
      if (p.collected) expect(box(p)).not.toBeChecked();
      else expect(box(p)).toBeChecked();
    }
    expect(screen.getByText(`${run.filter(uncollected).length} pieces selected`)).toBeInTheDocument();
    expect(box(photos[4])).not.toBeChecked();
    expect(box(photos[11])).not.toBeChecked();
  });

  it("Shift-click on a chosen tile clears the run, and runs work upwards", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid />);
    await user.click(selectAll());
    await user.click(box(photos[6]));
    await user.keyboard("{Shift>}");
    await user.click(box(photos[2]));
    await user.keyboard("{/Shift}");
    for (const p of photos.slice(2, 7)) expect(box(p)).not.toBeChecked();
    expect(box(photos[1])).toBeChecked();
    expect(box(photos[7])).toBeChecked();
  });

  it("Shift+Space on a box extends the run from the keyboard", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid />);
    await user.click(box(photos[0]));
    box(photos[3]).focus();
    await user.keyboard("{Shift>} {/Shift}");
    for (const p of photos.slice(0, 4)) expect(box(p)).toBeChecked();
  });

  it("a plain click after a range is a single toggle", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Grid />);
    await user.click(box(photos[0]));
    await user.keyboard("{Shift>}");
    await user.click(box(photos[2]));
    await user.keyboard("{/Shift}");
    await user.click(box(photos[4]));
    expect(box(photos[3])).not.toBeChecked();
    expect(box(photos[4])).toBeChecked();
  });

  it("select all shown covers the selectable tiles, goes mixed, and clears", async () => {
    renderWithStrata(<Grid />);
    await userEvent.click(box(photos[0]));
    expect(selectAll()).toBePartiallyChecked();
    await userEvent.click(selectAll());
    expect(box(photos[0])).not.toBeChecked();
    await userEvent.click(selectAll());
    expect(selectAll()).toBeChecked();
    expect(screen.getByText(`${photos.filter(uncollected).length} pieces selected`)).toBeInTheDocument();
  });

  it("virtualises from 100 tiles and select-all still covers every tile", async () => {
    const many = shelfPhotos(400);
    renderWithStrata(<Grid rows={many} />);
    const shown = within(screen.getByRole("list", { name: "Pieces from kiln 2" })).getAllByRole("listitem");
    expect(shown.length).toBeLessThan(many.length);
    expect(shown[0]).toHaveAttribute("aria-setsize", String(many.length));
    expect(screen.getByRole("region", { name: "Pieces from kiln 2" })).toHaveAttribute("tabindex", "0");
    await userEvent.click(selectAll());
    expect(screen.getByText(`${many.filter(uncollected).length} pieces selected`)).toBeInTheDocument();
  });

  it("starts with the rows `initial` names, once they arrive", async () => {
    function Loading() {
      const [rows, setRows] = React.useState<ShelfPhoto[]>([]);
      return (
        <>
          <button onClick={() => setRows(photos)}>Load</button>
          <Grid rows={rows} initial={(p) => p.thin && !p.collected} />
        </>
      );
    }
    renderWithStrata(<Loading />);
    await userEvent.click(screen.getByRole("button", { name: "Load" }));
    const thin = photos.filter((p) => p.thin && !p.collected);
    for (const p of thin) expect(box(p)).toBeChecked();
    expect(screen.getByText(`${thin.length} pieces selected`)).toBeInTheDocument();
  });
});

describe("useSelection initial", () => {
  function Paged({ initial }: { initial: InitialSelection<ShelfPhoto> }) {
    const [count, setCount] = React.useState(6);
    const [hidden, setHidden] = React.useState(false);
    const rows = shelfPhotos(count).filter((p) => !(hidden && p.id === "p-003"));
    const selection = useSelection(rows, (p) => p.id, initial);
    return (
      <>
        <button onClick={() => setCount(12)}>Next page</button>
        <button onClick={() => setHidden((h) => !h)}>Toggle filter</button>
        <output data-testid="chosen">{[...selection.selected].sort().join(" ")}</output>
        <SelectableGrid
          label="Pieces"
          rows={rows}
          rowKey={(p) => p.id}
          renderImage={() => null}
          selection={{ ...selection, rowLabel: label }}
        />
      </>
    );
  }

  it("applies to rows that arrive later, and leaves the person's choices on rows already seen", async () => {
    renderWithStrata(<Paged initial={(p) => p.thin} />);
    expect(screen.getByTestId("chosen")).toHaveTextContent(/^p-003 p-006$/);
    await userEvent.click(box(photos[2])); // p-003 cleared by hand
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByTestId("chosen")).toHaveTextContent(/^p-006 p-010$/);
  });

  it("takes keys too, and a row that leaves and comes back returns unchosen", async () => {
    renderWithStrata(<Paged initial={["p-003", "p-008"]} />);
    expect(screen.getByTestId("chosen")).toHaveTextContent(/^p-003$/);
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByTestId("chosen")).toHaveTextContent(/^p-003 p-008$/);
    await userEvent.click(screen.getByRole("button", { name: "Toggle filter" }));
    expect(screen.getByTestId("chosen")).toHaveTextContent(/^p-008$/);
    await userEvent.click(screen.getByRole("button", { name: "Toggle filter" }));
    expect(screen.getByTestId("chosen")).toHaveTextContent(/^p-008$/);
  });

  it("reads a single-use iterable of keys once, for every row", () => {
    function Once() {
      const [initial] = React.useState(() => new Set(["p-002", "p-003"]).values());
      const selection = useSelection(photos.slice(0, 4), (p) => p.id, initial);
      return <output data-testid="chosen">{[...selection.selected].sort().join(" ")}</output>;
    }
    renderWithStrata(<Once />);
    expect(screen.getByTestId("chosen")).toHaveTextContent(/^p-002 p-003$/);
  });

  it("does not loop when the rows are a new array every render", () => {
    function Fresh() {
      const selection = useSelection(photos.slice(0, 4), (p) => p.id, ["p-001"]);
      return <output data-testid="n">{selection.count}</output>;
    }
    renderWithStrata(<Fresh />);
    expect(screen.getByTestId("n")).toHaveTextContent("1");
  });
});

describe("DataTable range select", () => {
  const columns: Column<ShelfPhoto>[] = [
    { key: "piece", header: "Piece", cell: (p) => p.piece, sort: (a, b) => a.piece.localeCompare(b.piece) },
  ];
  function Table() {
    const rows = photos.slice(0, 8);
    const selection = useSelection(rows, (p) => p.id);
    return (
      <DataTable
        caption="Pieces"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        initialSort={{ key: "piece", dir: "descending" }}
        selection={{ ...selection, rowLabel: label }}
      />
    );
  }

  it("Shift-click runs down the rows in the sorted order shown", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Table />);
    const shown = screen.getAllByRole("checkbox").slice(1); // after select-all, in display order
    await user.click(shown[1]);
    await user.keyboard("{Shift>}");
    await user.click(shown[4]);
    await user.keyboard("{/Shift}");
    shown.forEach((b, i) => (i >= 1 && i <= 4 ? expect(b).toBeChecked() : expect(b).not.toBeChecked()));
  });
});
