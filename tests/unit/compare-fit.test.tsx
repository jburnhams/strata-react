import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Compare, type CompareMode } from "../../src";
import { MIN_FIT, fitFrames, frameCap } from "../../src/components/compare-parts";

// `maxHeight="fit"` (issue #229): the pair and everything around it fit the window, by measuring. jsdom has no
// layout, so the boxes are stood in for: the section, its frames, and a footer after it in the page.

describe("fitFrames and frameCap", () => {
  it("shares what the controls leave between the rows, and never goes under the least", () => {
    expect(fitFrames({ space: 700, chrome: 400, rows: 1 })).toBe(300);
    expect(fitFrames({ space: 900, chrome: 200, rows: 2 })).toBe(350);
    expect(fitFrames({ space: 100, chrome: 400, rows: 1 })).toBe(MIN_FIT);
    expect(fitFrames({ space: 701.9, chrome: 400, rows: 1 })).toBe(301);
  });

  it("measures for fit and in full screen, guesses for viewport, and passes a length through", () => {
    expect(frameCap("fit", 300, false)).toBe("300px");
    expect(frameCap("60svh", 300, true)).toBe("300px"); // full screen ignores the caller's cap
    expect(frameCap(undefined, 300, true)).toBe("300px");
    expect(frameCap("60svh", 300, false)).toBe("60svh");
    expect(frameCap("fit", null, false)).toBe("max(16rem, calc(100svh - 14rem))"); // before it is measured
    expect(frameCap("viewport", 300, false)).toBe("max(16rem, calc(100svh - 14rem))");
    expect(frameCap(undefined, null, false)).toBeUndefined();
  });
});

const box = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
let restore: () => void;

// The page: the Compare's section starts at 100, draws 400 px besides its two frames (one row, 300 px) and ends at 800;
// a 60 px footer follows it; the window is 900 px high.
beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.hasAttribute("data-viewport-frame")) return box(200, 300);
    if (this.tagName === "SECTION") return box(100, 700);
    if (this.tagName === "FOOTER") return box(800, 60);
    if (this.parentElement?.tagName === "SECTION" && this === this.parentElement.lastElementChild) return box(740, 60); // ends at 800
    return original.call(this);
  };
  const height = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, get: () => 900 });
  restore = () => {
    Element.prototype.getBoundingClientRect = original;
    delete (document.documentElement as unknown as Record<string, unknown>).clientHeight;
    if (height) Object.defineProperty(Element.prototype, "clientHeight", height);
  };
});
afterEach(() => restore());

function Page({ maxHeight = "fit", reserve }: { maxHeight?: string; reserve?: number }) {
  const [mode, setMode] = React.useState<CompareMode>("side");
  return (
    <>
      <main>
        <Compare
          label="Arena pair"
          blind={false}
          missing="Picture not found"
          mode={mode}
          onModeChange={setMode}
          maxHeight={maxHeight}
          reserve={reserve}
          a={{ id: "a", label: "A", media: { kind: "image", src: "/a.png", alt: "Bowl A", size: [1600, 1200] } }}
          b={{ id: "b", label: "B", media: { kind: "image", src: "/b.png", alt: "Bowl B", size: [1600, 1200] } }}
        />
      </main>
      <footer>The page's own footer</footer>
    </>
  );
}

// A frame is at most `fit` tall: its width is cut to fit * aspect (1600 / 1200), which jsdom writes as `calc(<px>px)`.
const frameWidthCap = () => (screen.getByRole("group", { name: "A" }) as HTMLElement).style.maxWidth;
const frameHeightCap = (css: string) => parseFloat(css.replace("calc(", "")) / (1600 / 1200);

describe("Compare maxHeight=fit", () => {
  it("measures the window less what the Compare draws besides its frames and what follows it", () => {
    render(<Page />);
    // 900 window - 100 top - 60 footer = 740 space; chrome 400; two frames are one row: 340 tall.
    expect(frameHeightCap(frameWidthCap())).toBeCloseTo(340);
  });

  it("leaves `reserve` for what it cannot measure", () => {
    render(<Page reserve={140} />);
    expect(frameHeightCap(frameWidthCap())).toBeCloseTo(200);
  });

  it("is not measured for a CSS length or the viewport guess", () => {
    const { unmount } = render(<Page maxHeight="60svh" />);
    expect(frameWidthCap()).toBe("calc(80svh)"); // 60svh * the picture's 4:3, as written
    unmount();
    render(<Page maxHeight="viewport" />);
    expect(frameWidthCap()).toContain("max(16rem"); // the fixed guess, not a measurement
  });

  it("in full screen fills what the controls leave, whatever the caller passed", async () => {
    render(<Page maxHeight="60svh" />);
    await userEvent.click(screen.getByRole("button", { name: "Full screen" }));
    const dialog = await screen.findByRole("dialog", { name: "Arena pair" });
    // The dialog's section is measured on its own: no footer, the same window.
    const frame = dialog.querySelector("[data-viewport-frame]") as HTMLElement;
    // 900 window - 100 top - 0 padding = 800 space; chrome 400 (the stand-in boxes are the same): 400 tall.
    expect(frame.style.maxWidth).not.toContain("svh");
    expect(frameHeightCap(frame.style.maxWidth)).toBeCloseTo(400);
  });
});

describe("a picture that loads with no size", () => {
  it("keeps the 3:2 box instead of a NaN aspect", () => {
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    try {
      const noSize = (
        <Compare
          label="No size"
          blind={false}
          missing="Picture not found"
          mode="side"
          onModeChange={() => undefined}
          maxHeight="60svh"
          a={{ id: "a", label: "A", media: { kind: "image", src: "/a.svg", alt: "Icon A" } }}
          b={{ id: "b", label: "B", media: { kind: "image", src: "/b.svg", alt: "Icon B" } }}
        />
      );
      render(noSize);
      screen.getAllByRole("img").forEach((img) => img.dispatchEvent(new Event("load")));
      expect(screen.getByRole("group", { name: "A" }).style.maxWidth).not.toContain("NaN");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
