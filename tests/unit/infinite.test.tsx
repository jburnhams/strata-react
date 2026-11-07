import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { Button, EmptyState, InfiniteList, Skeleton, fetchJson, useInfiniteLoad, type InfiniteLoad } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";
import { installFakeIntersectionObserver } from "../utils/intersection";
import { api, firingPage, firingsEmpty, firingsLaterPageError, firingsServerError, type FiringPage } from "../../stories/mocks/handlers";
import { firings, type Firing } from "../../stories/fixtures/kiln";

let io: ReturnType<typeof installFakeIntersectionObserver>;
beforeEach(() => {
  io = installFakeIntersectionObserver();
});
afterEach(() => io.uninstall());

let exposed: InfiniteLoad<Firing> | undefined;

function FiringLog({ limit = 20, keepAtLeast }: { limit?: number; keepAtLeast?: number }) {
  const load = useInfiniteLoad({
    queryKey: ["firings", limit],
    queryFn: ({ cursor, signal }) =>
      fetchJson<FiringPage>(`${api.firings}?limit=${limit}${cursor ? `&after=${cursor}` : ""}`, { signal }),
    items: (page) => page.firings,
    itemKey: (f) => f.id,
    nextCursor: (page, held) => (page.hasMore ? held.at(-1)?.id : undefined),
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

const rows = () => within(screen.getByRole("list", { name: "Firing log" })).getAllByRole("listitem");

describe("useInfiniteLoad + InfiniteList (served by MSW)", () => {
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
    expect(observer.options.root).toBe(screen.getByRole("region", { name: "Firing log" }));
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
    io.scrollToEnd();
    // The sentinel never leaves view, so each landed page asks for the next until the last.
    expect(await screen.findByText("That is every firing since March.")).toBeInTheDocument();
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
