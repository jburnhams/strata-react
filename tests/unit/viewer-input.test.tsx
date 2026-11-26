import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import * as React from "react";
import { followAim, useSettledStatus, useViewPointers, useWheelZoom } from "../../src";

// Issue #386: the input every 3D viewer reads, written once. The viewers' own tests cover what each does with it.

function Box({ log, threshold }: { log: string[]; threshold?: number }) {
  const pointers = useViewPointers({
    threshold,
    ignore: (e) => e.button === 2,
    onDrag: (dx, dy) => void log.push(`drag ${dx},${dy}`),
    onPinch: (ratio) => void log.push(`pinch ${ratio.toFixed(2)}`),
    onTap: () => void log.push("tap"),
  });
  const ref = React.useRef<HTMLDivElement>(null);
  useWheelZoom(ref, (factor) => void log.push(`zoom ${factor > 1 ? "out" : "in"}`), { when: (e) => e.ctrlKey });
  return <div ref={ref} tabIndex={0} aria-label="box" {...pointers} />;
}
const down = (el: Element, id: number, x: number, y: number, extra = {}) => fireEvent.pointerDown(el, { pointerId: id, clientX: x, clientY: y, button: 0, ...extra });
const move = (el: Element, id: number, x: number, y: number) => fireEvent.pointerMove(el, { pointerId: id, clientX: x, clientY: y });
const up = (el: Element, id: number, x = 0, y = 0) => fireEvent.pointerUp(el, { pointerId: id, clientX: x, clientY: y });

describe("useViewPointers", () => {
  it("is a tap when the press did not move past the threshold, and a drag when it did", () => {
    const log: string[] = [];
    render(<Box log={log} />);
    const box = screen.getByLabelText("box");
    down(box, 1, 10, 10);
    move(box, 1, 12, 11);
    up(box, 1, 12, 11);
    expect(log).toEqual(["tap"]);
    log.length = 0;
    down(box, 1, 10, 10);
    move(box, 1, 30, 10);
    move(box, 1, 35, 12);
    up(box, 1);
    expect(log).toEqual(["drag 20,0", "drag 5,2"]);
  });

  it("drags at once with a threshold of 0, and leaves a press the viewer ignores", () => {
    const log: string[] = [];
    render(<Box log={log} threshold={0} />);
    const box = screen.getByLabelText("box");
    down(box, 1, 0, 0);
    move(box, 1, 1, 0);
    up(box, 1);
    expect(log).toEqual(["drag 1,0"]);
    log.length = 0;
    down(box, 2, 0, 0, { button: 2 });
    move(box, 2, 9, 9);
    expect(log).toEqual([]);
  });

  it("reads two pointers as a pinch (earlier distance over the new one) and never taps after it", () => {
    const log: string[] = [];
    render(<Box log={log} />);
    const box = screen.getByLabelText("box");
    down(box, 1, 0, 0);
    down(box, 2, 100, 0);
    move(box, 2, 50, 0);
    up(box, 2);
    up(box, 1);
    expect(log).toEqual(["pinch 2.00"]);
  });
});

describe("useWheelZoom", () => {
  it("zooms for the wheels `when` allows and leaves the others to scroll the page", () => {
    const log: string[] = [];
    render(<Box log={log} />);
    const box = screen.getByLabelText("box");
    expect(fireEvent.wheel(box, { deltaY: 100 })).toBe(true);
    expect(log).toEqual([]);
    expect(fireEvent.wheel(box, { deltaY: 100, ctrlKey: true })).toBe(false);
    expect(fireEvent.wheel(box, { deltaY: -100, ctrlKey: true })).toBe(false);
    expect(log).toEqual(["zoom out", "zoom in"]);
  });
});

describe("useSettledStatus", () => {
  it("says nothing on first render, then the words once they have been still", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ words }) => useSettledStatus(words, 600), { initialProps: { words: "A" } });
    expect(result.current).toBe("");
    rerender({ words: "B" });
    act(() => void vi.advanceTimersByTime(300));
    rerender({ words: "C" });
    act(() => void vi.advanceTimersByTime(300));
    expect(result.current).toBe("");
    act(() => void vi.advanceTimersByTime(400));
    expect(result.current).toBe("C");
    vi.useRealTimers();
  });
});

describe("followAim", () => {
  it("adds the person's look to the heading and keeps the result in range", () => {
    expect(followAim({ heading: 350, look: { yaw: 20 } })).toEqual({ yaw: 10, pitch: 0 });
    expect(followAim({ heading: 0, pitch: 80, look: { pitch: 30 } })).toEqual({ yaw: 0, pitch: 89 });
  });
});
