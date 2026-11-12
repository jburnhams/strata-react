import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Button, EmptyState, InfiniteList, VirtualList, Skeleton, UndoBar, fetchJson, useInfiniteLoad, useUndoable, type InfiniteLoad } from "../../src";
import { installFakeIntersectionObserver, renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";
import { api, firingPage, firingsEmpty, firingsLaterPageError, firingsServerError, type FiringPage } from "../../stories/mocks/handlers";
import { firings, type Firing } from "../../stories/fixtures/kiln";

let io: ReturnType<typeof installFakeIntersectionObserver>;
beforeEach(() => {
  io = installFakeIntersectionObserver();
});
afterEach(() => io.uninstall());

let exposed: InfiniteLoad<Firing> | undefined;

function FiringLog({ limit = 20, keepAtLeast, filter = "all" }: { limit?: number; keepAtLeast?: number; filter?: string }) {
  const load = useInfiniteLoad({
    queryKey: ["firings", limit, filter],
    queryFn: ({ cursor, signal }) =>
      fetchJson<FiringPage>(`${api.firings}?limit=${limit}${cursor ? `&after=${cursor}` : ""}`, { signal }),
    items: (page) => page.firings,
    itemKey: (f) => f.id,
    hasMore: (page) => page.hasMore,
  });
  exposed = load;
  return (
    <InfiniteList
      state={load}
      label="Firing log"
      moreLabel="Show older firings"
      skeleton={<Skeleton className="h-10" />}
      empty={<EmptyState title="No firings yet" action={<Button>Book a firing</Button>} />}
      end="That is every firing since March."
      keepAtLeast={keepAtLeast}
    >
      {(f) => <span>Firing {f.id}</span>}
    </InfiniteList>
  );
}

/** Records the `after` cursor of every firings request. */
function recordCursors() {
  const cursors: (string | null)[] = [];
  server.use(
    http.get(api.firings, ({ request }) => {
      cursors.push(new URL(request.url).searchParams.get("after"));
      return HttpResponse.json(firingPage(request.url));
    }),
  );
  return cursors;
}

// Rows are a grid's rows (React Aria's GridList); the footer is one more row, so count the items by `data-index`.
const rows = () => [...screen.getByRole("grid", { name: "Firing log" }).querySelectorAll("[data-index]")];

describe("useInfiniteLoad + InfiniteList (served by MSW)", () => {
  it("keeps the held items when a refetch fails, with a stale notice rather than a page error", async () => {
    const { client } = renderWithStrata(<FiringLog />);
    await screen.findByText("Firing f-0412");
    server.use(firingsServerError);
    await act(() => client.refetchQueries({ queryKey: ["firings"] }));
    expect(await screen.findByText(/Showing data from/)).toBeInTheDocument();
    expect(rows()).toHaveLength(20);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(exposed?.status === "ready" && exposed.stale?.message).toBe("The server could not answer (503). Nothing was changed.");
    expect(exposed?.more.error).toBeUndefined();
  });

  it("reports a failed next page as more.error, not as stale data", async () => {
    server.use(firingsLaterPageError);
    renderWithStrata(<FiringLog />);
    await screen.findByText("Firing f-0412");
    io.scrollToEnd();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(exposed?.status === "ready" && exposed.stale).toBeUndefined();
  });

  it("shows the skeleton, then the first page with a Show more button", async () => {
    const { container } = renderWithStrata(<FiringLog />);
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(await screen.findByText("Firing f-0412")).toBeInTheDocument();
    expect(rows()).toHaveLength(20);
    expect(screen.getByRole("button", { name: "Show older firings" })).toBeInTheDocument();
  });

  it("watches the sentinel within its scroll region, with a root margin", async () => {
    renderWithStrata(<FiringLog />);
    await screen.findByText("Firing f-0412");
    const [observer] = [...io.observers];
    expect(observer.options.rootMargin).toBe("400px");
    expect(observer.options.root).toBe(screen.getByRole("grid", { name: "Firing log" }));
  });

  it("loads the next page when the end comes near, with the cursor after the last item held", async () => {
    const cursors = recordCursors();
    renderWithStrata(<FiringLog />);
    await screen.findByText("Firing f-0412");
    expect(io.scrollToEnd()).toBe(1);
    await waitFor(() => expect(rows().length).toBeGreaterThanOrEqual(40));
    expect(cursors.slice(0, 2)).toEqual([null, "f-0393"]);
  });

  it("keeps loading while the end stays in view, and says when it is all", async () => {
    renderWithStrata(<FiringLog limit={50} />);
    await screen.findByText("Firing f-0412");
    // The end stays in view, so each landed page asks for the next until the last. A virtualised list
    // redraws its next-page row as it changes height, which gives the sentinel a new element that a
    // real IntersectionObserver reports at once; the stand-in reports only when told, so tell it.
    await waitFor(() => {
      io.scrollToEnd();
      expect(screen.getByText("That is every firing since March.")).toBeInTheDocument();
    });
    expect(exposed?.status === "ready" && exposed.data).toHaveLength(firings.length);
    expect(screen.queryByRole("button", { name: "Show older firings" })).toBeNull();
  });

  it("moves the cursor back when the last item held is dismissed, and never shows it twice", async () => {
    const cursors = recordCursors();
    renderWithStrata(<FiringLog />);
    await screen.findByText("Firing f-0393");
    // f-0393 was answered elsewhere but the server has not caught up: it comes back in page 2.
    exposed!.dismiss("f-0393");
    await waitFor(() => expect(screen.queryByText("Firing f-0393")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    await screen.findByText("Firing f-0374");
    expect(cursors).toEqual([null, "f-0394"]);
    expect(screen.queryByText("Firing f-0393")).toBeNull();
    exposed!.restore("f-0393");
    expect(await screen.findAllByText("Firing f-0393")).toHaveLength(1);
  });

  it("moves focus to the first new item after Show more", async () => {
    renderWithStrata(<FiringLog />);
    await userEvent.click(await screen.findByRole("button", { name: "Show older firings" }));
    await waitFor(() => expect(rows()[20]).toHaveFocus());
    expect(rows()[20]).toHaveTextContent("Firing f-0392");
  });

  it("keeps the items when a later page fails, says why, and retries on Try again", async () => {
    server.use(firingsLaterPageError);
    renderWithStrata(<FiringLog />);
    await screen.findByText("Firing f-0412");
    io.scrollToEnd();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The server could not answer (503). Nothing was changed.");
    expect(rows()).toHaveLength(20);
    // No sentinel while failed, so nothing asks again on its own.
    expect(io.scrollToEnd()).toBe(0);
    server.resetHandlers();
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rows()).toHaveLength(40));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rows()[20]).toHaveFocus();
  });

  it("refills a worked-through queue below keepAtLeast without scrolling", async () => {
    renderWithStrata(<FiringLog limit={5} keepAtLeast={4} />);
    await screen.findByText("Firing f-0412");
    expect(rows()).toHaveLength(5);
    for (const id of ["f-0412", "f-0411"]) exposed!.dismiss(id);
    await waitFor(() => expect(rows()).toHaveLength(8));
  });

  it("keeps the call-site className on a short list that has a footer", () => {
    renderWithStrata(
      <VirtualList label="Short" items={["a", "b"]} itemKey={(x) => x} footer={<span>End</span>} className="w-1/2">
        {(x) => <span>{x}</span>}
      </VirtualList>,
    );
    expect(screen.getByRole("grid", { name: "Short" })).toHaveClass("w-1/2");
  });

  it("keeps paging when every item held is dismissed, going after the last one seen", async () => {
    const cursors = recordCursors();
    renderWithStrata(<FiringLog limit={1} />);
    await screen.findByText("Firing f-0412");
    exposed!.dismiss("f-0412");
    await waitFor(() => expect(screen.queryByText("Firing f-0412")).toBeNull());
    expect(screen.queryByText("No firings yet")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    expect(await screen.findByText("Firing f-0411")).toBeInTheDocument();
    expect(cursors).toEqual([null, "f-0412"]);
  });

  it("does not ask for the same page twice when a page brings back only dismissed items", async () => {
    // The server has not caught up with the dismissals yet: it keeps serving them.
    const cursors = recordCursors();
    renderWithStrata(<FiringLog limit={3} />);
    await screen.findByText("Firing f-0410");
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    await screen.findByText("Firing f-0407");
    for (const id of ["f-0409", "f-0408", "f-0407"]) exposed!.dismiss(id);
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    await waitFor(() => expect(cursors).toHaveLength(3));
    // After f-0410 (the last held) the server sends f-0409..f-0407 again: nothing new.
    expect(cursors[2]).toBe("f-0410");
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    expect(await screen.findByText("Firing f-0406")).toBeInTheDocument();
    expect(cursors[3]).toBe("f-0407");
  });

  it("hides what useUndoable removes, moves the cursor past it, and brings it back on Undo", async () => {
    const cursors = recordCursors();
    function Archive() {
      const undoable = useUndoable();
      const load = useInfiniteLoad({
        queryKey: ["firings", "archive"],
        queryFn: ({ cursor, signal }) => fetchJson<FiringPage>(`${api.firings}?limit=20${cursor ? `&after=${cursor}` : ""}`, { signal }),
        items: (page) => page.firings,
        itemKey: (f) => f.id,
        hasMore: (page) => page.hasMore,
        isRemoved: undoable.isRemoved,
      });
      return (
        <>
          <InfiniteList state={load} label="Firing log" moreLabel="Show older firings" skeleton={<Skeleton className="h-10" />} empty={<EmptyState title="No firings yet" />}>
            {(f) => (
              <Button onClick={() => undoable.schedule({ id: f.id, message: `Archived ${f.id}.`, failure: `${f.id} is back.`, commit: () => undefined })}>
                Archive {f.id}
              </Button>
            )}
          </InfiniteList>
          <UndoBar undoable={undoable} inline />
        </>
      );
    }
    renderWithStrata(<Archive />);
    await userEvent.click(await screen.findByRole("button", { name: "Archive f-0393" }));
    expect(screen.queryByRole("button", { name: "Archive f-0393" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show older firings" }));
    await screen.findByRole("button", { name: "Archive f-0374" });
    expect(cursors).toEqual([null, "f-0394"]);
    expect(screen.queryByRole("button", { name: "Archive f-0393" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Archive f-0393" })).toBeInTheDocument();
  });

  it("forgets dismissals when the query changes", async () => {
    const { rerender } = renderWithStrata(<FiringLog filter="all" />);
    await screen.findByText("Firing f-0412");
    exposed!.dismiss("f-0412");
    await waitFor(() => expect(screen.queryByText("Firing f-0412")).toBeNull());
    rerender(<FiringLog filter="kiln-2" />);
    expect(await screen.findByText("Firing f-0412")).toBeInTheDocument();
  });

  it("shows the empty state when the first page is empty and there are no more", async () => {
    server.use(firingsEmpty);
    renderWithStrata(<FiringLog />);
    expect(await screen.findByText("No firings yet")).toBeInTheDocument();
  });

  it("fails the list only when the first page fails", async () => {
    server.use(firingsServerError);
    renderWithStrata(<FiringLog />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The server could not answer (503).");
    server.resetHandlers();
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rows()).toHaveLength(20));
  });
});
