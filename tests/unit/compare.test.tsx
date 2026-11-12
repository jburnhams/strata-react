import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Pixels } from "../../src/lib/image-diff";
import { Compare, CompareGrid, FullscreenFrame, FIT, actualPixelsScale, clampViewport, zoomAt, type CompareMode } from "../../src";

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

function Harness({ blind = false, start = "side" as CompareMode, keys = true, readPixels }: { blind?: boolean; start?: CompareMode; keys?: boolean; readPixels?: (src: string) => Promise<Pixels> }) {
  const [mode, setMode] = React.useState<CompareMode>(start);
  return (
    <Compare
      label="Photo 1, two versions"
      blind={blind}
      missing="Picture not found"
      mode={mode}
      onModeChange={setMode}
      keys={keys}
      readPixels={readPixels}
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

  it("cuts the swipe at the divider in frame coordinates, however far the pictures are zoomed", async () => {
    const user = userEvent.setup();
    render(<Harness start="swipe" />);
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const frame = screen.getByRole("group", { name: "Your final over auto2" });
    const cut = [...frame.children].find((c) => (c as HTMLElement).style.clipPath) as HTMLElement;
    // The clip sits outside the zoomed layer: a clip inside it would be scaled with the picture and drift from the handle.
    expect(cut.style.transform).toBe("");
    expect(cut.style.clipPath).toContain("50%");
    expect((cut.firstElementChild as HTMLElement).style.transform).toContain("scale(1.5)");
    screen.getByRole("slider", { name: /Divider/ }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(cut.style.clipPath).toContain("51%");
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

  it("learns a new frame shape when the pictures change, and uses a supplied size at once", () => {
    const side = (src: string, size?: [number, number]) => ({ id: src, label: src, media: { kind: "image" as const, src, alt: src, size } });
    const ratio = (name: string) => {
      const [w, h = "1"] = screen.getByRole("group", { name }).style.aspectRatio.split("/");
      return Number(w) / Number(h);
    };
    const props = { label: "x", blind: false, missing: "Gone", mode: "side" as const, onModeChange: () => undefined };
    const { rerender } = render(<Compare {...props} a={side("/a1", [1600, 900])} b={side("/b1")} />);
    expect(ratio("/a1")).toBeCloseTo(1.7778, 3);
    rerender(<Compare {...props} a={side("/a2", [1000, 1000])} b={side("/b2")} />);
    expect(ratio("/a2")).toBeCloseTo(1, 3);
    // No size supplied: the frame has a default shape until the picture says what it is, and then takes it, once per pair.
    rerender(<Compare {...props} a={side("/a3")} b={side("/b3")} />);
    expect(ratio("/a3")).toBeCloseTo(1.5, 3);
    const img = screen.getByRole("img", { name: "/a3" }) as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 1000 });
    fireEvent.load(img);
    expect(ratio("/a3")).toBeCloseTo(0.8, 3);
    rerender(<Compare {...props} a={side("/a4")} b={side("/b4")} />);
    expect(ratio("/a4")).toBeCloseTo(1.5, 3);
  });

  it("opens the modal when the browser refuses full screen", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Element.prototype.requestFullscreen = () => Promise.reject(new TypeError("Permissions check failed"));
    try {
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: "Full screen" }));
      expect(await screen.findByRole("dialog", { name: "Photo 1, two versions" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
      delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
    }
  });

  describe("difference view", () => {
    // The pictures' pixels come from a stand-in reader, as a browser's canvas would give them: a grey picture, and the same with a corner changed.
    const grey = (changed: boolean): Pixels => {
      const data = new Uint8ClampedArray(10 * 10 * 4).fill(200);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      if (changed) for (let i = 0; i < 5; i++) data.set([0, 0, 0, 255], i * 4); // 5 of 100 pixels
      return { data, width: 10, height: 10 };
    };
    const read = (src: string) => Promise.resolve(grey(src.endsWith("right")));

    it("lays one over the other with a difference blend and lets the person amplify it", async () => {
      const user = userEvent.setup();
      render(<Harness start="difference" />);
      expect(screen.getAllByRole("img")).toHaveLength(2);
      const frame = screen.getByRole("group", { name: "Difference between Your final and auto2" });
      const layer = frame.querySelector("[style*='brightness']") as HTMLElement;
      expect(layer.style.filter).toBe("brightness(4)");
      screen.getByRole("slider", { name: "Amplify differences" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(layer.style.filter).toBe("brightness(5)");
      expect(layer.querySelector(".mix-blend-difference")).not.toBeNull();
    });

    it("says what share of pixels differ, and recounts when the tolerance changes", async () => {
      const user = userEvent.setup();
      // The same picture with a faint change (200 to 185 on five pixels): under the default tolerance, over a strict one.
      const faint = (src: string): Promise<Pixels> => {
        const p = grey(false);
        if (src.endsWith("right")) for (let i = 0; i < 5; i++) p.data.set([185, 185, 185, 255], i * 4);
        return Promise.resolve(p);
      };
      render(<Harness start="difference" readPixels={faint} />);
      await user.click(screen.getByRole("radio", { name: "Changed pixels" }));
      expect(await screen.findByText("No pixels differ at this tolerance.")).toBeInTheDocument();
      screen.getByRole("slider", { name: "Tolerance for a changed pixel" }).focus();
      await user.keyboard("{Home}");
      expect(await screen.findByText("5% of pixels differ at this tolerance.")).toBeInTheDocument();
    });

    it("says what share of pixels differ at the default tolerance", async () => {
      const user = userEvent.setup();
      render(<Harness start="difference" readPixels={read} />);
      await user.click(screen.getByRole("radio", { name: "Changed pixels" }));
      expect(await screen.findByText("5% of pixels differ at this tolerance.")).toBeInTheDocument();
    });

    it("says there is no difference when there is none", async () => {
      const user = userEvent.setup();
      render(<Harness start="difference" readPixels={() => Promise.resolve(grey(false))} />);
      await user.click(screen.getByRole("radio", { name: "Changed pixels" }));
      expect(await screen.findByText("No pixels differ at this tolerance.")).toBeInTheDocument();
    });

    it("says so in words when the pictures' pixels cannot be read, and the brightness view still works", async () => {
      const user = userEvent.setup();
      render(<Harness start="difference" readPixels={() => Promise.reject(new Error("tainted"))} />);
      await user.click(screen.getByRole("radio", { name: "Changed pixels" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Could not read these pictures to compare their pixels.");
      await user.click(screen.getByRole("radio", { name: "Brightness" }));
      expect(screen.getByRole("slider", { name: "Amplify differences" })).toBeInTheDocument();
    });

    it("does not read any pixels until the changed-pixels view is open", async () => {
      const user = userEvent.setup();
      const asked: string[] = [];
      render(<Harness start="difference" readPixels={(s) => (asked.push(s), read(s))} />);
      expect(asked).toEqual([]);
      await user.click(screen.getByRole("radio", { name: "Changed pixels" }));
      await screen.findByText(/of pixels differ/);
      expect(asked.sort()).toEqual(["/img/1/left", "/img/1/right"]);
    });
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

describe("CompareGrid", () => {
  const items = ["one", "two", "three"].map((n) => ({ id: `secret-${n}`, label: n === "one" ? "A" : n === "two" ? "B" : "C", note: `note ${n}`, media: { kind: "image" as const, src: `/img/${n}`, alt: `alt ${n}`, size: [400, 300] as const } }));

  it("zooms every tile together", async () => {
    const user = userEvent.setup();
    render(<CompareGrid label="Three versions" items={items} blind={false} missing="Gone" />);
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    for (const name of ["A", "B", "C"]) expect((screen.getByRole("group", { name }).firstElementChild as HTMLElement).style.transform).toContain("scale(1.5)");
    await user.keyboard("0");
    expect((screen.getByRole("group", { name: "C" }).firstElementChild as HTMLElement).style.transform).toContain("scale(1)");
  });

  it("draws the caller's actions under each tile", async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    render(<CompareGrid label="Three versions" items={items} blind={false} missing="Gone" actions={(c) => <button onClick={() => opened.push(c.id)}>{`Compare ${c.label}`}</button>} />);
    await user.click(screen.getByRole("button", { name: "Compare B" }));
    expect(opened).toEqual(["secret-two"]);
  });

  it("when blind, names tiles by label only and never writes an id, note or alt", () => {
    const { container } = render(<CompareGrid label="Three versions" items={items} blind missing="Gone" />);
    expect(screen.getByRole("img", { name: "B" })).toBeInTheDocument();
    const html = container.ownerDocument.body.innerHTML;
    for (const leak of ["secret-", "note one", "alt one"]) expect(html).not.toContain(leak);
  });

  it("says in words which picture failed and keeps the others", () => {
    render(<CompareGrid label="Three versions" items={items} blind={false} missing="Picture not found" />);
    fireEvent.error(screen.getByRole("img", { name: "alt two" }));
    expect(screen.getByRole("img", { name: "alt two: Picture not found" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "alt one" })).toBeInTheDocument();
  });
});
