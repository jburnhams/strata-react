import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useLocation } from "react-router";
import { DataTable, DataView, EmptyState, TableSkeleton, fetchJson, useLoad, type Column } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";
import { api, bookingsEmpty, bookingsServerError, manyBookings } from "../../stories/mocks/handlers";
import { bookings, type Booking } from "../../stories/fixtures/kiln";

const columns: Column<Booking>[] = [
  { key: "member", header: "Member", cell: (b) => b.member, sort: (a, b) => a.member.localeCompare(b.member) },
  { key: "pieces", header: "Pieces", cell: (b) => b.pieces, numeric: true, sort: (a, b) => a.pieces - b.pieces },
];

function Bookings() {
  const load = useLoad({ queryKey: ["bookings"], queryFn: () => fetchJson<Booking[]>(api.bookings) });
  return (
    <DataView
      state={load}
      isEmpty={(rows) => rows.length === 0}
      skeleton={<TableSkeleton />}
      empty={<EmptyState title="All three kilns are cold" />}
    >
      {(rows) => <DataTable caption="Work in the kilns" columns={columns} rows={rows} rowKey={(b) => b.id} />}
    </DataView>
  );
}

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("DataView fed by TanStack Query (served by MSW)", () => {
  it("shows the skeleton, then the rows", async () => {
    const { container } = renderWithStrata(<Bookings />);
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(await screen.findByRole("table", { name: "Work in the kilns" })).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(bookings.length);
  });

  it("shows the empty state for an empty list", async () => {
    server.use(bookingsEmpty);
    renderWithStrata(<Bookings />);
    expect(await screen.findByText("All three kilns are cold")).toBeInTheDocument();
  });

  it("explains a server error and retries on Try again", async () => {
    server.use(bookingsServerError);
    renderWithStrata(<Bookings />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The server could not answer (503). Nothing was changed.");
    server.use(http.get(api.bookings, () => HttpResponse.json(bookings.slice(0, 2))));
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
  });
});

describe("DataTable", () => {
  it("sorts by a header button and says which way with aria-sort", async () => {
    renderWithStrata(<DataTable caption="Work" columns={columns} rows={bookings} rowKey={(b) => b.id} />);
    const header = screen.getByRole("columnheader", { name: /Pieces/ });
    expect(header).not.toHaveAttribute("aria-sort");
    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(bodyRows()[0]).getByText("2")).toBeInTheDocument();
    await userEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(within(bodyRows()[0]).getByText("11")).toBeInTheDocument();
  });

  it("keeps the sort in the URL with sortParam", async () => {
    function Search() {
      return <output data-testid="search">{useLocation().search}</output>;
    }
    renderWithStrata(
      <>
        <DataTable caption="Work" columns={columns} rows={bookings} rowKey={(b) => b.id} sortParam="sort" />
        <Search />
      </>,
      { route: "/bookings?sort=member.desc" },
    );
    expect(screen.getByRole("columnheader", { name: /Member/ })).toHaveAttribute("aria-sort", "descending");
    expect(within(bodyRows()[0]).getByText("Tom Ellery")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("columnheader", { name: /Pieces/ })).getByRole("button"));
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=pieces.asc");
  });

  it("renders only the visible rows of a long table (TanStack Virtual)", () => {
    renderWithStrata(<DataTable caption="Many" columns={columns} rows={manyBookings} rowKey={(b) => b.id} maxHeight={280} />);
    const rendered = bodyRows().filter((r) => r.getAttribute("aria-hidden") !== "true");
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(40);
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", String(manyBookings.length + 1));
  });

  it("renders every row of a short table", () => {
    renderWithStrata(<DataTable caption="Few" columns={columns} rows={bookings} rowKey={(b) => b.id} />);
    expect(bodyRows()).toHaveLength(bookings.length);
  });
});
