import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./server";

// jsdom does no layout. These shims give every element a fixed 640×280 box so components that
// measure (LineChart's width, TanStack Virtual's viewport) render something to assert on. Real
// layout is checked by the visual suite in Chromium, not here.
//
// jsdom has no ResizeObserver. A minimal one that reports a fixed 640px width once on observe,
// enough for LineChart to draw in tests. Layout itself is checked by the visual suite in Chromium.
class FixedResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 640, height: 280 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= FixedResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.getBoundingClientRect = function () {
  return { width: 640, height: 280, top: 0, left: 0, right: 640, bottom: 280, x: 0, y: 0, toJSON() {} } as DOMRect;
};

for (const [prop, value] of [["offsetWidth", 640], ["offsetHeight", 280], ["clientWidth", 640], ["clientHeight", 280]] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
