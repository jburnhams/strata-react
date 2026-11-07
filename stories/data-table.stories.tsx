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

/** 480 rows: from 100 rows only the visible ones are in the DOM (TanStack Virtual); header sticks. */
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
  const { pending, schedule, undo } = useUndoable();
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(new Set());
  const shown = rows.filter((b) => !hidden.has(b.id));
  const selection = useSelection(shown, (b) => b.id);
  const withdraw = (chosen: Booking[]) => {
    const ids = chosen.map((b) => b.id);
    setHidden(new Set(ids));
    const pieces = chosen.reduce((n, b) => n + b.pieces, 0);
    schedule({
      id: ids.join(","),
      message:
        chosen.length === 1
          ? `Withdrew ${chosen[0].member}'s ${format.count(pieces, "piece")}.`
          : `Withdrew ${format.count(chosen.length, "booking")}, ${format.count(pieces, "piece")}.`,
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
      <UndoBar
        inline
        pending={pending}
        onUndo={() => {
          undo();
          setHidden(new Set());
        }}
      />
    </div>
  );
}

/** Choose, act, undo: the bulk withdrawal goes through useUndoable like a single one, and the selection drops the withdrawn rows by itself. */
export const SelectThenActInteractive: Story = { tags: ["no-visual"], render: () => <SelectThenAct /> };
