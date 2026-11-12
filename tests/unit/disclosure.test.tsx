import * as React from "react";
import { describe, expect, it, onTestFinished } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { DataTable, Disclosure, RowAction, useExpanded, type Column } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { bookings, firings, type Booking } from "../../stories/fixtures/kiln";
import { firingWorkServerError, manyBookings } from "../../stories/mocks/handlers";
import { FiringHistoryScreen, FiringWork } from "../../stories/screens/firing-history";
import { server } from "../utils/server";

/** Counts requests for one firing's work, through the real handlers. */
function countWorkRequests() {
  const seen: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    const path = new URL(request.url).pathname;
    if (path.endsWith("/work")) seen.push(path);
  };
  server.events.on("request:start", listener);
  return { seen, stop: () => server.events.removeListener("request:start", listener) };
}

const f = firings[0];

describe("Disclosure", () => {
  it("is a button with aria-expanded, named by its summary, that opens and closes in place", async () => {
    const user = userEvent.setup();
    renderWithStrata(
      <Disclosure summary="Glaze firing in kiln 2">
        <p>Six pieces</p>
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: "Glaze firing in kiln 2" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-controls");
    expect(screen.queryByText("Six pieces")).not.toBeInTheDocument();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const body = screen.getByText("Six pieces").parentElement!;
    expect(button).toHaveAttribute("aria-controls", body.id);

    // Keyboard: focus stays on the button, Enter and Space toggle it.
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" ");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveFocus();
  });

  it("mounts its body only while open, so the body's request runs on first open and not before", async () => {
    const user = userEvent.setup();
    const requests = countWorkRequests();
    renderWithStrata(
      <Disclosure summary="Firing 412">
        <FiringWork firing={f} />
      </Disclosure>,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(requests.seen).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Firing 412" }));
    expect(await screen.findByRole("list", { name: /Work in/ })).toBeInTheDocument();
    expect(requests.seen).toEqual([`/api/firings/${f.id}/work`]);

    // Closed: nothing of the body is left. Reopened within the stale time: the cache answers.
    await user.click(screen.getByRole("button", { name: "Firing 412" }));
    expect(screen.queryByRole("list", { name: /Work in/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Firing 412" }));
    expect(screen.getByRole("list", { name: /Work in/ })).toBeInTheDocument();
    expect(requests.seen).toHaveLength(1);
    requests.stop();
  });

  it("shows the body's own error inside it, with Try again", async () => {
    server.use(firingWorkServerError);
    renderWithStrata(
      <Disclosure summary="Firing 412" defaultOpen>
        <FiringWork firing={f} />
      </Disclosure>,
    );
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Firing 412" })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps actions outside the summary's button", () => {
    renderWithStrata(<Disclosure summary="Firing 412" actions={<RowAction label="Archive" subject="firing 412" />}>body</Disclosure>);
    const toggle = screen.getByRole("button", { name: "Firing 412" });
    const action = screen.getByRole("button", { name: "Archive firing 412" });
    expect(toggle).not.toContainElement(action);
  });

  it("is controlled by open and onOpenChange", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <Disclosure summary="Firing" open={open} onOpenChange={setOpen}>
            body
          </Disclosure>
          <p>{open ? "is open" : "is closed"}</p>
        </>
      );
    }
    renderWithStrata(<Controlled />);
    expect(screen.getByText("is open")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Firing" }));
    expect(screen.getByText("is closed")).toBeInTheDocument();
  });
});

describe("useExpanded", () => {
  function List({ single }: { single?: boolean }) {
    const expanded = useExpanded({ param: "open", single });
    const { search } = useLocation();
    return (
      <>
        {["a", "b", "c"].map((k) => (
          <Disclosure key={k} summary={`Item ${k}`} open={expanded.isOpen(k)} onOpenChange={(o) => expanded.setOpen(k, o)}>
            Body {k}
          </Disclosure>
        ))}
        <button type="button" onClick={expanded.collapseAll}>
          Collapse all
        </button>
        <p data-testid="search">{search}</p>
      </>
    );
  }

  it("reads and writes the open keys in the URL, one parameter per key", async () => {
    const user = userEvent.setup();
    renderWithStrata(<List />, { route: "/?open=b" });
    expect(screen.getByText("Body b")).toBeInTheDocument();
    expect(screen.queryByText("Body a")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Item a" }));
    expect(screen.getByTestId("search")).toHaveTextContent("?open=b&open=a");
    expect(screen.getByText("Body a")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.getByTestId("search")).toBeEmptyDOMElement();
  });

  it("with single, opening one closes the others", async () => {
    const user = userEvent.setup();
    renderWithStrata(<List single />, { route: "/?open=b" });
    await user.click(screen.getByRole("button", { name: "Item c" }));
    expect(screen.getByText("Body c")).toBeInTheDocument();
    expect(screen.queryByText("Body b")).not.toBeInTheDocument();
  });

  it("keeps the state locally without a param", async () => {
    const user = userEvent.setup();
    function Local() {
      const expanded = useExpanded({ initial: ["a"] });
      return (
        <Disclosure summary="Item a" open={expanded.isOpen("a")} onOpenChange={(o) => expanded.setOpen("a", o)}>
          Body a
        </Disclosure>
      );
    }
    renderWithStrata(<Local />);
    expect(screen.getByText("Body a")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Item a" }));
    expect(screen.queryByText("Body a")).not.toBeInTheDocument();
  });
});

describe("DataTable expansion", () => {
  const columns: Column<Booking>[] = [
    { key: "member", header: "Member", cell: (b) => b.member },
    { key: "pieces", header: "Pieces", cell: (b) => b.pieces, numeric: true },
  ];

  function Table({ rows = bookings, route }: { rows?: Booking[]; route?: string }) {
    const expanded = useExpanded(route ? { param: "open" } : {});
    return (
      <DataTable
        caption="Work"
        columns={columns}
        rows={rows}
        rowKey={(b) => b.id}
        expansion={{
          ...expanded,
          rowLabel: (b) => `Details of ${b.member}'s booking`,
          detail: (b) => <p>Out {b.out}</p>,
          isExpandable: (b) => b.state !== "ready",
        }}
      />
    );
  }

  it("names each toggle for its row, opens a detail row under it spanning the data columns, and toggles back", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Table />);
    const toggle = screen.getByRole("button", { name: "Details of Tom Ellery's booking" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Out Today/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const cell = screen.getByText("Out Today, about 14:50").closest("td")!;
    expect(cell).toHaveAttribute("colspan", "2");
    // The detail row comes straight after its row.
    const row = toggle.closest("tr")!;
    expect(row.nextElementSibling).toBe(cell.closest("tr"));

    await user.click(toggle);
    expect(screen.queryByText("Out Today, about 14:50")).not.toBeInTheDocument();
  });

  it("gives rows with nothing to show no toggle, and the toggle column a header for screen readers", () => {
    renderWithStrata(<Table />);
    expect(screen.queryByRole("button", { name: "Details of Joe Pryce's booking" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Details" })).toBeInTheDocument();
  });

  it("opens the rows the URL names", () => {
    renderWithStrata(<Table route="open" />, { route: "/?open=b-2041" });
    expect(screen.getByRole("button", { name: "Details of Priya Natarajan's booking" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Out Today, about 14:50")).toBeInTheDocument();
  });

  it("with useExpanded({ single }), opening a row closes the open one", async () => {
    const user = userEvent.setup();
    function Single() {
      const expanded = useExpanded({ initial: ["b-2041"], single: true });
      return (
        <DataTable
          caption="Work"
          columns={columns}
          rows={bookings}
          rowKey={(b) => b.id}
          expansion={{ ...expanded, rowLabel: (b) => `Details of ${b.member}'s booking`, detail: (b) => <p>Detail {b.member}</p> }}
        />
      );
    }
    renderWithStrata(<Single />);
    expect(screen.getByText("Detail Priya Natarajan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details of Tom Ellery's booking" }));
    expect(screen.getByText("Detail Tom Ellery")).toBeInTheDocument();
    expect(screen.queryByText("Detail Priya Natarajan")).not.toBeInTheDocument();
  });

  // React Aria's Virtualizer measures a row of unknown height by its scroll size, which jsdom does not
  // do (0, so every row would count as visible). Give rows one: 41px, like a drawn row.
  function withRowSize() {
    const before = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
    Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get: () => 41 });
    return () => {
      if (before) Object.defineProperty(Element.prototype, "scrollHeight", before);
      else delete (Element.prototype as unknown as Record<string, unknown>).scrollHeight;
    };
  }

  it("keeps each line's place in a virtualised table when a detail above it closes", async () => {
    const undo = withRowSize();
    onTestFinished(undo);
    const user = userEvent.setup();
    renderWithStrata(<Table rows={manyBookings} />);
    const toggles = () => screen.getAllByRole("button", { name: /^Details of/ });
    await user.click(toggles()[0]);
    await user.click(toggles()[0]);
    // Every rendered line is a row again, each with its own toggle, and the count is back.
    expect(screen.getByRole("grid", { name: "Work" })).toHaveAttribute("aria-rowcount", String(manyBookings.length + 1));
    expect(screen.queryByText(/^Out /)).not.toBeInTheDocument();
  });

  it("counts detail rows in a virtualised table's row count", async () => {
    onTestFinished(withRowSize());
    const user = userEvent.setup();
    renderWithStrata(<Table rows={manyBookings} />);
    const table = screen.getByRole("grid", { name: "Work" });
    expect(table).toHaveAttribute("aria-rowcount", String(manyBookings.length + 1));
    await user.click(screen.getAllByRole("button", { name: /^Details of/ })[0]);
    expect(table).toHaveAttribute("aria-rowcount", String(manyBookings.length + 2));
  });

  it("makes the open firing's request only, on the history screen", async () => {
    const requests = countWorkRequests();
    renderWithStrata(<FiringHistoryScreen />, { route: "/firings?open=f-0411" });
    expect(await screen.findByRole("list", { name: /Work in/ })).toBeInTheDocument();
    await waitFor(() => expect(requests.seen).toEqual(["/api/firings/f-0411/work"]));
    requests.stop();
  });
});
