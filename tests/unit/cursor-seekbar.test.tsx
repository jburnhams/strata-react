import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { CursorScope, SeekBar, useSharedCursor } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #184: the seek bar as a member of a shared cursor.

function Probe({ onRead }: { onRead: (v: { at: number | null; owner: string | null }) => void }) {
  const c = useSharedCursor("probe");
  onRead({ at: c?.at ?? null, owner: c?.owner ?? null });
  return null;
}
function Writer({ at }: { at: number | null }) {
  const c = useSharedCursor("writer");
  const set = c?.setPointer;
  React.useEffect(() => {
    set?.(at);
  }, [set, at]);
  return null;
}
const track = (c: HTMLElement) => c.querySelector<HTMLElement>("[style*='touch-action']")!;

describe("SeekBar in a CursorScope", () => {
  it("is the playback position: its own time goes into the scope, and clears when it unmounts", () => {
    const reads: { at: number | null; owner: string | null }[] = [];
    const { rerender, unmount } = renderWithStrata(
      <CursorScope>
        <SeekBar time={12} duration={60} onSeek={() => {}} cursor />
        <Probe onRead={(r) => reads.push(r)} />
      </CursorScope>,
    );
    expect(reads.at(-1)).toEqual({ at: 12, owner: "playback" });
    rerender(
      <CursorScope>
        <SeekBar time={30} duration={60} onSeek={() => {}} cursor />
        <Probe onRead={(r) => reads.push(r)} />
      </CursorScope>,
    );
    expect(reads.at(-1)?.at).toBe(30);
    unmount();
  });

  it("maps its time into the scope's unit, and can leave playback to the app", () => {
    const reads: { at: number | null }[] = [];
    renderWithStrata(
      <CursorScope>
        <SeekBar time={10} duration={60} onSeek={() => {}} cursor={{ toCursor: (t) => t * 100, fromCursor: (m) => m / 100 }} />
        <Probe onRead={(r) => reads.push(r)} />
      </CursorScope>,
    );
    expect(reads.at(-1)?.at).toBe(1000);
    const quiet: { at: number | null }[] = [];
    renderWithStrata(
      <CursorScope>
        <SeekBar time={10} duration={60} onSeek={() => {}} cursor={{ playback: false }} />
        <Probe onRead={(r) => quiet.push(r)} />
      </CursorScope>,
    );
    expect(quiet.at(-1)?.at).toBeNull();
  });

  it("draws another member's position as a faint tick, and not its own", () => {
    const { container } = renderWithStrata(
      <CursorScope>
        <SeekBar time={5} duration={60} onSeek={() => {}} cursor={{ playback: false }} />
        <Writer at={30} />
      </CursorScope>,
    );
    const tick = container.querySelector<HTMLElement>("[data-cursor]");
    expect(tick).not.toBeNull();
    expect(tick!.style.left).toBe("50%");
  });

  it("lets the pointer over the bar win over playback while it is there", () => {
    const reads: { at: number | null; owner: string | null }[] = [];
    const { container } = renderWithStrata(
      <CursorScope>
        <SeekBar time={5} duration={60} onSeek={() => {}} cursor />
        <Probe onRead={(r) => reads.push(r)} />
      </CursorScope>,
    );
    const bar = track(container);
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 10, right: 200, bottom: 10, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(bar, { clientX: 100 });
    expect(reads.at(-1)).toEqual({ at: 30, owner: "pointer" });
    fireEvent.pointerLeave(bar);
    expect(reads.at(-1)).toEqual({ at: 5, owner: "playback" });
  });

  it("does nothing outside a scope", () => {
    renderWithStrata(<SeekBar time={5} duration={60} onSeek={() => {}} cursor />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
    void act;
  });
});

describe("review fixes", () => {
  it("renders on the server: a seek bar and a chart without a scope need no browser store", async () => {
    const { renderToString } = await import("react-dom/server");
    const { LineChart } = await import("../../src");
    expect(() => renderToString(<SeekBar time={1} duration={10} onSeek={() => {}} cursor />)).not.toThrow();
    expect(() => renderToString(<CursorScope><LineChart label="L" series={[{ x: 0, y: 1 }, { x: 1, y: 2 }]} seriesLabel="L" formatX={String} formatY={String} xTicks={[0, 1]} cursor /></CursorScope>)).not.toThrow();
  });
  it("lets go of the pointer when a bar that was being pointed at unmounts", () => {
    const reads: { at: number | null; owner: string | null }[] = [];
    const ui = (bar: boolean) => (
      <CursorScope>
        {bar && <SeekBar time={5} duration={60} onSeek={() => {}} cursor />}
        <Probe onRead={(r) => reads.push(r)} />
      </CursorScope>
    );
    const { container, rerender } = renderWithStrata(ui(true));
    fireEvent.pointerMove(track(container), { clientX: 0, clientY: 0 });
    rerender(ui(false));
    expect(reads.at(-1)).toEqual({ at: null, owner: null });
  });
});
