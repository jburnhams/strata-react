import * as React from "react";

// Items the server made ahead of time, kept on the device so an app has something to show when the
// server is not there (issue #319): the read side of `createOutbox`. Flashtap kept rounds of play this
// way; the rules are not about rounds.
//
// - Kept per key (`strata:reserve:<name>:<key>`), at most `size` each, in localStorage. Storage that
//   throws (a private window) keeps nothing, and says so: `persisted` is false and `kept()` is 0. That
//   differs from the outbox on purpose: a write held in memory is still worth sending, but an item that
//   will not survive a reload is not "kept for offline", so a count that claimed it would mislead.
// - `take` removes and returns the oldest item: an item is used once (an exercise shown twice would have
//   its second try recorded as a first answer).
// - `refresh(key, fresh)` is called when a fresh item has arrived from the server. It drops kept items
//   that `sameMake(kept, fresh)` says are out of date (a deploy or content version moved on, so the
//   server would refuse their answers), then tops up in one request when fewer than half of `size`
//   remain. One top-up in flight per key; a failed top-up is not an error to show (the person is
//   playing with a good item in hand), the next `refresh` tries again.
// - Items topped up are checked against the same `sameMake`: a server that has moved on between the
//   fresh item and the top-up must not leave stale items behind.
// - `take` is one synchronous read and write, so it is atomic inside a tab; across tabs two may take
//   the same item. That is harmless where the app's writes carry a client-made id the server dedupes
//   on (the outbox's rule), and it is why no Web Lock is taken here: `take` has to answer at once.
// Not a TanStack Query cache: the query cache is memory (persisting it is a dependency), keys items by
// the request and refetches stale ones, where a reserve is consumed once and must survive a reload.

/** Options for `createReserve`. */
export type ReserveOptions<T, K extends string = string> = {
  /** Names the reserve in storage: `strata:reserve:<name>:<key>`. One per kind of item the app keeps. */
  name: string;
  /** How many items to keep for each key. */
  size: number;
  /** Fetches `count` more items for a key from the server. */
  fetch: (key: K, count: number) => Promise<readonly T[]>;
  /** Whether a kept item was made the way a fresh one is. Kept items for which this is false are dropped. Default: all are. */
  sameMake?: (kept: T, fresh: T) => boolean;
  /** Where the items are kept. Default `window.localStorage`; `null` keeps nothing. */
  storage?: Storage | null;
};

/** Items kept on the device for offline use. */
export type Reserve<T, K extends string = string> = {
  /** Removes and returns the oldest item kept for `key`, or `undefined` when there is none. */
  take(key: K): T | undefined;
  /** After a fresh item arrived: drops kept items made differently, then tops up when fewer than half remain. Never rejects. */
  refresh(key: K, fresh: T): Promise<void>;
  /** How many items are kept for `key`. */
  kept(key: K): number;
  /** False when the browser gives no storage: nothing is kept. */
  readonly persisted: boolean;
  /** Replaces what is kept for `key` (up to `size`): for a test or a story that starts with a full reserve. */
  seed(key: K, items: readonly T[]): void;
  /** Forgets what is kept for `key`, or for every key. */
  clear(key?: K): void;
  subscribe(listener: () => void): () => void;
};

function defaultStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = "strata:reserve:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Items the server made ahead, kept on the device (localStorage) and used once each; see `useReserve`. */
export function createReserve<T, K extends string = string>({ name, size, fetch, sameMake = () => true, storage }: ReserveOptions<T, K>): Reserve<T, K> {
  const prefix = `strata:reserve:${name}:`;
  const store = storage === undefined ? defaultStorage() : storage;
  let persisted = store !== null;
  const listeners = new Set<() => void>();
  const inFlight = new Set<string>();
  const changed = () => {
    for (const l of listeners) l();
  };

  const read = (key: K): T[] => {
    if (!persisted || !store) return [];
    try {
      const raw = JSON.parse(store.getItem(prefix + key) ?? "null") as unknown;
      return Array.isArray(raw) ? (raw as T[]) : [];
    } catch {
      return [];
    }
  };
  const write = (key: K, items: readonly T[]) => {
    if (persisted && store) {
      try {
        if (items.length) store.setItem(prefix + key, JSON.stringify(items.slice(0, size)));
        else store.removeItem(prefix + key);
      } catch {
        persisted = false; // full or taken away: nothing can be kept, and `persisted` says so
      }
    }
    changed();
  };

  const reserve: Reserve<T, K> = {
    take(key) {
      const items = read(key);
      const [next, ...rest] = items;
      if (items.length === 0) return undefined;
      write(key, rest);
      return next;
    },
    async refresh(key, fresh) {
      const current = read(key);
      const kept = current.filter((item) => sameMake(item, fresh));
      if (kept.length !== current.length) write(key, kept);
      if (kept.length * 2 >= size || inFlight.has(key)) return;
      inFlight.add(key);
      try {
        const more = await fetch(key, size - kept.length);
        // Read again: `take` may have run while the request was out.
        const now = read(key);
        write(key, [...now, ...more.filter((item) => sameMake(item, fresh))].slice(0, size));
      } catch {
        // Offline or the server is down: the next refresh tries again.
      } finally {
        inFlight.delete(key);
      }
    },
    kept: (key) => read(key).length,
    get persisted() {
      return persisted;
    },
    seed(key, items) {
      write(key, items);
    },
    clear(key) {
      if (key !== undefined) return write(key, []);
      if (persisted && store) {
        try {
          for (const k of Object.keys(store).filter((k) => k.startsWith(prefix))) store.removeItem(k);
        } catch {
          persisted = false;
        }
      }
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return reserve;
}

/** How many items `reserve` keeps for `key`, re-rendering as they are taken, topped up or changed by another tab: "6 rounds kept for offline". */
export function useReserve<T, K extends string>(reserve: Reserve<T, K>, key: K): number {
  const subscribe = React.useCallback(
    (listener: () => void) => {
      const stop = reserve.subscribe(listener);
      window.addEventListener("storage", listener); // another tab took or added
      return () => {
        stop();
        window.removeEventListener("storage", listener);
      };
    },
    [reserve],
  );
  return React.useSyncExternalStore(subscribe, () => reserve.kept(key), () => 0);
}
