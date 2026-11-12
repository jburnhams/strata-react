import { describe, expect, it } from "vitest";
import { clampView, degreesPerPixel, describeView, project, projectFlat, unproject, unprojectFlat, wrapYaw, yawDelta } from "../../src/panorama/projection";

// Issue #178: the geometry, with no GL.

const size = { width: 800, height: 450 };
const view = { yaw: 0, pitch: 0, fov: 90 };

describe("heading", () => {
  it("wraps to (-180, 180]", () => {
    expect(wrapYaw(190)).toBe(-170);
    expect(wrapYaw(-190)).toBe(170);
    expect(wrapYaw(540)).toBe(180);
    expect(wrapYaw(-180)).toBe(180);
    expect(wrapYaw(0)).toBe(0);
  });
  it("turns the short way across the seam", () => {
    expect(yawDelta(170, -170)).toBe(20);
    expect(yawDelta(-170, 170)).toBe(-20);
  });
});

describe("project", () => {
  it("puts the direction looked at in the middle", () => {
    const p = project({ yaw: 40, pitch: 10, fov: 70 }, size, 40, 10)!;
    expect(p.x).toBeCloseTo(400, 6);
    expect(p.y).toBeCloseTo(225, 6);
    expect(p.inside).toBe(true);
  });
  it("puts half the field of view at the edge", () => {
    const p = project(view, size, 45, 0)!;
    expect(p.x).toBeCloseTo(800, 6);
    expect(project(view, size, -45, 0)!.x).toBeCloseTo(0, 6);
  });
  it("puts up above and right to the right", () => {
    const p = project(view, size, 10, 10)!;
    expect(p.x).toBeGreaterThan(400);
    expect(p.y).toBeLessThan(225);
  });
  it("is null behind the camera and for the seam opposite", () => {
    expect(project(view, size, 180, 0)).toBeNull();
    expect(project(view, size, 100, 0)).toBeNull();
  });
  it("sees across the seam: looking at 175, a marker at -175 is 10 degrees right", () => {
    const a = project({ yaw: 175, pitch: 0, fov: 90 }, size, -175, 0)!;
    const b = project({ yaw: 175, pitch: 0, fov: 90 }, size, 175 + 10, 0)!;
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.x).toBeGreaterThan(400);
  });
  it("marks a point outside the box as not inside, but still places it", () => {
    const p = project(view, size, 40, 40)!;
    expect(p.inside).toBe(false);
    expect(p.y).toBeLessThan(0);
  });
  it("keeps the horizon level when looking up (no roll): a point on the horizon ahead is below the middle", () => {
    expect(project({ yaw: 0, pitch: 30, fov: 90 }, size, 0, 0)!.y).toBeGreaterThan(225);
  });
});

describe("unproject", () => {
  it("is the inverse of project at many views and points, including near the poles and the seam", () => {
    for (const v of [{ yaw: 0, pitch: 0, fov: 90 }, { yaw: 170, pitch: 20, fov: 60 }, { yaw: -135, pitch: -45, fov: 110 }, { yaw: 33, pitch: 85, fov: 40 }]) {
      for (const [x, y] of [[400, 225], [10, 20], [790, 440], [123, 321]]) {
        const d = unproject(v, size, x, y);
        const back = project(v, size, d.yaw, d.pitch)!;
        expect(back.x).toBeCloseTo(x, 5);
        expect(back.y).toBeCloseTo(y, 5);
      }
    }
  });
  it("finds the pole straight above when looking up through the middle", () => {
    const d = unproject({ yaw: 20, pitch: 90, fov: 90 }, size, 400, 225);
    expect(d.pitch).toBeCloseTo(90, 6);
  });
  it("wraps the heading it returns", () => {
    expect(Math.abs(unproject({ yaw: 179, pitch: 0, fov: 90 }, size, 700, 225).yaw)).toBeLessThanOrEqual(180);
    expect(unproject({ yaw: 179, pitch: 0, fov: 90 }, size, 700, 225).yaw).toBeLessThan(0);
  });
});

describe("limits and words", () => {
  it("clamps pitch, field of view, and wraps the heading", () => {
    expect(clampView({ yaw: 200, pitch: 100, fov: 5 }, { maxPitch: 80, minFov: 20, maxFov: 120 })).toEqual({ yaw: -160, pitch: 80, fov: 20 });
    expect(clampView({ yaw: 0, pitch: -100, fov: 300 })).toEqual({ yaw: 0, pitch: -85, fov: 120 });
  });
  it("says where it looks", () => {
    expect(describeView({ yaw: 40, pitch: 5 })).toBe("Looking 40° right, 5° up");
    expect(describeView({ yaw: -12.4, pitch: -3 })).toBe("Looking 12° left, 3° down");
    expect(describeView({ yaw: 0, pitch: 0 })).toBe("Looking straight ahead");
    expect(describeView({ yaw: 0, pitch: 20 })).toBe("Looking 20° up");
    expect(describeView({ yaw: 180, pitch: 0 })).toBe("Looking directly behind");
    expect(describeView({ yaw: 190, pitch: 0 })).toBe("Looking 170° left");
  });
  it("converts a drag in pixels to degrees: narrower fields turn less per pixel", () => {
    expect(degreesPerPixel({ ...view, fov: 40 }, size)).toBeLessThan(degreesPerPixel({ ...view, fov: 100 }, size));
  });
});

describe("the flat picture (no WebGL)", () => {
  it("round-trips and wraps at the seam", () => {
    const v = { yaw: 170, pitch: 10, fov: 90 };
    const p = projectFlat(v, size, -170, 10);
    expect(p.x).toBeGreaterThan(400);
    const d = unprojectFlat(v, size, p.x, p.y);
    expect(d.yaw).toBeCloseTo(-170, 6);
    expect(d.pitch).toBeCloseTo(10, 6);
  });
});
