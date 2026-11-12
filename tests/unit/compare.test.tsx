import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Compare, FullscreenFrame, FIT, actualPixelsScale, clampViewport, zoomAt, type CompareMode } from "../../src";

const frame = { width: 400, height: 300 };

describe("viewport arithmetic", () => {
  it("keeps the point under the pointer where it was when zooming", () => {
    // The picture coordinate under the pointer, (pointer - offset) / scale, is the same before and after.
    const at = { x: 100, y: -40 };
    const first = zoomAt(FIT, 2, at, frame);
    expect(first.scale).toBe(2);
    expect(first.x).toBe(-100);
    const second = zoomAt(first, 4, at, frame);
    expect((at.x - second.x) / second.scale).toBeCloseTo((at.x - first.x) / first.scale);
    expect((at.y - second.y) / second.scale).toBeCloseTo((at.y - first.y) / first.scale);
  });

  it("never lets the picture leave its frame, and fit is always centred", () => {
    expect(clampViewport({ scale: 2, x: 9999, y: -9999 }, frame)).toEqual({ scale: 2, x: 200, y: -150 });
    expect(clampViewport({ scale: 0.3, x: 50, y: 50 }, frame)).toEqual(FIT);
    expect(clampViewport({ scale: 500, x: 0, y: 0 }, frame).scale).toBe(32);
  });

  it("finds the scale that draws the picture's own pixels", () => {
    expect(actualPixelsScale(1600, 400)).toBe(4);
    expect(actualPixelsScale(200, 400)).toBe(1); // smaller than the frame: fit already shows it enlarged
    expect(actualPixelsScale(0, 400)).toBe(1);
  });
});

function Harness({ blind = false, start = "side" as CompareMode, keys = true }) {
  const [mode, setMode] = React.useState<CompareMode>(start);
  return (
    <Compare
      label="Photo 1, two versions"
      blind={blind}
      missing="Picture not found"
      mode={mode}
      onModeChange={setMode}
      keys={keys}
      a={{ id: "lightroom-final", label: blind ? "A" : "Your final", note: "Lightroom", media: { kind: "image", src: "/img/1/left", alt: "Celadon bowl, Lightroom final", size: [1600, 1200] } }}
      b={{ id: "auto2", label: blind ? "B" : "auto2", note: "14 s", media: { kind: "image", src: "/img/1/right", alt: "Celadon bowl, auto2", size: [1600, 1200] } }}
    />
  );
}

describe("Compare", () => {
  it("shows both pictures side by side, each in a zoomable frame with its name", () => {
    render(<Harness />);
    expect(screen.getByRole("img", { name: "Celadon bowl, Lightroom final" })).toHaveAttribute("src", "/img/1/left");
    expect(screen.getByRole("img", { name: "Celadon bowl, auto2" })).toHaveAttribute("src", "/img/1/right");
    expect(screen.getByRole("group", { name: "Your final" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "auto2" })).toBeInTheDocument();
    expect(screen.getByText("Lightroom")).toBeInTheDocument();
  });

  it("when blind, names pictures by their label only and never writes the variant, alt or note", () => {
    const { container } = render(<Harness blind />);
    expect(screen.getByRole("img", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "B" })).toBeInTheDocument();
    const html = container.ownerDocument.body.innerHTML;
    for (const leak of ["lightroom-final", "auto2", "Lightroom", "14 s", "Celadon"]) expect(html).not.toContain(leak);
  });

  it("zooms both sides together with the buttons, the keys and the 1:1 button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const [left, right] = [screen.getByRole("group", { name: "Your final" }), screen.getByRole("group", { name: "auto2" })];
    const transform = (g: HTMLElement) => (g.firstElementChild as HTMLElement).style.transform;
    expect(transform(left)).toContain("scale(1.5)");
    expect(transform(right)).toBe(transform(left));
    await user.keyboard("+");
    expect(transform(right)).toContain("scale(2.25)");
    await user.keyboard("0");
    expect(transform(left)).toContain("scale(1)");
    expect(screen.getByRole("button", { name: "Fit" })).toBeDisabled();
  });

  it("zooms with Ctrl and the wheel and ignores a plain wheel so the page still scrolls", () => {
    render(<Harness />);
    const g = screen.getByRole("group", { name: "Your final" });
    const scale = () => (g.firstElementChild as HTMLElement).style.transform;
    expect(fireEvent.wheel(g, { deltaY: -100 })).toBe(true); // not prevented
    expect(scale()).toContain("scale(1)");
    expect(fireEvent.wheel(g, { deltaY: -100, ctrlKey: true })).toBe(false); // prevented: no browser page zoom
    expect(scale()).not.toContain("scale(1)");
  });

  it("switches view with the toggle and with the number keys, and lays one over the other", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Swipe" }));
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByRole("slider", { name: "Divider between Your final and auto2" })).toHaveValue("50");
    await user.keyboard("3");
    expect(screen.getByRole("radio", { name: "Fade" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Blend from Your final to auto2" })).toBeInTheDocument();
    await user.keyboard("1");
    expect(screen.getByRole("radio", { name: "Side by side" })).toBeChecked();
  });

  it("moves the swipe divider from the keyboard without panning the picture", async () => {
    const user = userEvent.setup();
    render(<Harness start="swipe" />);
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const divider = screen.getByRole("slider", { name: /Divider/ });
    divider.focus();
    await user.keyboard("{ArrowRight}");
    expect(divider).toHaveValue("51");
    const g = screen.getByRole("group", { name: "Your final over auto2" });
    expect((g.firstElementChild as HTMLElement).style.transform).toMatch(/translate\(0px(, 0px)?\) scale\(1\.5\)/);
  });

  it("blinks between the two: one picture at a time, flipped with a key", async () => {
    const user = userEvent.setup();
    render(<Harness start="blink" />);
    const shown = () => screen.getAllByRole("img").map((i) => i.getAttribute("src"));
    // Both are in the frame (the lower one is the other side, ready); the top is the one named.
    expect(screen.getByRole("group", { name: "Picture Your final" })).toBeInTheDocument();
    await user.keyboard("x");
    expect(screen.getByRole("group", { name: "Picture auto2" })).toBeInTheDocument();
    expect(shown()).toContain("/img/1/right");
  });

  it("says in the product's words that a picture failed and keeps the other side usable", () => {
    render(<Harness />);
    fireEvent.error(screen.getByRole("img", { name: "Celadon bowl, auto2" }));
    expect(screen.getByRole("img", { name: "Celadon bowl, auto2: Picture not found" })).toHaveTextContent("Picture not found");
    expect(screen.getByRole("img", { name: "Celadon bowl, Lightroom final" })).toBeInTheDocument();
  });

  it("opens full screen in a modal where the browser has no Fullscreen API and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Full screen" }));
    const dialog = await screen.findByRole("dialog", { name: "Photo 1, two versions" });
    expect(within(dialog).getByRole("button", { name: "Leave full screen" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
  });

  it("uses the browser's Fullscreen API when it has one, and follows the browser's own exit", async () => {
    const user = userEvent.setup();
    let fsElement: Element | null = null;
    const requested: Element[] = [];
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fsElement });
    Element.prototype.requestFullscreen = function (this: Element) {
      requested.push(this);
      fsElement = this;
      return Promise.resolve();
    };
    document.exitFullscreen = () => ((fsElement = null), Promise.resolve());
    try {
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: "Full screen" }));
      expect(requested).toHaveLength(1);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("button", { name: "Leave full screen" })).toBeInTheDocument();
      // The person presses Escape: the browser leaves full screen and says so.
      await act(async () => {
        fsElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      expect(screen.getByRole("button", { name: "Full screen" })).toBeInTheDocument();
    } finally {
      delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
      delete (document as { fullscreenElement?: Element | null }).fullscreenElement;
      delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
    }
  });

  it("leaves the keys to the screen when asked", async () => {
    const user = userEvent.setup();
    render(<Harness keys={false} />);
    await user.keyboard("3");
    expect(screen.getByRole("radio", { name: "Side by side" })).toBeChecked();
    expect(screen.queryByRole("term")).toBeNull();
  });
});

describe("FullscreenFrame", () => {
  it("renders its children in place while not active", () => {
    render(<FullscreenFrame label="x" active={false} onActiveChange={() => undefined}><p>inside</p></FullscreenFrame>);
    expect(screen.getByText("inside")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
