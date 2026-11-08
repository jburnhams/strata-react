import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BulkBar,
  Button,
  Checkbox,
  DataTable,
  IconButton,
  RowAction,
  useSelection,
  useUndoable,
  type Column,
} from "../../src";
import { renderWithStrata } from "../../src/testing";
import { bookings, type Booking } from "../../stories/fixtures/kiln";
import { manyBookings } from "../../stories/mocks/handlers";
import { Trash2 } from "lucide-react";

const columns: Column<Booking>[] = [
  { key: "member", header: "Member", cell: (b) => b.member },
  { key: "pieces", header: "Pieces", cell: (b) => b.pieces, numeric: true },
];
const booked = (b: Booking) => b.state === "booked";
const bookable = bookings.filter(booked);

function Harness({ rows = bookings, onWithdraw }: { rows?: Booking[]; onWithdraw?: (ids: string[]) => void }) {
  const [shown, setShown] = React.useState(rows);
  const selection = useSelection(shown, (b) => b.id);
  return (
    <>
      <BulkBar count={selection.count} noun="booking" onClear={selection.clear}>
        <Button
          variant="default"
          onClick={() => {
            const ids = selection.selectedRows.map((b) => b.id);
            onWithdraw?.(ids);
            setShown((s) => s.filter((b) => !ids.includes(b.id)));
          }}
        >
          Withdraw {selection.count}
        </Button>
      </BulkBar>
      <DataTable
        caption="Work"
        columns={columns}
        rows={shown}
        rowKey={(b) => b.id}
        selection={{ ...selection, rowLabel: (b) => b.member, isSelectable: booked }}
      />
    </>
  );
}

const selectAll = () => screen.getByRole("checkbox", { name: "Select all shown" });

describe("Checkbox", () => {
  it("is named by its label, shown or hidden, and the label is part of the target", async () => {
    const onChange = vi.fn();
    render(
      <>
        <Checkbox label="Glaze the foot ring" checked={false} onCheckedChange={onChange} />
        <Checkbox label="Select Tom Ellery" hideLabel checked onCheckedChange={() => undefined} />
      </>,
    );
    await userEvent.click(screen.getByText("Glaze the foot ring"));
    expect(onChange).toHaveBeenCalledWith(true, { shiftKey: false });
    expect(screen.getByRole("checkbox", { name: "Select Tom Ellery" })).toBeChecked();
  });

  it("shows the mixed state as indeterminate", () => {
    render(<Checkbox label="Select all shown" hideLabel checked="mixed" onCheckedChange={() => undefined} />);
    const box = screen.getByRole("checkbox", { name: "Select all shown" }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(box).toHaveAttribute("aria-checked", "mixed");
  });
});

describe("DataTable selection", () => {
  it("adds no checkboxes without a selection", () => {
    renderWithStrata(<DataTable caption="Work" columns={columns} rows={bookings} rowKey={(b) => b.id} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("names each row's checkbox and disables rows that cannot be chosen", () => {
    renderWithStrata(<Harness />);
    expect(screen.getByRole("checkbox", { name: "Select Dev Raman" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Select Tom Ellery" })).toBeDisabled();
  });

  it("selects all shown selectable rows, goes mixed, and clears", async () => {
    renderWithStrata(<Harness />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Dev Raman" }));
    expect(selectAll()).toHaveAttribute("aria-checked", "mixed");
    // A mixed box clears what is shown.
    await userEvent.click(selectAll());
    expect(screen.getByRole("checkbox", { name: "Select Dev Raman" })).not.toBeChecked();
    await userEvent.click(selectAll());
    expect(selectAll()).toBeChecked();
    for (const b of bookable) expect(screen.getByRole("checkbox", { name: `Select ${b.member}` })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Tom Ellery" })).not.toBeChecked();
    expect(screen.getByText(`${bookable.length} bookings selected`)).toBeInTheDocument();
  });

  it("disables select-all when no row shown can be chosen", () => {
    renderWithStrata(<Harness rows={bookings.filter((b) => !booked(b))} />);
    expect(selectAll()).toBeDisabled();
  });

  it("select-all covers the rows a virtualised table has not rendered", async () => {
    renderWithStrata(
      <Harness rows={manyBookings.map((b) => ({ ...b, state: "booked" as const }))} />,
    );
    await userEvent.click(selectAll());
    expect(screen.getByText(`${manyBookings.length} bookings selected`)).toBeInTheDocument();
  });

  it("announces the count politely and acts on the chosen rows, then drops them from the selection", async () => {
    const onWithdraw = vi.fn();
    renderWithStrata(<Harness onWithdraw={onWithdraw} />);
    const live = screen.getByText("No bookings selected");
    expect(live).toHaveAttribute("aria-live", "polite");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Dev Raman" }));
    expect(live).toHaveTextContent("1 booking selected");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Hannah Lowe" }));
    expect(live).toHaveTextContent("2 bookings selected");
    const group = screen.getByRole("group", { name: "Actions for the selected bookings" });
    await userEvent.click(within(group).getByRole("button", { name: "Withdraw 2" }));
    expect(onWithdraw).toHaveBeenCalledWith(["b-2051", "b-2055"]);
    // The withdrawn rows are gone, so the selection is empty and the bar has gone with them.
    expect(live).toHaveTextContent("No bookings selected");
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("forgets a chosen row that leaves, so it returns unchosen", async () => {
    function Filtered() {
      const [all, setAll] = React.useState(true);
      const rows = all ? bookings : bookings.filter((b) => b.id !== "b-2051");
      const selection = useSelection(rows, (b) => b.id);
      return (
        <>
          <button onClick={() => setAll((a) => !a)}>Toggle filter</button>
          <output data-testid="count">{selection.count}</output>
          <DataTable caption="Work" columns={columns} rows={rows} rowKey={(b) => b.id} selection={{ ...selection, rowLabel: (b) => b.member }} />
        </>
      );
    }
    renderWithStrata(<Filtered />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Dev Raman" }));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    await userEvent.click(screen.getByRole("button", { name: "Toggle filter" }));
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    await userEvent.click(screen.getByRole("button", { name: "Toggle filter" }));
    expect(screen.getByRole("checkbox", { name: "Select Dev Raman" })).not.toBeChecked();
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("clears the selection from the bar", async () => {
    renderWithStrata(<Harness />);
    await userEvent.click(selectAll());
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(selectAll()).not.toBeChecked();
  });
});

describe("Bulk removal through useUndoable", () => {
  it("removes, undoes and commits every id of one removal together", async () => {
    const commit = vi.fn();
    function Bulk() {
      const undoable = useUndoable();
      const shown = bookable.filter((b) => !undoable.isRemoved(b.id));
      return (
        <>
          <button
            onClick={() =>
              undoable.schedule({ id: "bulk", ids: bookable.map((b) => b.id), message: "Withdrew 2 bookings.", failure: "They are back.", commit })
            }
          >
            Withdraw all
          </button>
          <button onClick={undoable.undo}>Undo</button>
          <button onClick={() => void undoable.flush()}>Flush</button>
          <output data-testid="shown">{shown.length}</output>
        </>
      );
    }
    render(<Bulk />);
    await userEvent.click(screen.getByRole("button", { name: "Withdraw all" }));
    expect(screen.getByTestId("shown")).toHaveTextContent("0");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("shown")).toHaveTextContent(String(bookable.length));
    expect(commit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Withdraw all" }));
    await userEvent.click(screen.getByRole("button", { name: "Flush" }));
    expect(commit).toHaveBeenCalledOnce();
    expect(screen.getByTestId("shown")).toHaveTextContent("0");
  });
});

describe("Row actions", () => {
  it("gives each row's action its own name that starts with the visible verb", () => {
    render(
      <>
        <RowAction label="Withdraw" subject="Dev Raman" />
        <RowAction label="Withdraw" subject="Hannah Lowe" />
        <IconButton icon={Trash2} label="Remove Moonbeam" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Withdraw Dev Raman" })).toHaveTextContent("Withdraw");
    expect(screen.getByRole("button", { name: "Withdraw Hannah Lowe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Moonbeam" })).toBeInTheDocument();
  });

  it("keeps a hidden column header as the column's name", () => {
    renderWithStrata(
      <DataTable
        caption="Work"
        columns={[...columns, { key: "action", header: "Actions", hideHeader: true, cell: (b) => <RowAction label="Withdraw" subject={b.member} /> }]}
        rows={bookings.slice(0, 2)}
        rowKey={(b) => b.id}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
  });
});
