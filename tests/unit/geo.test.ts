import { describe, expect, it } from "vitest";
import { geo, type LatLng } from "../../src";

const route: LatLng[] = [
  [51.5, -0.12],
  [51.505, -0.11],
  [51.51, -0.1],
  [51.515, -0.095],
];

describe("geo.snap", () => {
  it("is the inverse of pointAlong: a point on the route snaps to the distance it was made at", () => {
    const total = geo.length(route);
    for (const share of [0, 0.13, 0.5, 0.77, 1]) {
      const at = geo.pointAlong(route, total * share)!;
      const snapped = geo.snap(route, at)!;
      expect(snapped.metres).toBeCloseTo(total * share, -1);
      expect(snapped.offset).toBeLessThan(1);
    }
  });

  it("projects onto a leg, not only to its vertices, and says how far off the route the point is", () => {
    const mid: LatLng = [(route[0][0] + route[1][0]) / 2 + 0.001, (route[0][1] + route[1][1]) / 2];
    const snapped = geo.snap(route, mid)!;
    expect(snapped.index).toBe(0);
    expect(snapped.offset).toBeGreaterThan(50);
    expect(snapped.offset).toBeLessThan(150);
    expect(snapped.metres).toBeGreaterThan(0);
    expect(snapped.metres).toBeLessThan(geo.cumulative(route)[1]);
  });

  it("clamps beyond the ends and handles one point and none", () => {
    expect(geo.snap(route, [51.4, -0.2])!.metres).toBe(0);
    expect(geo.snap(route, [52, 0])!.metres).toBeCloseTo(geo.length(route), 0);
    expect(geo.snap([route[0]], route[1])).toMatchObject({ metres: 0, index: 0 });
    expect(geo.snap([], route[0])).toBeNull();
  });

  it("picks the nearer leg of a route that doubles back", () => {
    const out: LatLng[] = [
      [51.5, -0.12],
      [51.5, -0.1],
      [51.5005, -0.1],
      [51.5005, -0.12],
    ];
    const s = geo.snap(out, [51.5004, -0.115])!;
    expect(s.index).toBe(2);
  });
});
