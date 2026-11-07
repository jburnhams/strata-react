import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLocation } from "react-router";
import { DataTable, TableSkeleton, type DataTableProps } from "../src";
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
