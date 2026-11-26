import { describe, expect, it } from "vite-plus/test";
import {
  basis,
  cameraFromView,
  clampCamera,
  followCamera,
  viewFromCamera,
  describeCamera,
  dolly,
  frameFor,
  multiply,
  pan,
  perspective,
  turn,
  walk,
  type OrbitCamera,
} from "../../src/scene";

// Issue #370: the camera maths behind SceneViewport, with no GL and no component.

const cam = (over: Partial<OrbitCamera> = {}): OrbitCamera => ({
  target: [0, 0, 0],
  distance: 10,
  yaw: 0,
  pitch: 0,
  ...over,
});
const near = (a: ArrayLike<number>, b: number[], digits = 5) =>
  b.forEach((v, i) => expect(a[i]).toBeCloseTo(v, digits));
const apply = (m: Float32Array, p: number[]) =>
  [0, 1, 2, 3].map(
    (r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]! * (p[3] ?? 1),
  );

describe("basis", () => {
  it("looks along +z with +x to the left of it at yaw 0, a right-handed world with y up", () => {
    const { forward, right, up } = basis({ yaw: 0, pitch: 0 });
    near(forward, [0, 0, 1]);
    near(right, [-1, 0, 0]);
    near(up, [0, 1, 0]);
  });
  it("turns right with a positive yaw and up with a positive pitch", () => {
    near(basis({ yaw: 90, pitch: 0 }).forward, [-1, 0, 0]);
    near(basis({ yaw: 0, pitch: 90 }).forward, [0, 1, 0]);
  });
  it("is orthonormal at any angle", () => {
    const { forward: f, right: r, up: u } = basis({ yaw: 37, pitch: -52 });
    const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(dot(f, r)).toBeCloseTo(0);
    expect(dot(f, u)).toBeCloseTo(0);
    expect(dot(r, u)).toBeCloseTo(0);
    expect(dot(u, u)).toBeCloseTo(1);
  });
});

describe("frameFor", () => {
  it("puts an orbiting eye `distance` back from the target and a fly eye at the target", () => {
    near(frameFor(cam(), 800, 600).eye, [0, 0, -10]);
    near(frameFor(cam({ distance: 0, target: [3, 4, 5] }), 800, 600).eye, [3, 4, 5]);
  });
  it("sends the target to the middle of the screen at the right depth", () => {
    const frame = frameFor(cam({ yaw: 40, pitch: 25, target: [1, 2, 3] }), 800, 600);
    const eyeSpace = apply(frame.view, [1, 2, 3]);
    near(eyeSpace, [0, 0, -10, 1], 4);
    const clip = apply(frame.viewProjection, [1, 2, 3]);
    expect(clip[0]! / clip[3]!).toBeCloseTo(0);
    expect(clip[1]! / clip[3]!).toBeCloseTo(0);
    expect(clip[2]! / clip[3]!).toBeGreaterThan(-1);
    expect(clip[2]! / clip[3]!).toBeLessThan(1);
  });
  it("draws a point to the right of the target on the right of the screen", () => {
    const frame = frameFor(cam(), 800, 600);
    const right = basis(cam()).right;
    const clip = apply(frame.viewProjection, [right[0] * 2, 0, right[2] * 2]);
    expect(clip[0]! / clip[3]!).toBeGreaterThan(0);
  });
  it("multiplies column-major matrices", () => {
    const a = perspective(60, 2, 0.1, 100);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    near(multiply(a, identity), [...a]);
    near(multiply(identity, a), [...a]);
  });
});

describe("moving", () => {
  it("orbit: dragging right turns the eye round so the model follows; dragging down looks down on it", () => {
    const c = turn(cam(), 100, 0, "orbit");
    expect(c.yaw).toBeGreaterThan(0);
    expect(turn(cam(), 0, 100, "orbit").pitch).toBeLessThan(0);
  });
  it("fly: the picture follows the pointer, so dragging right turns the view left", () => {
    expect(turn(cam({ distance: 0 }), 100, 0, "fly").yaw).toBeLessThan(0);
    expect(turn(cam({ distance: 0 }), 0, 100, "fly").pitch).toBeGreaterThan(0);
  });
  it("pan: the scene follows the pointer and a pixel is the same size at any distance in world terms", () => {
    const moved = pan(cam(), 100, 0, 600);
    expect(moved.target[0]).toBeGreaterThan(0); // dragging right moves the target to the left of the view, +x here
    const near2 = pan(cam({ distance: 5 }), 100, 0, 600);
    expect(Math.abs(near2.target[0])).toBeCloseTo(Math.abs(moved.target[0]) / 2);
    expect(pan(cam(), 0, 100, 600).target[1]).toBeGreaterThan(0);
  });
  it("walk and dolly", () => {
    near(walk(cam({ distance: 0 }), 2, 0, 0).target, [0, 0, 2]);
    near(walk(cam({ distance: 0 }), 0, 1, 0).target, [-1, 0, 0]);
    near(walk(cam({ distance: 0 }), 0, 0, 3).target, [0, 3, 0]);
    expect(dolly(cam(), 0.5).distance).toBe(5);
  });
});

describe("clampCamera and describeCamera", () => {
  it("keeps pitch off the poles, distance in range and yaw in a half turn each way", () => {
    const c = clampCamera(cam({ pitch: 120, distance: 0.01, yaw: 270 }), {
      minDistance: 1,
      maxDistance: 50,
    });
    expect(c.pitch).toBe(89);
    expect(c.distance).toBe(1);
    expect(c.yaw).toBe(-90);
    expect(clampCamera(cam({ distance: 900 }), { maxDistance: 50 }).distance).toBe(50);
  });
  it("leaves a fly camera at distance 0", () => {
    expect(clampCamera(cam({ distance: 0 })).distance).toBe(0);
  });
  it("says where it looks, in words", () => {
    expect(describeCamera(cam({ yaw: 45, pitch: -30, target: [0, 2, 0] }))).toBe(
      "Looking at 0, 2, 0 from 10 away, turned 45° right, looking 30° down",
    );
    expect(describeCamera(cam({ distance: 0, target: [1, 2, 3] }))).toBe(
      "At 1, 2, 3, looking straight ahead",
    );
  });
});

describe("one view model with the panorama (#386)", () => {
  it("turns a panorama view into the fly camera that looks the same way, and back", () => {
    const camera = cameraFromView({ yaw: 40, pitch: -10 }, [1, 2, 3]);
    expect(camera).toEqual({ target: [1, 2, 3], distance: 0, yaw: 40, pitch: -10 });
    expect(viewFromCamera(camera, 75)).toEqual({ yaw: 40, pitch: -10, fov: 75 });
    near(frameFor(camera, 800, 600).eye, [1, 2, 3]);
  });

  it("follows a heading with the person's own look on top, wrapped and held short of the poles", () => {
    expect(followCamera({ eye: [0, 1, 0], heading: 170, look: { yaw: 30, pitch: 100 } })).toEqual({
      target: [0, 1, 0],
      distance: 0,
      yaw: -160,
      pitch: 89,
    });
    expect(followCamera({ eye: [5, 0, 0], heading: 90, behind: 4 })).toMatchObject({
      distance: 4,
      yaw: 90,
      pitch: 0,
    });
  });
});
