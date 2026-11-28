import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { Glimpse, useCountdown, type GlimpseLook } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Something shown for a moment after a 3-2-1 (Flashtap's "How many did you see?"): the count, the time it shows,
// showing again when the app asks, and looks again the person asks for, which go once used.

const phase = () => document.querySelector("[data-glimpse]")?.getAttribute("data-glimpse");
const counted = () => document.querySelector("[data-countdown]")?.textContent ?? null;
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
// A whole look: the count, then its time (two steps, as the look's timer is set once the count has ended).
const look = async () => {
  await tick(3000);
  await tick(1500);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function Round({
  again = 0,
  peeks = 0,
  count,
  onLook,
}: {
  again?: number;
  peeks?: number;
  count?: number;
  onLook?: (l: GlimpseLook) => void;
}) {
  return (
    <Glimpse ms={1500} count={count} again={again} peeks={peeks} gone="The pictures have gone." onLook={onLook}>
      <span>🦆 🦆 🦆</span>
    </Glimpse>
  );
}

describe("Glimpse", () => {
  it("counts 3, 2, 1, shows for its time with a bar, then hides keeping its room", async () => {
    const looks: GlimpseLook[] = [];
    renderWithStrata(<Round onLook={(l) => looks.push(l)} />);
    expect(phase()).toBe("counting");
    expect(counted()).toBe("3");
    expect(screen.getByRole("status")).toHaveTextContent("Get ready to look.");
    // Kept in the box while counting, so the box is its size, but not seen.
    expect(screen.getByText("🦆 🦆 🦆").parentElement).toHaveClass("invisible");
    await tick(1000);
    expect(counted()).toBe("2");
    await tick(1000);
    expect(counted()).toBe("1");
    await tick(1000);
    expect(phase()).toBe("showing");
    expect(counted()).toBeNull();
    expect(screen.getByText("🦆 🦆 🦆").parentElement).not.toHaveClass("invisible");
    const bar = document.querySelector<HTMLElement>("[data-time-left]");
    expect(bar).toHaveClass("drain");
    expect(bar?.style.getPropertyValue("--drain-ms")).toBe("1500ms");
    expect(looks).toEqual([{ n: 1, why: "first" }]);
    await tick(1499);
    expect(phase()).toBe("showing");
    await tick(1);
    expect(phase()).toBe("gone");
    expect(screen.getByRole("status")).toHaveTextContent("The pictures have gone.");
    expect(screen.getByText("🦆 🦆 🦆").parentElement).toHaveClass("invisible");
    expect(document.querySelector("[data-time-left]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull(); // no looks again unless offered
  });

  it("shows at once with count 0", async () => {
    renderWithStrata(<Round count={0} />);
    expect(phase()).toBe("showing");
    expect(counted()).toBeNull();
    await tick(1500);
    expect(phase()).toBe("gone");
  });

  it("shows again, counting down first, each time `again` changes", async () => {
    const looks: GlimpseLook[] = [];
    const { rerender } = renderWithStrata(<Round onLook={(l) => looks.push(l)} />);
    await look();
    expect(phase()).toBe("gone");
    rerender(<Round again={1} onLook={(l) => looks.push(l)} />);
    expect(phase()).toBe("counting");
    expect(counted()).toBe("3"); // from the top, not the last count's 1
    await tick(3000);
    expect(phase()).toBe("showing");
    await tick(1500);
    expect(phase()).toBe("gone");
    expect(looks).toEqual([
      { n: 1, why: "first" },
      { n: 2, why: "again" },
    ]);
  });

  it("counts from the top when `again` changes while it is still counting", async () => {
    const { rerender } = renderWithStrata(<Round />);
    await tick(2000);
    expect(counted()).toBe("1");
    rerender(<Round again={1} />);
    expect(counted()).toBe("3");
    await tick(1000);
    expect(phase()).toBe("counting"); // the old count would have ended here
    await tick(2000);
    expect(phase()).toBe("showing");
  });

  it("keeps the count's and the button's room in every phase, out of reach when not in use", async () => {
    const { rerender } = renderWithStrata(<Round peeks={1} count={0} />);
    const button = () => screen.getByText("Look again").closest("button")?.parentElement;
    expect(button()).toHaveClass("invisible");
    expect(button()).toHaveAttribute("inert");
    await tick(1500);
    expect(button()).not.toHaveClass("invisible");
    rerender(<Round peeks={0} count={0} />); // taken away: still holds its room, out of reach
    expect(button()).toHaveClass("invisible");
    expect(screen.queryByRole("button", { name: "Look again" })).toBeNull();
  });

  it("offers `peeks` looks again once gone, and the button goes once they are used", async () => {
    const looks: GlimpseLook[] = [];
    const { rerender } = renderWithStrata(<Round peeks={1} onLook={(l) => looks.push(l)} />);
    expect(screen.queryByRole("button", { name: "Look again" })).toBeNull(); // not while it is coming or showing
    await look();
    fireEvent.click(screen.getByRole("button", { name: "Look again" }));
    expect(screen.queryByRole("button", { name: "Look again" })).toBeNull();
    expect(phase()).toBe("counting");
    await look();
    expect(phase()).toBe("gone");
    expect(screen.queryByRole("button", { name: "Look again" })).toBeNull(); // used
    expect(looks.map((l) => l.why)).toEqual(["first", "peek"]);
    // A shown-again look does not give the peek back, and the app taking peeks away hides the button.
    rerender(<Round peeks={2} again={1} onLook={(l) => looks.push(l)} />);
    await look();
    expect(screen.getByRole("button", { name: "Look again" })).toBeInTheDocument();
    rerender(<Round peeks={0} again={1} onLook={(l) => looks.push(l)} />);
    expect(screen.queryByRole("button", { name: "Look again" })).toBeNull();
  });
});

describe("useCountdown", () => {
  it("counts whole seconds, calls back once, and starts again from the top", async () => {
    const done = vi.fn();
    const { result, rerender } = renderHook(({ running }) => useCountdown(running, 3, done), {
      initialProps: { running: true },
    });
    expect(result.current).toBe(3);
    await tick(2000);
    expect(result.current).toBe(1);
    await tick(1000);
    expect(done).toHaveBeenCalledTimes(1);
    rerender({ running: false });
    expect(result.current).toBeNull();
    rerender({ running: true });
    expect(result.current).toBe(3);
    await tick(5000);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it("does not count 0 seconds", () => {
    const done = vi.fn();
    const { result } = renderHook(() => useCountdown(true, 0, done));
    expect(result.current).toBeNull();
    expect(done).not.toHaveBeenCalled();
  });
});
