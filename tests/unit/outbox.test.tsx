import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { createOutbox, format, OutboxStatus, useOutboxStarted, type OutboxItem } from "../../src";
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
    const sent: string[] = [];
    const stop = box.onSent((item) => sent.push(item.id));
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
    expect(sent).toEqual(["a", "b"]); // told of each send, the late ones too, once
    stop();
    await box.add(answer("c")).delivered;
    expect(sent).toEqual(["a", "b"]);
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

  it("settles a write another tab sent or refused before this one got to it", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const sent: string[] = [];
    // This tab is sending a; meanwhile another tab sends b and refuses c, and writes the queue back without them.
    const box = createOutbox({
      name: "t9",
      send: async (item) => {
        sent.push(item.id);
        await held;
      },
    });
    const a = box.add(answer("a"));
    const b = box.add(answer("b"));
    const c = box.add(answer("c"));
    const kept = JSON.parse(window.localStorage.getItem("strata:outbox:t9") as string) as { items: OutboxItem[] };
    const refused = [{ id: "c", reason: "No.", at: new Date().toISOString() }];
    window.localStorage.setItem("strata:outbox:t9", JSON.stringify({ items: kept.items.filter((x) => x.id === "a"), refused }));
    release();
    expect(await Promise.all([a.delivered, b.delivered, c.delivered])).toEqual(["sent", "sent", "refused"]);
    expect(sent).toEqual(["a"]);
  });

  it("starts and stops with the component that holds it", async () => {
    const seen = serve();
    const box = createOutbox({ name: "t10" });
    window.localStorage.setItem("strata:outbox:t10", JSON.stringify({ items: [{ ...answer("a"), queuedAt: "2026-11-23T10:00:00Z" }], refused: [] }));
    function Shell() {
      useOutboxStarted(box);
      return null;
    }
    const { unmount } = render(<Shell />);
    await vi.waitFor(() => expect(seen.map((x) => x.id)).toEqual(["a"]));
    unmount();
  });
});

describe("createOutbox, the edges", () => {
  it("names what stopped it: a server asking to wait, a 5xx with no reason, a refusal with no reason", async () => {
    let reply = () => new HttpResponse(null, { status: 429, statusText: "Too Many Requests" });
    serve(() => reply());
    const box = createOutbox({ name: "e1", retryMs: 60_000 });
    await box.add(answer("a")).delivered;
    expect(box.snapshot().problem).toBe("The server asked to wait.");
    reply = () => new HttpResponse(null, { status: 500, statusText: "Internal Server Error" });
    await box.flush();
    expect(box.snapshot().problem).toBe("The server had a problem.");
    reply = () => new HttpResponse(null, { status: 404, statusText: "Not Found" });
    await box.flush();
    expect(box.snapshot().refused.map((r) => r.reason)).toEqual(["404 Not Found"]);
  });

  it("tries again on its own after the wait", async () => {
    let up = false;
    serve(() => (up ? HttpResponse.json({ ok: true }) : HttpResponse.error()));
    const box = createOutbox({ name: "e2", retryMs: 5 });
    await box.add(answer("a")).delivered;
    up = true;
    await vi.waitFor(() => expect(box.snapshot().waiting).toBe(0));
  });

  it("keeps writes in memory when the browser refuses storage, at the start or later", async () => {
    serve(() => HttpResponse.error());
    const refuse = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    try {
      expect(createOutbox({ name: "e3" }).snapshot().persisted).toBe(false);
      refuse.mockRestore();
      const box = createOutbox({ name: "e4", retryMs: 60_000 });
      expect(box.snapshot().persisted).toBe(true);
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
      await box.add(answer("a")).delivered;
      expect(box.snapshot()).toMatchObject({ waiting: 1, persisted: false });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("reads storage it cannot parse as an empty queue", () => {
    window.localStorage.setItem("strata:outbox:e5", "{not json");
    expect(createOutbox({ name: "e5" }).snapshot().waiting).toBe(0);
    window.localStorage.setItem("strata:outbox:e5", JSON.stringify({ items: "no" }));
    expect(createOutbox({ name: "e5" }).snapshot()).toMatchObject({ waiting: 0, refused: [] });
  });

  it("sends under the browser's lock, and changes the stored queue only under its write lock", async () => {
    const seen = serve();
    const names: string[] = [];
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: (name: string, run: () => unknown) => (names.push(name), Promise.resolve(run())) },
    });
    try {
      expect(await createOutbox({ name: "e6" }).add(answer("a")).delivered).toBe("sent");
    } finally {
      Reflect.deleteProperty(navigator, "locks");
    }
    // Added under the write lock, sent under the send lock, taken out under the write lock again.
    expect(names).toEqual(["strata:outbox:e6:write", "strata:outbox:e6", "strata:outbox:e6:write"]);
    expect(seen.map((x) => x.id)).toEqual(["a"]);
  });

  it("does not take a write still waiting for the write lock for one another tab sent", async () => {
    const seen = serve();
    const held: (() => void)[] = [];
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        // Another tab holds the write lock until released; the send lock is free.
        request: (name: string, run: () => unknown) =>
          name.endsWith(":write") ? new Promise((resolve) => held.push(() => resolve(run()))) : Promise.resolve(run()),
      },
    });
    try {
      const box = createOutbox({ name: "e9" });
      const a = box.add(answer("a"));
      await box.flush(); // finds the queue empty: a is not in it yet
      held.splice(0).forEach((go) => go());
      await vi.waitFor(() => expect(held.length).toBeGreaterThan(0)); // sent, and now waiting to come out
      held.splice(0).forEach((go) => go());
      expect(await a.delivered).toBe("sent");
    } finally {
      Reflect.deleteProperty(navigator, "locks");
    }
    expect(seen.map((x) => x.id)).toEqual(["a"]);
  });

  it("answers every caller that added the same write", async () => {
    let up = false;
    serve(() => (up ? HttpResponse.json({ ok: true }) : HttpResponse.error()));
    const box = createOutbox({ name: "e10", retryMs: 60_000 });
    const first = box.add(answer("a"));
    const second = box.add(answer("a"));
    expect(await Promise.all([first.delivered, second.delivered])).toEqual(["waiting", "waiting"]);
    up = true;
    const third = box.add(answer("a"));
    const fourth = box.add(answer("a"));
    expect(await Promise.all([third.delivered, fourth.delivered])).toEqual(["sent", "sent"]);
  });

  it("sends when the page is shown again, not while it is hidden", async () => {
    let up = false;
    const seen = serve(() => (up ? HttpResponse.json({ ok: true }) : HttpResponse.error()));
    const box = createOutbox({ name: "e7", retryMs: 60_000 });
    const stop = box.start();
    await box.add(answer("a")).delivered;
    await box.flush(); // the start's own pass, settled
    const tries = seen.length;
    up = true;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(seen.length).toBe(tries);
    Reflect.deleteProperty(document, "visibilityState");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(box.snapshot().waiting).toBe(0));
    stop();
  });

  it("follows other tabs: ignores other keys, keeps its own waiting writes, sends what another tab added", async () => {
    let up = false;
    const seen = serve(() => (up ? HttpResponse.json({ ok: true }) : HttpResponse.error()));
    const box = createOutbox({ name: "e8", retryMs: 60_000 });
    const stop = box.start();
    await box.add(answer("a")).delivered;
    window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: "x" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "strata:outbox:e8", newValue: null })); // cleared elsewhere: nothing to send
    expect(box.snapshot().waiting).toBe(1);
    up = true;
    // Another tab adds b to the same storage and the browser tells this one.
    const raw = window.localStorage.getItem("strata:outbox:e8") as string;
    const kept = JSON.parse(raw) as { items: OutboxItem[] };
    kept.items.push({ ...answer("b"), queuedAt: new Date().toISOString() });
    window.localStorage.setItem("strata:outbox:e8", JSON.stringify(kept));
    window.dispatchEvent(new StorageEvent("storage", { key: "strata:outbox:e8", newValue: JSON.stringify(kept) }));
    await vi.waitFor(() => expect(box.snapshot().waiting).toBe(0));
    stop();
    expect(seen.filter((x) => x.id === "b")).toHaveLength(1);
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
    await act(() => box.add(answer("b")).delivered);
    expect(screen.getByRole("status")).toHaveTextContent(/^The server refused 2\sanswers; they will not be sent\./);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lists a refused write that has no label by its reason alone", async () => {
    serve(() => HttpResponse.json({ detail: "No." }, { status: 400 }));
    const box = createOutbox({ name: "s5" });
    await box.add({ method: "POST", path: "/api/answers", json: { id: "a" } }).delivered;
    render(<OutboxStatus outbox={box} noun="answer" />);
    expect(screen.getByRole("listitem").textContent).toBe("No.");
  });

  it("says when the writes live only in this page", async () => {
    serve(() => HttpResponse.error());
    const box = createOutbox({ name: "s4", storage: null, retryMs: 60_000 });
    await box.add(answer("a")).delivered;
    render(<OutboxStatus outbox={box} noun="answer" />);
    expect(screen.getByRole("status")).toHaveTextContent("They are kept only while this page is open.");
  });
});
