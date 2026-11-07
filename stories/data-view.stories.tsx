import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, DataTable, DataView, EmptyState, TableSkeleton, fetchJson, useLoad, type Load } from "../src";
import { bookingColumns } from "./fixtures/columns";
import { bookings, type Booking } from "./fixtures/kiln";
import { api, bookingsEmpty, bookingsLoading, bookingsServerError } from "./mocks/handlers";

// DataView requires a skeleton and an empty state, so every view of remote data has all four
// states. The "From the API" stories fetch through TanStack Query (useLoad) from MSW: the same
// code path a product runs, with the server put into each state.

function Bookings({ load }: { load: Load<Booking[]> }) {
  return (
    <DataView
      state={load}
      isEmpty={(rows) => rows.length === 0}
      skeleton={<TableSkeleton rows={4} columns={6} />}
      empty={
        <EmptyState title="All three kilns are cold" action={<Button variant="default">Book a firing</Button>}>
          Nothing is booked, firing or cooling. Bookings for Friday's bisque close at 17:00 on Thursday.
        </EmptyState>
      }
    >
      {(rows) => <DataTable caption="Work in the kilns" columns={bookingColumns} rows={rows} rowKey={(b) => b.id} />}
    </DataView>
  );
}

function FromApi() {
  const load = useLoad({ queryKey: ["bookings"], queryFn: () => fetchJson<Booking[]>(api.bookings) });
  return <Bookings load={load} />;
}

const meta = { title: "Data/DataView", component: Bookings, args: { load: { status: "loading" } } } satisfies Meta<typeof Bookings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { args: { load: { status: "ready", data: bookings } } };
export const Loading: Story = { args: { load: { status: "loading" } } };
export const Empty: Story = { args: { load: { status: "ready", data: [] } } };
export const Failed: Story = {
  args: {
    load: {
      status: "error",
      message:
        "Kiln 2's controller has not reported since 13:50, so these readings are 20 minutes old. The panel by the kiln-room door shows the live temperature.",
      retry: () => undefined,
    },
  },
};

export const FromApiReady: Story = { name: "From the API: ready", render: () => <FromApi /> };
export const FromApiLoading: Story = {
  name: "From the API: loading",
  beforeEach: ({ msw }) => msw.use(bookingsLoading),
  render: () => <FromApi />,
};
export const FromApiEmpty: Story = {
  name: "From the API: empty",
  beforeEach: ({ msw }) => msw.use(bookingsEmpty),
  render: () => <FromApi />,
};
export const FromApiError: Story = {
  name: "From the API: server error",
  beforeEach: ({ msw }) => msw.use(bookingsServerError),
  render: () => <FromApi />,
};
