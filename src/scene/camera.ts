// The camera maths behind `SceneViewport` (issue #370), with no GL and no React, so it is tested on its
// own and an app can use it to place things in the same space the viewport draws.
//
// One camera type covers both ways of looking. **Orbit**: `target` is the point looked at and `distance`
// the way back from it; the eye is `target - forward * distance`. **Fly**: `distance` is 0, so the eye is
// `target` and the person moves it. Angles are degrees: `yaw` turns about the vertical axis (positive turns
// to the right, 0 looks along +z), `pitch` looks up when positive (0 on the horizon). Y is up, as in most
// scene formats; an app whose world is Z-up (a Quake 2 map) rotates its world, or its `render`, once.
// Matrices are column-major `Float32Array(16)`, the order WebGL's `uniformMatrix4fv` takes.

/** Where the eye is and what it looks at. */
export type OrbitCamera = {
  /** The point looked at (orbit) or the eye itself (fly, `distance` 0). */
  target: readonly [number, number, number];
  /** How far the eye is from `target`. 0 is a fly camera. */
  distance: number;
  /** Degrees; positive turns right. */
  yaw: number;
  /** Degrees; positive looks up. */
  pitch: number;
};

/** Everything a draw needs, from a camera and a box. */
export type SceneFrame = {
  camera: OrbitCamera;
  /** The eye's place. */
  eye: [number, number, number];
  /** Unit vectors: where the camera looks, its right, and its up. */
  forward: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  /** World to eye space. */
  view: Float32Array;
  projection: Float32Array;
  /** `projection × view`: one uniform for the usual vertex shader. */
  viewProjection: Float32Array;
  /** The drawing buffer's size in device pixels; `gl.viewport` is already set to it. */
  width: number;
  height: number;
  /** Counts up each time a GL context is made (the first, and each one restored after a loss): when it changes, recreate buffers, textures and programs. */
  context: number;
  /** The scene's time in seconds when the viewport was given a `time` (a `useTimeline` clock's; issue #386), else 0: draw the scene as it is at this moment. */
  time: number;
};

/** The limits a camera is held to. */
export type CameraLimits = { minDistance: number; maxDistance: number; maxPitch: number };

export const DEFAULT_LIMITS: CameraLimits = { minDistance: 0, maxDistance: Infinity, maxPitch: 89 };

const rad = (d: number) => (d * Math.PI) / 180;

/** Keeps a camera inside its limits and its yaw in -180 to 180. */
export function clampCamera(c: OrbitCamera, limits: Partial<CameraLimits> = {}): OrbitCamera {
  const { minDistance, maxDistance, maxPitch } = { ...DEFAULT_LIMITS, ...limits };
  const yaw = ((((c.yaw + 180) % 360) + 360) % 360) - 180;
  // A fly camera (distance 0 at the start) stays one: only a camera that is orbiting is held off its target.
  const distance = c.distance === 0 && minDistance === 0 ? 0 : Math.min(Math.max(c.distance, minDistance), maxDistance);
  return { target: c.target, distance, yaw, pitch: Math.min(Math.max(c.pitch, -maxPitch), maxPitch) };
}

type Vec3 = [number, number, number];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The unit vectors a camera looks along, and to its right and up. */
export function basis(c: Pick<OrbitCamera, "yaw" | "pitch">): { forward: Vec3; right: Vec3; up: Vec3 } {
  // A right-handed world (+x right of a camera that looks along -z, as WebGL's maths assumes): looking
  // along +z with +y up, the right hand is -x, so a positive yaw (a turn to the right) swings the look
  // direction toward -x.
  const y = rad(c.yaw);
  const p = rad(c.pitch);
  const forward: Vec3 = [-Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  const right: Vec3 = [-Math.cos(y), 0, -Math.sin(y)];
  return { forward, right, up: cross(right, forward) };
}

/** A right-handed perspective projection (OpenGL clip space, depth -1 to 1). `fov` is the vertical field of view in degrees. */
export function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(rad(fov) / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** The view matrix of an eye looking along `forward`. */
export function lookAlong(eye: Vec3, forward: Vec3, right: Vec3, up: Vec3): Float32Array {
  const m = new Float32Array(16);
  m[0] = right[0]; m[4] = right[1]; m[8] = right[2]; m[12] = -dot(right, eye);
  m[1] = up[0]; m[5] = up[1]; m[9] = up[2]; m[13] = -dot(up, eye);
  m[2] = -forward[0]; m[6] = -forward[1]; m[10] = -forward[2]; m[14] = dot(forward, eye);
  m[15] = 1;
  return m;
}

/** `a × b` for column-major matrices. */
export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  return out;
}

/** The frame for a camera in a drawing buffer of `width` by `height`. */
export function frameFor(camera: OrbitCamera, width: number, height: number, { fov = 60, near = 0.1, far = 10_000, context = 0, time = 0 }: { fov?: number; near?: number; far?: number; context?: number; time?: number } = {}): SceneFrame {
  const { forward, right, up } = basis(camera);
  const eye: Vec3 = [camera.target[0] - forward[0] * camera.distance, camera.target[1] - forward[1] * camera.distance, camera.target[2] - forward[2] * camera.distance];
  const view = lookAlong(eye, forward, right, up);
  const projection = perspective(fov, width / Math.max(1, height), near, far);
  return { camera, eye, forward, right, up, view, projection, viewProjection: multiply(projection, view), width, height, context, time };
}

/** Turns the camera as dragging does: orbit moves the eye round the target; look (fly) turns the head. Pixels in, degrees out at `degreesPerPixel`. */
export function turn(c: OrbitCamera, dx: number, dy: number, mode: "orbit" | "fly", degreesPerPixel = 0.35): OrbitCamera {
  // Orbit: the model follows the pointer, so the eye goes the other way. Fly: the picture follows the pointer.
  const sign = mode === "orbit" ? 1 : -1;
  return { ...c, yaw: c.yaw + sign * dx * degreesPerPixel, pitch: c.pitch - sign * dy * degreesPerPixel };
}

/** Moves the target in the screen's plane by pixels (a pan): the scene follows the pointer. `heightPx` is the box's height and `fov` the vertical field of view, which give the world size of a pixel at the target's distance. */
export function pan(c: OrbitCamera, dx: number, dy: number, heightPx: number, fov = 60): OrbitCamera {
  const { right, up } = basis(c);
  const perPixel = (2 * Math.max(c.distance, 0.001) * Math.tan(rad(fov) / 2)) / Math.max(1, heightPx);
  const move = (axis: number) => c.target[axis]! - right[axis]! * dx * perPixel + up[axis]! * dy * perPixel;
  return { ...c, target: [move(0), move(1), move(2)] };
}

/** Moves along the look direction (`ahead`), to the right (`side`) and up (`rise`), in world units: a fly camera's walk, or an orbit camera's pan by keys. */
export function walk(c: OrbitCamera, ahead: number, side: number, rise: number): OrbitCamera {
  const { forward, right } = basis(c);
  const to = (axis: number) => c.target[axis]! + forward[axis]! * ahead + right[axis]! * side + (axis === 1 ? rise : 0);
  return { ...c, target: [to(0), to(1), to(2)] };
}

/** Moves the eye toward or away from the target by a factor of the distance (orbit zoom). */
export function dolly(c: OrbitCamera, factor: number): OrbitCamera {
  return { ...c, distance: c.distance * factor };
}

const turnWords = (deg: number, positive: string, negative: string) => (Math.abs(deg) < 1 ? "" : `${Math.round(Math.abs(deg))}° ${deg > 0 ? positive : negative}`);

/** The camera in words, for the viewport's name and its status: "Looking at 0, 2, 0 from 5 away, turned 45° right, 30° above the horizon". */
export function describeCamera(c: OrbitCamera): string {
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const turned = turnWords(c.yaw, "right", "left");
  const tilted = turnWords(c.pitch, "up", "down");
  const at = `${n(c.target[0])}, ${n(c.target[1])}, ${n(c.target[2])}`;
  const parts = [turned && `turned ${turned}`, tilted && `looking ${tilted}`].filter(Boolean).join(", ");
  return c.distance === 0 ? `At ${at}${parts ? `, ${parts}` : ", looking straight ahead"}` : `Looking at ${at} from ${n(c.distance)} away${parts ? `, ${parts}` : ""}`;
}
