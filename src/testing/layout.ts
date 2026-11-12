// jsdom does no layout: every box is 0×0 and there is no ResizeObserver. Components that measure
// (LineChart's width; React Aria's Virtualizer draws every row of a list in a test unless the box is mocked, which these shims do not make smaller. A virtualised table with detail rows, or a virtualised grid of tiles, measures each row by its scroll size, which jsdom reports as 0: a test of one gives `Element.prototype.scrollHeight` a value) then render nothing to
// assert on, so an app testing a screen built from them hits the same wall Strata's own suite did.
// These shims give every element one fixed box and a ResizeObserver that reports it once on
// observe. Real layout is checked by the visual suite in Chromium, never here.

// jsdom has no DOMRect constructor in every version, so rects are plain objects of the same shape.
/** A DOMRect-shaped object, for stand-ins that report geometry. */
export function box(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON() { return this; } } as DOMRect;
}

/** The box every element reports while the shims are installed. */
export interface LayoutBox {
  width: number;
  height: number;
}

/**
 * Give jsdom a fixed box for every element (`getBoundingClientRect`, `offset*`, `client*`) and a
 * ResizeObserver that reports it on observe, so measuring components render. Defaults to 640×280.
 * Call once in a Vitest setup file; returns a function that puts the originals back.
 */
export function installLayoutShims({ width = 640, height = 280 }: Partial<LayoutBox> = {}): () => void {
  const restore: (() => void)[] = [];
  const replace = (target: object, prop: string, descriptor: PropertyDescriptor) => {
    const before = Object.getOwnPropertyDescriptor(target, prop);
    Object.defineProperty(target, prop, { configurable: true, ...descriptor });
    restore.push(() => {
      if (before) Object.defineProperty(target, prop, before);
      else delete (target as Record<string, unknown>)[prop];
    });
  };

  class FixedResizeObserver implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: { width, height } } as unknown as ResizeObserverEntry], this);
    }
    unobserve() {}
    disconnect() {}
  }
  if (!globalThis.ResizeObserver) replace(globalThis, "ResizeObserver", { writable: true, value: FixedResizeObserver });

  replace(Element.prototype, "getBoundingClientRect", {
    writable: true,
    value: () => box(0, 0, width, height),
  });
  for (const [prop, value] of [["offsetWidth", width], ["offsetHeight", height], ["clientWidth", width], ["clientHeight", height]] as const) {
    replace(HTMLElement.prototype, prop, { get: () => value });
  }

  return () => {
    for (const undo of restore.reverse()) undo();
  };
}
