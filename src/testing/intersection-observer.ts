// jsdom has no IntersectionObserver and does no layout, so nothing a component observes ever comes
// into view in a unit test. Infinite lists load the next page when a sentinel at the end of the
// list intersects, and before this helper every app wrote its own firable fake to test that
// (strata-react issue #12, from strata-listory). This one stands in for the global, records what
// each observer watches, and lets the test say when something scrolls into view: `scrollToEnd()`
// for the common case, `intersect(el)` for one element. Entries are delivered inside `act` so the
// state updates they cause are flushed before the next assertion, as a real scroll would be.

import { act } from "@testing-library/react";
import { box } from "./layout";

/** One stand-in observer: its callback, options and the elements it currently watches. */
export interface FakeObserver {
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit;
  readonly targets: ReadonlySet<Element>;
}

/** The controls `installFakeIntersectionObserver` returns. */
export interface FakeIntersectionObserverControls {
  /** Every observer created since install, including disconnected ones (their target sets are empty). */
  readonly observers: readonly FakeObserver[];
  /** Report `el` to every observer watching it: in view by default, or out of view with `false`. Returns how many observers were told. */
  intersect(el: Element, isIntersecting?: boolean): number;
  /** Report every watched element as in view, as if the person scrolled to the end of the list. Returns how many elements were reported. */
  scrollToEnd(): number;
  /** Put back whatever `IntersectionObserver` was there before install. */
  uninstall(): void;
}

function entryFor(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  const rect = target.getBoundingClientRect();
  return {
    target,
    isIntersecting,
    intersectionRatio: isIntersecting ? 1 : 0,
    boundingClientRect: rect,
    intersectionRect: isIntersecting ? rect : box(0, 0, 0, 0),
    rootBounds: null,
    time: performance.now(),
  };
}

/**
 * Replace `globalThis.IntersectionObserver` with a stand-in the test fires by hand. Call it in
 * `beforeEach` and call `uninstall()` in `afterEach`.
 *
 * @example
 * let io: FakeIntersectionObserverControls;
 * beforeEach(() => { io = installFakeIntersectionObserver(); });
 * afterEach(() => io.uninstall());
 *
 * it("loads the next page at the end of the list", async () => {
 *   renderWithStrata(<Pieces />);
 *   await screen.findByRole("list", { name: "Pieces" });
 *   io.scrollToEnd();
 *   expect(await screen.findByText("Celadon bowl")).toBeInTheDocument();
 * });
 */
export function installFakeIntersectionObserver(): FakeIntersectionObserverControls {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");
  const observers: (FakeObserver & { targets: Set<Element>; self: IntersectionObserver })[] = [];

  class FakeIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds: readonly number[];
    readonly scrollMargin = "0px";
    private readonly record: (typeof observers)[number];

    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
      this.root = options.root ?? null;
      this.rootMargin = options.rootMargin ?? "0px";
      const threshold = options.threshold ?? 0;
      this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
      this.record = { callback, options, targets: new Set(), self: this };
      observers.push(this.record);
    }
    observe(target: Element) {
      this.record.targets.add(target);
    }
    unobserve(target: Element) {
      this.record.targets.delete(target);
    }
    disconnect() {
      this.record.targets.clear();
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: FakeIntersectionObserver,
  });

  const deliver = (observer: (typeof observers)[number], targets: readonly Element[], isIntersecting: boolean) => {
    act(() => observer.callback(targets.map((t) => entryFor(t, isIntersecting)), observer.self));
  };

  return {
    observers,
    intersect(el, isIntersecting = true) {
      const watching = observers.filter((o) => o.targets.has(el));
      for (const o of watching) deliver(o, [el], isIntersecting);
      return watching.length;
    },
    scrollToEnd() {
      // Snapshot every observer's targets before any callback runs: a callback that loads more
      // may observe a new sentinel, on this observer or another, which the person has not
      // scrolled to yet.
      const batches = observers.map((o) => [o, [...o.targets]] as const).filter(([, targets]) => targets.length > 0);
      for (const [o, targets] of batches) deliver(o, targets, true);
      return batches.reduce((n, [, targets]) => n + targets.length, 0);
    },
    uninstall() {
      if (previous) Object.defineProperty(globalThis, "IntersectionObserver", previous);
      else delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    },
  };
}
