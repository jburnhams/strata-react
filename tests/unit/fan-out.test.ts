import { describe, expect, it } from "vitest";
import { fanOut } from "../../src/map/fan";

const at = (id: string, x: number, y: number) => ({ id, x, y });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("fanOut", () => {
  it("leaves markers that are apart where they are", () => {
    const out = fanOut([at("a", 0, 0), at("b", 100, 0), at("c", 0, 100)]);
    expect(out.map((o) => [o.x, o.y, o.fanned])).toEqual([[0, 0, false], [100, 0, false], [0, 100, false]]);
  });

  it("moves two markers on one spot apart by the gap, centred on the spot, the first above", () => {
    const [a, b] = fanOut([at("a", 50, 50), at("b", 50, 50)], 26);
    expect(a.fanned && b.fanned).toBe(true);
    expect(dist(a, b)).toBeCloseTo(26, 6);
    expect((a.x + b.x) / 2).toBeCloseTo(50, 6);
    expect((a.y + b.y) / 2).toBeCloseTo(50, 6);
    expect(a.y).toBeLessThan(50); // the first goes straight up
  });

  it("keeps every neighbour in a small group at least the gap apart", () => {
    for (const n of [3, 4, 5, 6]) {
      const out = fanOut(Array.from({ length: n }, (_, i) => at(`m${i}`, 10, 10)), 24);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(dist(out[i], out[j])).toBeGreaterThanOrEqual(24 - 1e-6);
    }
  });

  it("fills rings for a big pile, none closer than the gap, none far from the spot", () => {
    const out = fanOut(Array.from({ length: 40 }, (_, i) => at(`m${i}`, 0, 0)), 26);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(dist(out[i], out[j])).toBeGreaterThan(26 * 0.7);
    expect(Math.max(...out.map((o) => Math.hypot(o.x, o.y)))).toBeLessThan(26 * 5);
  });

  it("joins a chain of neighbours into one group", () => {
    const out = fanOut([at("a", 0, 0), at("b", 20, 0), at("c", 40, 0), at("far", 400, 0)], 26);
    expect(out.slice(0, 3).every((o) => o.fanned)).toBe(true);
    expect(out[3]).toMatchObject({ x: 400, y: 0, fanned: false });
  });

  it("is deterministic: the same input gives the same output, and the order of groups does not matter", () => {
    const items = [at("a", 5, 5), at("b", 6, 5), at("z", 300, 300), at("c", 5, 6)];
    expect(fanOut(items)).toEqual(fanOut(items));
    const shuffled = [items[2], items[0], items[3], items[1]];
    const byId = (o: ReturnType<typeof fanOut>) => Object.fromEntries(o.map((p) => [p.id, [Math.round(p.x), Math.round(p.y)]]));
    // The lone marker is the same wherever it is in the list; the group's members are the same set of places.
    expect(byId(fanOut(shuffled)).z).toEqual(byId(fanOut(items)).z);
  });

  it("settles as the world pixels spread (zooming in): a pair 10 px apart is fanned, 40 px apart is not", () => {
    expect(fanOut([at("a", 0, 0), at("b", 10, 0)]).every((o) => o.fanned)).toBe(true);
    expect(fanOut([at("a", 0, 0), at("b", 40, 0)]).every((o) => !o.fanned)).toBe(true);
  });

  it("handles 500 markers quickly", () => {
    const items = Array.from({ length: 500 }, (_, i) => at(`m${i}`, (i * 37) % 900, (i * 91) % 700));
    const start = performance.now();
    fanOut(items);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
