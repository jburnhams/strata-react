import * as React from "react";
import { withBase, appBase } from "../lib/base";
import { HttpError } from "../lib/errors";
import { fetchJson } from "./index";

// Writes that must not be lost when the connection is (spec'd for Flashtap's answers, ux-research
// patterns.md §6 "never lose work"): a learner keeps playing on a tablet whose wifi drops, and every
// answer is still recorded once the server is back.
//
// - The writes wait in localStorage (`strata:outbox:<name>`), so a reload, a closed tab or a flat
//   battery does not lose them; they are sent the next time the app opens. Without storage (a
//   private window that throws) they wait in memory and `persisted` says so.
// - Sent one at a time, oldest first, so a write that depends on an earlier one (a rating of an
//   answer) lands after it. `after` names that earlier write: if it is refused, so is this one,
//   with that reason, instead of a second refusal the person cannot connect to the first.
// - Every write through an outbox must be idempotent on the server (a client-made id it dedupes
//   on): a write whose answer was lost is sent again, and two tabs may both send the head of the
//   queue (where `navigator.locks` exists one tab sends at a time; elsewhere idempotency is the guard).
// - Two kinds of failure. Refused: the server answered 4xx and will answer the same again, so the
//   write leaves the queue and is listed with the server's reason until dismissed; never retried,
//   never silently dropped. Waiting: no answer, a 5xx, 408, 425, 429, or a 401/403 from a login in
//   front of the app (a session that expired is not the write's fault); the queue stops there and
//   tries again after 2 s, doubling to a minute, and at once when the browser comes back online or
//   the page is shown again.
// - `add` answers how the first try went (`sent`, `waiting`, `refused`), so a screen can go on at
//   once (a next round) instead of waiting for a server that is not there.
//
// Checked: TanStack Query's paused mutations (networkMode "online" plus persistQueryClient) resume
// on reconnect, but they need the mutation function registered by key at start, keep no order
// between mutations and give no refused/waiting split; a service worker's Background Sync is
// Chromium-only and needs a secure context, which a home-network app served over http lacks.

/** One write to send: a JSON body to a root-relative path of the app's own server. */
export type OutboxRequest = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Root-relative (`/api/attempts`); the app's base is put in front when it is sent. */
  path: string;
  json?: unknown;
};

/** A write as it waits: the request, its id, when it was queued, what it follows and the words a person sees for it. */
export type OutboxItem = OutboxRequest & {
  id: string;
  queuedAt: string;
  /** The id of an earlier write this one depends on. */
  after?: string;
  /** What it is, in the product's words ("Fox's answer"), for the refused list. */
  label?: string;
};

/** A write the server refused, kept to be shown until dismissed. */
export type OutboxRefusal = { id: string; label?: string; reason: string; at: string };

/** Where the outbox stands. */
export type OutboxSnapshot = {
  /** Writes not yet sent. */
  waiting: number;
  /** A send is under way. */
  sending: boolean;
  /** Why the last try stopped, when writes are waiting: "The server could not be reached." */
  problem: string | null;
  /** When it tries again on its own, while writes are waiting after a failure. */
  retryAt: Date | null;
  /** Refused writes, oldest first. */
  refused: readonly OutboxRefusal[];
  /** False when the browser gives no storage: the writes wait in this page only. */
  persisted: boolean;
};

/** How a write's first try went. */
export type Delivery = "sent" | "waiting" | "refused";

/** Options for `createOutbox`. */
export type OutboxOptions = {
  /** Names the queue in storage: `strata:outbox:<name>`. One per kind of work the app keeps. */
  name: string;
  /** Sends one write; default `fetchJson` to the path with the app's base. Throw an `HttpError` to have a 4xx refused. */
  send?: (item: OutboxItem) => Promise<unknown>;
  /** Where the queue is kept. Default `window.localStorage`; `null` keeps it in memory. */
  storage?: Storage | null;
  /** The first wait before trying again, doubled each time up to `maxRetryMs`. Default 2000. */
  retryMs?: number;
  /** Default 60000. */
  maxRetryMs?: number;
};

/** A queue of writes kept on the device and sent when the server can take them. */
export type Outbox = {
  /** Queues a write and tries to send the queue. `id` defaults to a random one; give the write's own id (an event id) so a refusal can be matched. */
  add(request: OutboxRequest & { id?: string; after?: string; label?: string }): { id: string; delivered: Promise<Delivery> };
  /** Sends what waits, oldest first, until one fails. Resolves when this pass ends. */
  flush(): Promise<void>;
  snapshot(): OutboxSnapshot;
  subscribe(listener: () => void): () => void;
  /** Forgets a refused write (or all of them). */
  dismiss(id?: string): void;
  /** Sends what waits now, and again whenever the browser comes back online, the page is shown or another tab adds. Returns the stop. */
  start(): () => void;
};

type Kept = { items: OutboxItem[]; refused: OutboxRefusal[] };

const REFUSED_KEPT = 50; // a list a person reads, not a log: the oldest refusals go first

/** Whether a failure is the server's answer for good (refused) rather than for now (waiting). */
export function isRefusal(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status >= 400 && error.status < 500 && ![401, 403, 408, 425, 429].includes(error.status);
}

function problemOf(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) return "Sign in again to send them.";
    if (error.status === 429) return "The server asked to wait.";
    return error.reason ?? "The server had a problem.";
  }
  return "The server could not be reached.";
}

function defaultStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = "strata:outbox:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A queue of writes kept on the device (localStorage) and sent in order when the server can take them; see `useOutbox` and `OutboxStatus`. */
export function createOutbox({ name, send, storage, retryMs = 2000, maxRetryMs = 60000 }: OutboxOptions): Outbox {
  const key = `strata:outbox:${name}`;
  const store = storage === undefined ? (typeof window === "undefined" ? null : defaultStorage()) : storage;
  const post = send ?? ((item: OutboxItem) => fetchJson(withBase(item.path, appBase()), { method: item.method, json: item.json }));
  let memory: Kept = { items: [], refused: [] };
  let persisted = store !== null;
  let sending = false;
  let problem: string | null = null;
  let retryAt: Date | null = null;
  let wait = retryMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | null = null;
  const firstTry = new Map<string, (d: Delivery) => void>();
  const listeners = new Set<() => void>();
  let snap: OutboxSnapshot | null = null;

  // Read before every change, so two tabs adding and removing do not overwrite each other's work.
  const read = (): Kept => {
    if (!persisted || !store) return memory;
    try {
      const raw = JSON.parse(store.getItem(key) ?? "null") as Partial<Kept> | null;
      return { items: Array.isArray(raw?.items) ? raw.items : [], refused: Array.isArray(raw?.refused) ? raw.refused : [] };
    } catch {
      return memory;
    }
  };
  const write = (kept: Kept) => {
    memory = kept;
    if (persisted && store) {
      try {
        store.setItem(key, JSON.stringify(kept));
      } catch {
        persisted = false; // full or taken away: keep going in memory, and say so
      }
    }
    changed();
  };
  const changed = () => {
    snap = null;
    for (const l of listeners) l();
  };
  const settle = (id: string, d: Delivery) => {
    firstTry.get(id)?.(d);
    firstTry.delete(id);
  };

  const refuse = (kept: Kept, item: OutboxItem, reason: string): Kept => ({
    items: kept.items.filter((x) => x.id !== item.id),
    refused: [...kept.refused, { id: item.id, label: item.label, reason, at: new Date().toISOString() }].slice(-REFUSED_KEPT),
  });

  const pass = async () => {
    sending = true;
    changed();
    try {
      for (;;) {
        const kept = read();
        const item = kept.items[0];
        if (!item) {
          problem = null;
          retryAt = null;
          wait = retryMs;
          return;
        }
        const parent = item.after ? kept.refused.find((r) => r.id === item.after) : undefined;
        if (parent) {
          write(refuse(kept, item, `Not sent, as what it follows was refused: ${parent.reason}`));
          settle(item.id, "refused");
          continue;
        }
        try {
          await post(item);
          const now = read();
          write({ ...now, items: now.items.filter((x) => x.id !== item.id) });
          settle(item.id, "sent");
        } catch (error) {
          if (!isRefusal(error)) {
            problem = problemOf(error);
            retryAt = new Date(Date.now() + wait);
            clearTimeout(timer);
            timer = setTimeout(() => void flush(), wait);
            wait = Math.min(wait * 2, maxRetryMs);
            for (const x of read().items) settle(x.id, "waiting");
            return;
          }
          write(refuse(read(), item, error.reason ?? `${error.status} ${error.statusText}`));
          settle(item.id, "refused");
        }
      }
    } finally {
      sending = false;
      changed();
    }
  };

  // A flush asked for while a pass runs is a new pass after it: the running one may already have stopped at a failure
  // (its `delivered` answers settle before it ends), and "Send now" or the network coming back must try again.
  const flush = (): Promise<void> => {
    if (running) return running.then(flush);
    clearTimeout(timer);
    const locks = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { locks?: LockManager }).locks;
    const run = locks ? locks.request(key, pass) : pass();
    running = run.finally(() => {
      running = null;
    });
    return running;
  };

  return {
    add({ id = randomId(), ...request }) {
      const kept = read();
      if (!kept.items.some((x) => x.id === id)) write({ ...kept, items: [...kept.items, { ...request, id, queuedAt: new Date().toISOString() }] });
      const delivered = new Promise<Delivery>((resolve) => firstTry.set(id, resolve));
      // A pass under way picks the new write up; one that already ended on a failure does not, so it waits for the retry
      // unless no pass is running, when this starts one.
      if (running) void running.then(() => (firstTry.has(id) ? flush() : undefined));
      else void flush();
      return { id, delivered };
    },
    flush,
    snapshot() {
      if (!snap) {
        const kept = read();
        snap = { waiting: kept.items.length, sending, problem: kept.items.length ? problem : null, retryAt: kept.items.length ? retryAt : null, refused: kept.refused, persisted };
      }
      return snap;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dismiss(id) {
      const kept = read();
      write({ ...kept, refused: id === undefined ? [] : kept.refused.filter((r) => r.id !== id) });
    },
    start() {
      if (typeof window === "undefined") return () => {};
      const now = () => {
        wait = retryMs; // the network says it is back: try now and from the first wait again
        void flush();
      };
      const shown = () => {
        if (document.visibilityState === "visible") now();
      };
      const other = (e: StorageEvent) => {
        if (e.key !== key) return;
        // Another tab sent or refused a write this one queued: its first try is over.
        const kept = read();
        for (const id of [...firstTry.keys()]) {
          if (kept.items.some((x) => x.id === id)) continue;
          settle(id, kept.refused.some((r) => r.id === id) ? "refused" : "sent");
        }
        changed();
        if (e.newValue && !running) void flush();
      };
      window.addEventListener("online", now);
      document.addEventListener("visibilitychange", shown);
      window.addEventListener("storage", other);
      void flush();
      return () => {
        clearTimeout(timer);
        window.removeEventListener("online", now);
        document.removeEventListener("visibilitychange", shown);
        window.removeEventListener("storage", other);
      };
    },
  };
}

/** Where `outbox` stands, re-rendering when it changes. Call `outbox.start()` once for the app (`useOutboxStarted`). */
export function useOutbox(outbox: Outbox): OutboxSnapshot {
  return React.useSyncExternalStore(outbox.subscribe, outbox.snapshot, outbox.snapshot);
}

/** Starts `outbox` (sends what waits, and again on reconnect) for as long as the calling component is mounted: put it in the app's shell. */
export function useOutboxStarted(outbox: Outbox): void {
  React.useEffect(() => outbox.start(), [outbox]);
}
