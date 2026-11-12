import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLocation } from "react-router";
import {
  BulkBar,
  Button,
  DataTable,
  RowAction,
  TableSkeleton,
  UndoBar,
  format,
  useExpanded,
  useSelection,
  useUndoable,
  type Column,
  type DataTableProps,
} from "../src";
import { bookingColumns } from "./fixtures/columns";
import { bookings, type Booking } from "./fixtures/kiln";
import { manyBookings } from "./mocks/handlers";

function BookingTable(props: Omit<DataTableProps<Booking>, "columns" | "rowKey" | "caption">) {
  return <DataTable caption="Work in the kilns" columns={bookingColumns} rowKey={(b) => b.id} {...props} />;
}

function ShowUrl() {
  const { search } = useLocation();
  return <p className="mt-3 type-caption text-muted-foreground">URL search: {search || "(none)"}</p>;
}

const meta = { title: "Data/DataTable", component: BookingTable, args: { rows: bookings } } satisfies Meta<typeof BookingTable>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The data's own order; muted sentence-case headers, row rules, numbers right-aligned. */
export const Default: Story = {};

export const SortedByPieces: Story = { args: { initialSort: { key: "pieces", dir: "descending" } } };

/** Sort kept in ?sort=, so a sorted view can be linked. This story starts at ?sort=member.asc. */
export const SortInUrl: Story = {
  parameters: { route: "/bookings?sort=member.asc" },
  render: (args) => (
    <>
      <BookingTable {...args} sortParam="sort" />
      <ShowUrl />
    </>
  ),
};

/** 480 rows: from 100 rows only the visible ones are in the DOM (React Aria's Virtualizer); header sticks. */
export const Virtualised: Story = { args: { rows: manyBookings, maxHeight: 360 } };

export const Skeleton: Story = { render: () => <TableSkeleton rows={4} columns={6} /> };

// Only booked work can be withdrawn; work already in a kiln cannot, so its box is disabled.
const canWithdraw = (b: Booking) => b.state === "booked";

/** Checkboxes only where a bulk action exists. Booked rows can be chosen; work in a kiln cannot (disabled, left out of "Select all shown", which is mixed here). */
export const Selection: Story = {
  render: (args) => (
    <BookingTable
      {...args}
      selection={{
        selected: new Set(["b-2051"]),
        onChange: () => undefined,
        rowLabel: (b) => b.member,
        isSelectable: canWithdraw,
      }}
    />
  ),
};

/** The bar over a selection: a polite live count, one filled action named with its verb and count, Clear selection. */
export const SelectionWithBulkBar: Story = {
  render: (args) => (
    <div className="grid gap-3">
      <BulkBar count={2} noun="booking" onClear={() => undefined}>
        <Button size="sm" variant="default">
          Withdraw 2
        </Button>
      </BulkBar>
      <BookingTable
        {...args}
        selection={{
          selected: new Set(["b-2051", "b-2055"]),
          onChange: () => undefined,
          rowLabel: (b) => b.member,
          isSelectable: canWithdraw,
        }}
      />
    </div>
  ),
};

const withdrawColumn = (onWithdraw: (b: Booking) => void): Column<Booking> => ({
  key: "action",
  header: "Actions",
  hideHeader: true,
  cell: (b) => (canWithdraw(b) ? <RowAction label="Withdraw" subject={b.member} onClick={() => onWithdraw(b)} /> : null),
});

/** One action per row, only where it applies. Each is named for its row ("Withdraw Dev Raman"); the column's header is for screen readers only. */
export const RowActions: Story = {
  render: (args) => (
    <DataTable caption="Work in the kilns" rowKey={(b) => b.id} {...args} columns={[...bookingColumns, withdrawColumn(() => undefined)]} />
  ),
};

function SelectThenAct() {
  const [rows, setRows] = React.useState(bookings);
  const undoable = useUndoable();
  // The undo hook owns which rows are out of view; the selection follows the rows that are shown.
  const shown = rows.filter((b) => !undoable.isRemoved(b.id));
  const selection = useSelection(shown, (b) => b.id);
  const withdraw = (chosen: Booking[]) => {
    const ids = chosen.map((b) => b.id);
    const pieces = chosen.reduce((n, b) => n + b.pieces, 0);
    const one = chosen.length === 1 ? chosen[0] : undefined;
    // One removal for the batch: one message, one Undo, one commit.
    undoable.schedule({
      id: ids.join(","),
      ids,
      message: one
        ? `Withdrew ${one.member}'s ${format.count(pieces, "piece")}.`
        : `Withdrew ${format.count(chosen.length, "booking")}, ${format.count(pieces, "piece")}.`,
      failure: one
        ? `${one.member}'s booking is back: the withdrawal did not go through.`
        : `The ${format.count(chosen.length, "booking")} are back: the withdrawal did not go through.`,
      commit: () => setRows((r) => r.filter((b) => !ids.includes(b.id))),
    });
  };
  return (
    <div className="grid gap-3">
      <BulkBar count={selection.count} noun="booking" onClear={selection.clear}>
        <Button size="sm" variant="default" onClick={() => withdraw(selection.selectedRows)}>
          Withdraw {format.integer.format(selection.count)}
        </Button>
      </BulkBar>
      <DataTable
        caption="Work in the kilns"
        columns={[...bookingColumns, withdrawColumn((b) => withdraw([b]))]}
        rows={shown}
        rowKey={(b) => b.id}
        selection={{ ...selection, rowLabel: (b) => b.member, isSelectable: canWithdraw }}
      />
      <UndoBar inline undoable={undoable} />
    </div>
  );
}

/** Choose, act, undo: the bulk withdrawal goes through useUndoable like a single one, and the selection drops the withdrawn rows by itself. */
export const SelectThenActInteractive: Story = { tags: ["no-visual"], render: () => <SelectThenAct /> };

/** What a booking's detail row shows: the firing and when it is out. Static here; a real detail would make its own request (see Screens/Firing history). */
function BookingDetail({ b }: { b: Booking }) {
  return (
    <p className="type-body-sm text-muted-foreground">
      {b.firing} in kiln {b.kiln}, {format.count(b.pieces, "piece")}. Collect: {b.out}.
    </p>
  );
}

const bookingExpansion = (expanded: Iterable<string>) => ({
  expanded: new Set(expanded),
  onChange: () => undefined,
  rowLabel: (b: Booking) => `Details of ${b.member}'s booking`,
  detail: (b: Booking) => <BookingDetail b={b} />,
});

/** A toggle per row opens a detail row under it, with no rule between the two. Here Tom Ellery's is open. Ready work has nothing more to show, so it has no toggle. */
export const Expansion: Story = {
  render: (args) => <BookingTable {...args} expansion={{ ...bookingExpansion(["b-2042"]), isExpandable: (b) => b.state !== "ready" }} />,
};

/** Expansion with selection: the detail starts under the first data column, and a chosen row's detail shares its fill. */
export const ExpansionWithSelection: Story = {
  render: (args) => (
    <BookingTable
      {...args}
      expansion={bookingExpansion(["b-2051"])}
      selection={{ selected: new Set(["b-2051"]), onChange: () => undefined, rowLabel: (b) => b.member, isSelectable: canWithdraw }}
    />
  ),
};

/** 480 rows with two open: each detail row is measured, so the rows after it are placed below it. */
export const ExpansionVirtualised: Story = {
  args: { rows: manyBookings, maxHeight: 360 },
  render: (args) => <BookingTable {...args} expansion={bookingExpansion(["b-3001", "b-3004"])} />,
};

function ExpandInUrl(args: Omit<DataTableProps<Booking>, "columns" | "rowKey" | "caption">) {
  const expanded = useExpanded({ param: "open" });
  return (
    <>
      <BookingTable {...args} expansion={{ ...expanded, rowLabel: (b) => `Details of ${b.member}'s booking`, detail: (b) => <BookingDetail b={b} /> }} />
      <ShowUrl />
    </>
  );
}

/** `useExpanded({ param: "open" })`: open rows live in ?open=, so an opened row can be linked. Starts with Priya's open. */
export const ExpansionInUrl: Story = {
  parameters: { route: "/bookings?open=b-2041" },
  render: (args) => <ExpandInUrl {...args} />,
};

// Kilns with a value some rows do not have: kiln 3 (gas, in the yard) has no element hours, and
// kiln 4 is new and has never been serviced. `value` gives each column a typed sort that keeps
// those rows last both ways, and the placeholder: an en dash, or "Never" where the word says more.
type KilnService = { id: string; name: string; elementHours: number | null; serviced: string | null };
const kilnService: KilnService[] = [
  { id: "1", name: "Kiln 1, large electric", elementHours: 1840, serviced: "2026-06-14T09:00:00Z" },
  { id: "2", name: "Kiln 2, small electric", elementHours: 612, serviced: "2026-09-02T09:00:00Z" },
  { id: "3", name: "Kiln 3, raku (gas, in the yard)", elementHours: null, serviced: "2025-11-20T09:00:00Z" },
  { id: "4", name: "Kiln 4, test kiln", elementHours: 38, serviced: null },
];
const serviceColumns: Column<KilnService>[] = [
  { key: "name", header: "Kiln", value: (k) => k.name },
  { key: "hours", header: "Element hours", numeric: true, value: (k) => k.elementHours, cell: (k) => format.count(k.elementHours, "hour") },
  { key: "serviced", header: "Last serviced", value: (k) => k.serviced && new Date(k.serviced), missing: "Never" },
];

/** Missing values: a muted placeholder, and sorted last whichever way the column runs (here, most element hours first). */
export const MissingValues: Story = {
  render: () => (
    <DataTable caption="Kiln servicing" columns={serviceColumns} rows={kilnService} rowKey={(k) => k.id} initialSort={{ key: "hours", dir: "descending" }} />
  ),
};
