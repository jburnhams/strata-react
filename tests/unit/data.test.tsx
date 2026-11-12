import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useLocation } from "react-router";
import { DataTable, DataView, EmptyState, StaleNotice, TableSkeleton, fetchJson, format, useLoad, type Column, type Load } from "../../src";
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

const bodyRows = () => within(screen.getByRole("grid")).getAllByRole("row").slice(1);

describe("DataView fed by TanStack Query (served by MSW)", () => {
  it("shows the skeleton, then the rows", async () => {
    const { container } = renderWithStrata(<Bookings />);
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(await screen.findByRole("grid", { name: "Work in the kilns" })).toBeInTheDocument();
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

describe("a refresh that fails after a good read (issue #26)", () => {
  it("keeps the rows, says why and how old they are, and clears on Try again", async () => {
    const { client } = renderWithStrata(<Bookings />);
    await screen.findByRole("grid", { name: "Work in the kilns" });
    const readAt = new Date(client.getQueryState(["bookings"])!.dataUpdatedAt);

    server.use(bookingsServerError);
    await act(() => client.refetchQueries({ queryKey: ["bookings"] }));

    const notice = await screen.findByRole("status");
    // The data stays; no error panel replaces it.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(bodyRows()).toHaveLength(bookings.length);
    expect(notice).toHaveTextContent("The server could not answer (503). Nothing was changed.");
    expect(notice).toHaveTextContent(`Showing data from ${format.clock.format(readAt)}.`);

    server.use(http.get(api.bookings, () => HttpResponse.json(bookings.slice(0, 2))));
    await userEvent.click(within(notice).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(2));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("still shows the error panel when the first read fails", async () => {
    server.use(bookingsServerError);
    renderWithStrata(<Bookings />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The server could not answer (503).");
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("shows the notice over an empty state too, and takes the product's words", () => {
    const load: Load<Booking[]> = {
      status: "ready",
      data: [],
      stale: { message: "Kiln 2's controller is not answering.", readAt: new Date(2026, 10, 7, 13, 50), retry: () => undefined, retrying: true },
    };
    render(
      <DataView
        state={load}
        isEmpty={(rows) => rows.length === 0}
        skeleton={<TableSkeleton />}
        empty={<EmptyState title="All three kilns are cold" />}
        staleNotice={(stale) => <StaleNotice stale={stale} shown={(when) => `Readings from ${when}.`} />}
      >
        {() => null}
      </DataView>,
    );
    expect(screen.getByText("All three kilns are cold")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`Kiln 2's controller is not answering. Readings from ${format.shortDay.format(load.stale!.readAt)}.`);
    // A fetch on its way: the button says so and cannot be pressed twice.
    expect(screen.getByRole("button", { name: "Trying again…" })).toBeDisabled();
  });

  it("names the day when the data was not read today", () => {
    const readAt = new Date(2026, 0, 5, 9, 30);
    render(<StaleNotice stale={{ message: "The server could not answer (503).", readAt, retry: () => undefined }} />);
    expect(screen.getByRole("status")).toHaveTextContent(`Showing data from ${format.shortDay.format(readAt)}.`);
  });
});

describe("DataTable", () => {
  it("sorts by clicking a header and says which way with aria-sort", async () => {
    renderWithStrata(<DataTable caption="Work" columns={columns} rows={bookings} rowKey={(b) => b.id} />);
    const header = screen.getByRole("columnheader", { name: /Pieces/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(within(bodyRows()[0]).getByText("2")).toBeInTheDocument();
    await userEvent.click(header);
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
    await userEvent.click(screen.getByRole("columnheader", { name: /Pieces/ }));
    expect(screen.getByTestId("search")).toHaveTextContent("?sort=pieces.asc");
  });

  it("renders only the visible rows of a long table (React Aria's Virtualizer)", () => {
    renderWithStrata(<DataTable caption="Many" columns={columns} rows={manyBookings} rowKey={(b) => b.id} maxHeight={280} />);
    const rendered = bodyRows().filter((r) => r.getAttribute("aria-hidden") !== "true");
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(40);
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", String(manyBookings.length + 1));
  });

  it("renders every row of a short table", () => {
    renderWithStrata(<DataTable caption="Few" columns={columns} rows={bookings} rowKey={(b) => b.id} />);
    expect(bodyRows()).toHaveLength(bookings.length);
  });
});
