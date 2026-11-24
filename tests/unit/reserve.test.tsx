import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { createReserve, useReserve } from "../../src";

type Round = { id: string; version: number };
const round = (id: string, version = 1): Round => ({ id, version });

afterEach(() => window.localStorage.clear());

function make(fetch: (key: string, n: number) => Promise<Round[]>, extra: { size?: number; storage?: Storage | null } = {}) {
  return createReserve<Round, string>({ name: "t", size: 4, fetch, sameMake: (a, b) => a.version === b.version, ...extra });
}

describe("createReserve (#319)", () => {
  it("gives each item once, oldest first, and keeps the rest per key", () => {
    const reserve = make(async () => []);
    reserve.seed("a", [round("1"), round("2")]);
    reserve.seed("b", [round("9")]);
    expect(reserve.kept("a")).toBe(2);
    expect(reserve.take("a")).toEqual(round("1"));
    expect(reserve.take("a")).toEqual(round("2"));
    expect(reserve.take("a")).toBeUndefined();
    expect(reserve.kept("b")).toBe(1);
    expect(window.localStorage.getItem("strata:reserve:t:a")).toBeNull();
  });

  it("is still there after a reload (a new reserve over the same storage)", () => {
    make(async () => []).seed("a", [round("1")]);
    expect(make(async () => []).take("a")).toEqual(round("1"));
  });

  it("drops kept items made differently from the fresh one, and tops up from the server in one request", async () => {
    const fetch = vi.fn(async (_key: string, n: number) => Array.from({ length: n }, (_, i) => round(`new${i}`, 2)));
    const reserve = make(fetch);
    reserve.seed("a", [round("old1", 1), round("old2", 2), round("old3", 1)]);
    await reserve.refresh("a", round("fresh", 2));
    // One matched, so three were asked for to make four.
    expect(fetch).toHaveBeenCalledExactlyOnceWith("a", 3);
    expect(reserve.kept("a")).toBe(4);
    expect(reserve.take("a")).toEqual(round("old2", 2));
  });

  it("does not ask while half or more remain, nor twice at once, and drops topped-up items made differently", async () => {
    let release: (items: Round[]) => void = () => {};
    const fetch = vi.fn(() => new Promise<Round[]>((r) => (release = r)));
    const reserve = make(fetch);
    reserve.seed("a", [round("1"), round("2")]);
    await reserve.refresh("a", round("f"));
    expect(fetch).not.toHaveBeenCalled();
    reserve.take("a");
    const first = reserve.refresh("a", round("f"));
    await reserve.refresh("a", round("f")); // one top-up in flight per key
    expect(fetch).toHaveBeenCalledTimes(1);
    release([round("x", 1), round("y", 9)]);
    await first;
    expect(reserve.kept("a")).toBe(2); // the version-9 one is out of date
  });

  it("keeps a top-up from overwriting an item taken while it was out", async () => {
    let release: (items: Round[]) => void = () => {};
    const reserve = make(() => new Promise<Round[]>((r) => (release = r)));
    reserve.seed("a", [round("1")]);
    const pending = reserve.refresh("a", round("f"));
    expect(reserve.take("a")).toEqual(round("1"));
    release([round("2"), round("3")]);
    await pending;
    expect(reserve.take("a")).toEqual(round("2"));
  });

  it("checks a top-up against the newest fresh item, so an older request cannot put back what a later refresh dropped", async () => {
    let release: (items: Round[]) => void = () => {};
    const reserve = make(() => new Promise<Round[]>((r) => (release = r)));
    const first = reserve.refresh("a", round("f1", 1));
    await reserve.refresh("a", round("f2", 2)); // in flight already: only drops what is out of date
    release([round("x", 1), round("y", 2)]);
    await first;
    expect(reserve.take("a")).toEqual(round("y", 2));
    expect(reserve.take("a")).toBeUndefined();
  });

  it("keeps what it has when the top-up fails, and tries again at the next fresh item", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([round("n")]);
    const reserve = make(fetch);
    reserve.seed("a", [round("1")]);
    await expect(reserve.refresh("a", round("f"))).resolves.toBeUndefined();
    expect(reserve.kept("a")).toBe(1);
    await reserve.refresh("a", round("f"));
    expect(reserve.kept("a")).toBe(2);
  });

  it("never holds more than size", async () => {
    const reserve = make(async () => Array.from({ length: 9 }, (_, i) => round(`n${i}`)));
    reserve.seed("a", Array.from({ length: 9 }, (_, i) => round(`s${i}`)));
    expect(reserve.kept("a")).toBe(4);
    reserve.clear("a");
    await reserve.refresh("a", round("f"));
    expect(reserve.kept("a")).toBe(4);
  });

  it("keeps nothing where storage is refused, and says so", async () => {
    const refusing = { ...window.localStorage, getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => {} } as unknown as Storage;
    const reserve = make(async () => [round("n")], { storage: refusing });
    reserve.seed("a", [round("1")]);
    expect(reserve.persisted).toBe(false);
    expect(reserve.kept("a")).toBe(0);
    expect(reserve.take("a")).toBeUndefined();
    await expect(reserve.refresh("a", round("f"))).resolves.toBeUndefined();
    expect(make(async () => [], { storage: null }).persisted).toBe(false);
  });

  it("ignores stored text it cannot read, and clears every key of its own name only", () => {
    window.localStorage.setItem("strata:reserve:t:a", "{not json");
    window.localStorage.setItem("strata:reserve:other:a", "[1]");
    const reserve = make(async () => []);
    expect(reserve.kept("a")).toBe(0);
    reserve.seed("a", [round("1")]);
    reserve.seed("b", [round("2")]);
    reserve.clear();
    expect(reserve.kept("a") + reserve.kept("b")).toBe(0);
    expect(window.localStorage.getItem("strata:reserve:other:a")).toBe("[1]");
  });

  it("says how many are kept, as they are taken and when another tab changes them", () => {
    const reserve = make(async () => []);
    reserve.seed("a", [round("1"), round("2")]);
    function Kept() {
      return <p>{useReserve(reserve, "a")} kept for offline</p>;
    }
    render(<Kept />);
    expect(screen.getByText("2 kept for offline")).toBeInTheDocument();
    act(() => void reserve.take("a"));
    expect(screen.getByText("1 kept for offline")).toBeInTheDocument();
    act(() => {
      window.localStorage.setItem("strata:reserve:t:a", JSON.stringify([round("1"), round("2"), round("3")]));
      window.dispatchEvent(new StorageEvent("storage", { key: "strata:reserve:t:a" }));
    });
    expect(screen.getByText("3 kept for offline")).toBeInTheDocument();
  });
});
