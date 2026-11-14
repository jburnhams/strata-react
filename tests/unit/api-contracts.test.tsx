import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { HttpError, apiPage, errorPayload, fetchJson, isTaskRunning, readErrorBody, useInfiniteLoad, type ApiPage } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { server } from "../utils/server";

// Issue #263, the parts that need no generator: the shared contract's shapes
// (`strata_python.contracts`: Page, Task, ErrorBody) meeting the hooks they were made for.

describe("isTaskRunning", () => {
  const FINISHED = new Set(["done", "failed", "cancelled"]);
  it("is running while the state is not a finished one, with a set or a list", () => {
    expect(isTaskRunning({ state: "running" }, FINISHED)).toBe(true);
    expect(isTaskRunning({ state: "queued" }, FINISHED)).toBe(true);
    expect(isTaskRunning({ state: "done" }, FINISHED)).toBe(false);
    expect(isTaskRunning({ state: "failed" }, [...FINISHED])).toBe(false);
  });
});

describe("the error body's payload", () => {
  it("is kept beside the reason and read typed", () => {
    const body = { detail: "A firing is already running.", payload: { running: "f-0412" } };
    expect(readErrorBody(body)).toEqual({ reason: "A firing is already running.", payload: { running: "f-0412" } });
    const error = new HttpError(409, "Conflict", "/api/firings", body);
    expect(error.reason).toBe("A firing is already running.");
    expect(errorPayload<{ running: string }>(error)).toEqual({ running: "f-0412" });
    expect(errorPayload(new Error("x"))).toBeUndefined();
    expect(readErrorBody({ detail: "No." })).toEqual({ reason: "No." });
  });

  it("reaches the app from a real 409 through fetchJson", async () => {
    server.use(http.get("/api/start", () => HttpResponse.json({ detail: "Busy.", payload: { running: "f-1" } }, { status: 409 })));
    const error = await fetchJson("/api/start").catch((e: unknown) => e);
    expect(errorPayload<{ running: string }>(error)?.running).toBe("f-1");
  });
});

type Item = { id: string };
function Pages() {
  const load = useInfiniteLoad({
    queryKey: ["contract-pages"],
    queryFn: ({ cursor, signal }) => fetchJson<ApiPage<Item>>(`/api/items${cursor ? `?after=${cursor}` : ""}`, { signal }),
    itemKey: (i: Item) => i.id,
    ...apiPage<Item>(),
  });
  return (
    <>
      <p data-testid="ids">{load.status === "ready" ? load.data.map((i) => i.id).join(",") : load.status}</p>
      <button disabled={!load.more.hasMore} onClick={load.more.loadMore}>More</button>
    </>
  );
}

describe("apiPage", () => {
  it("pages by the server's own next cursor and stops when it is null", async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get("/api/items", ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        seen.push(after);
        return HttpResponse.json(after === null ? { items: [{ id: "a" }, { id: "b" }], next: "cursor-1", total: 3 } : { items: [{ id: "c" }], next: null, total: 3 });
      }),
    );
    renderWithStrata(<Pages />);
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a,b"));
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a,b,c"));
    expect(seen).toEqual([null, "cursor-1"]); // the server's cursor, not the last item's id
    expect(screen.getByRole("button", { name: "More" })).toBeDisabled();
  });
});
