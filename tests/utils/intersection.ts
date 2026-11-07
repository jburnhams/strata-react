import { act } from "@testing-library/react";

// jsdom has no IntersectionObserver. A stand-in a test can fire: `scrollToEnd()` tells every
// observed element it is in view, `intersect(el, false)` tells one it left. It keeps the options
// it was made with, so a test can check the root and root margin. Local to these tests until
// strata-react/testing exports the same shape (installFakeIntersectionObserver, issue #12).

type Fake = { callback: IntersectionObserverCallback; options: IntersectionObserverInit; targets: Set<Element> };

export function installFakeIntersectionObserver() {
  const observers = new Set<Fake>();
  const original = globalThis.IntersectionObserver;
  class FakeIntersectionObserver {
    readonly root: Element | Document | null;
    readonly rootMargin: string;
    readonly thresholds: number[] = [0];
    private fake: Fake;
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
      this.root = options.root ?? null;
      this.rootMargin = options.rootMargin ?? "0px";
      this.fake = { callback, options, targets: new Set() };
      observers.add(this.fake);
    }
    observe(el: Element) {
      this.fake.targets.add(el);
    }
    unobserve(el: Element) {
      this.fake.targets.delete(el);
    }
    disconnect() {
      this.fake.targets.clear();
      observers.delete(this.fake);
    }
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;

  const tell = (fake: Fake, el: Element, isIntersecting: boolean) =>
    fake.callback(
      [{ target: el, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 } as unknown as IntersectionObserverEntry],
      fake as unknown as IntersectionObserver,
    );

  return {
    observers,
    /** Every element observed right now comes into view. Returns how many were told. */
    scrollToEnd() {
      const snapshot = [...observers].flatMap((o) => [...o.targets].map((el) => [o, el] as const));
      act(() => snapshot.forEach(([o, el]) => tell(o, el, true)));
      return snapshot.length;
    },
    /** One element comes into (or, with false, leaves) view. */
    intersect(el: Element, isIntersecting = true) {
      const owners = [...observers].filter((o) => o.targets.has(el));
      act(() => owners.forEach((o) => tell(o, el, isIntersecting)));
      return owners.length;
    },
    uninstall() {
      observers.clear();
      if (original) globalThis.IntersectionObserver = original;
      else delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    },
  };
}
