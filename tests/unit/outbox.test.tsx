import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createOutbox, format, OutboxStatus, type OutboxItem } from "../../src";
import { server } from "../utils/server";

// The outbox sends through the real fetchJson to MSW, which plays the server: up, down, refusing.
type Seen = { id: string; body: unknown };

function serve(answer: (body: { id: string }) => Response | Promise<Response> = () => HttpResponse.json({ ok: true })) {
  const seen: Seen[] = [];
  server.use(
    http.post("/api/answers", async ({ request }) => {
      const body = (await request.json()) as { id: string };
      seen.push({ id: body.id, body });
      return answer(body);
    }),
  );
  return seen;
}

const answer = (id: string, after?: string) => ({ method: "POST" as const, path: "/api/answers", json: { id }, id, after, label: `Answer ${id}` });

afterEach(() => window.localStorage.clear());

describe("createOutbox", () => {
  it("sends writes oldest first, one at a time, and keeps none once sent", async () => {
    const seen = serve();
    const box = createOutbox({ name: "t1" });
    const a = box.add(answer("a"));
    const b = box.add(answer("b"));
    expect(await a.delivered).toBe("sent");
    expect(await b.delivered).toBe("sent");
    expect(seen.map((s) => s.id)).toEqual(["a", "b"]);
    expect(box.snapshot()).toMatchObject({ waiting: 0, refused: [], problem: null, persisted: true });
    expect(JSON.parse(window.localStorage.getItem("strata:outbox:t1") ?? "{}")).toEqual({ items: [], refused: [] });
  });

  it("keeps a write the server could not take, says why, and sends it once the server is back", async () => {
    let up = false;
    const seen = serve(() => (up ? HttpResponse.json({ ok: true }) : HttpResponse.error()));
    const box = createOutbox({ name: "t2", retryMs: 60_000 });
    expect(await box.add(answer("a")).delivered).toBe("waiting");
    expect(await box.add(answer("b")).delivered).toBe("waiting");
    const s = box.snapshot();
    expect(s).toMatchObject({ waiting: 2, problem: "The server could not be reached." });
    expect(s.retryAt).toBeInstanceOf(Date);
    // Kept in storage: a reload finds them.
    const kept = JSON.parse(window.localStorage.getItem("strata:outbox:t2") ?? "{}") as { items: OutboxItem[] };
    expect(kept.items.map((x) => x.id)).toEqual(["a", "b"]);
    up = true;
    await box.flush();
    expect(box.snapshot()).toMatchObject({ waiting: 0, problem: null, retryAt: null });
    expect(seen.filter((x) => x.id === "a").length).toBeGreaterThan(1); // tried, failed, tried again
    expect(seen.at(-1)?.id).toBe("b");
  });

  it("treats a 5xx and a login's 401 as waiting, never refused", async () => {
    let status = 503;
    serve(() => HttpResponse.json({ detail: "Restarting" }, { status }));
    const box = createOutbox({ name: "t3", retryMs: 60_000 });
    expect(await box.add(answer("a")).delivered).toBe("waiting");
    expect(box.snapshot().problem).toBe("Restarting");
    status = 401;
    await box.flush();
    expect(box.snapshot()).toMatchObject({ waiting: 1, refused: [], problem: "Sign in again to send them." });
  });

  it("lists a refused write with the server's reason, refuses what follows it, and goes on to the rest", async () => {
    const seen = serve(({ id }) => (id === "a" ? HttpResponse.json({ detail: "That round is no longer kept." }, { status: 400 }) : HttpResponse.json({ ok: true })));
    const box = createOutbox({ name: "t4" });
    const a = box.add(answer("a"));
    const rating = box.add(answer("r", "a"));
    const b = box.add(answer("b"));
    expect(await a.delivered).toBe("refused");
    expect(await rating.delivered).toBe("refused");
    expect(await b.delivered).toBe("sent");
    expect(seen.map((s) => s.id)).toEqual(["a", "b"]); // the dependent one is never sent
    const { refused } = box.snapshot();
    expect(refused.map((r) => [r.id, r.label, r.reason])).toEqual([
      ["a", "Answer a", "That round is no longer kept."],
      ["r", "Answer r", "Not sent, as what it follows was refused: That round is no longer kept."],
    ]);
    box.dismiss("a");
    expect(box.snapshot().refused.map((r) => r.id)).toEqual(["r"]);
    box.dismiss();
    expect(box.snapshot().refused).toEqual([]);
  });

  it("a reopened page sends what an earlier one left, when started", async () => {
    serve(() => HttpResponse.error());
    const first = createOutbox({ name: "t5", retryMs: 60_000 });
    await first.add(answer("a")).delivered;
    const seen = serve();
    const again = createOutbox({ name: "t5" });
    expect(again.snapshot().waiting).toBe(1);
    const stop = again.start();
    await again.flush();
    stop();
    first.start()(); // started and stopped: clears its retry timer
    expect(seen.map((s) => s.id)).toEqual(["a"]);
    expect(again.snapshot().waiting).toBe(0);
  });

  it("sends again when the browser says it is back online", async () => {
    let up = false;
    const seen = serve(() => (up ? HttpResponse.json({ ok: true }) : HttpResponse.error()));
    const box = createOutbox({ name: "t6", retryMs: 60_000 });
    const stop = box.start();
    await box.add(answer("a")).delivered;
    up = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await box.flush();
    });
    stop();
    expect(seen.map((s) => s.id)).toEqual(["a", "a"]);
    expect(box.snapshot().waiting).toBe(0);
  });

  it("keeps writes in memory, and says so, when the browser gives no storage", async () => {
    serve(() => HttpResponse.error());
    const box = createOutbox({ name: "t7", storage: null, retryMs: 60_000 });
    await box.add(answer("a")).delivered;
    expect(box.snapshot()).toMatchObject({ waiting: 1, persisted: false });
    expect(window.localStorage.getItem("strata:outbox:t7")).toBeNull();
  });

  it("does not queue the same id twice", async () => {
    serve(() => HttpResponse.error());
    const box = createOutbox({ name: "t8", retryMs: 60_000 });
    await box.add(answer("a")).delivered;
    await box.add(answer("a")).delivered;
    expect(box.snapshot().waiting).toBe(1);
  });

  it("settles a write another tab sent", async () => {
    serve(() => HttpResponse.error());
    const box = createOutbox({ name: "t9", retryMs: 60_000 });
    const stop = box.start();
    await box.add(answer("a")).delivered;
    const again = box.add(answer("b"));
    await again.delivered;
    // Another tab sent both and wrote the queue back empty, refusing b.
    const empty = JSON.stringify({ items: [], refused: [{ id: "b", reason: "No.", at: new Date().toISOString() }] });
    window.localStorage.setItem("strata:outbox:t9", empty);
    window.dispatchEvent(new StorageEvent("storage", { key: "strata:outbox:t9", newValue: empty }));
    stop();
    expect(box.snapshot()).toMatchObject({ waiting: 0 });
    expect(box.snapshot().refused.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("OutboxStatus", () => {
  it("shows nothing while nothing waits", () => {
    const box = createOutbox({ name: "s1" });
    const { container } = render(<OutboxStatus outbox={box} noun="answer" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many wait and why, and Send now sends them", async () => {
    let up = false;
    serve(() => (up ? HttpResponse.json({ ok: true }) : HttpResponse.error()));
    const box = createOutbox({ name: "s2", retryMs: 60_000 });
    await box.add(answer("a")).delivered;
    await box.add(answer("b")).delivered;
    render(<OutboxStatus outbox={box} noun="answer" />);
    expect(screen.getByRole("status").textContent).toBe(`${format.count(2, "answer")} kept on this device. The server could not be reached. Trying again at ${format.clock(box.snapshot().retryAt as Date)}.Send now`);
    up = true;
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    await act(() => box.flush());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lists refused writes with their reasons until dismissed", async () => {
    serve(() => HttpResponse.json({ detail: "Already logged with other contents." }, { status: 409 }));
    const box = createOutbox({ name: "s3" });
    await box.add(answer("a")).delivered;
    render(<OutboxStatus outbox={box} noun="answer" />);
    expect(screen.getByRole("status")).toHaveTextContent("The server refused 1 answer; it will not be sent.");
    expect(screen.getByRole("listitem")).toHaveTextContent("Answer a: Already logged with other contents.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says when the writes live only in this page", async () => {
    serve(() => HttpResponse.error());
    const box = createOutbox({ name: "s4", storage: null, retryMs: 60_000 });
    await box.add(answer("a")).delivered;
    render(<OutboxStatus outbox={box} noun="answer" />);
    expect(screen.getByRole("status")).toHaveTextContent("They are kept only while this page is open.");
  });
});
