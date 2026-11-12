// The geometry of `PanoramaViewer` (strata-react issue #178), with no DOM and no GL so every case
// is tested on its own and the GL shader is held to the same numbers. A 360 picture is
// *equirectangular*: longitude across, latitude down. The viewer shows a *rectilinear* window into the
// sphere, as a camera does: straight lines stay straight, and the width of what is seen is the
// horizontal field of view `fov`.
//
// Angles are degrees, because that is what an app and a person talk in. `yaw` is the heading: 0 is the
// middle of the picture, positive to the right, wrapped to (-180, 180]. `pitch` is the elevation:
// 0 is the horizon, positive up, limited to +-90 (the apps' own `maxPitch` is kept below that). A
// direction in the world is a unit vector `(cos p sin y, sin p, cos p cos y)`; the camera's forward,
// right and up are built from the view's yaw and pitch (no roll: upright footage). A point is drawn
// where its direction crosses the image plane, `fpx = (width / 2) / tan(fov / 2)` pixels from the camera.

/** Where the window looks and how wide it sees, degrees. */
export type PanoramaView = { yaw: number; pitch: number; fov: number };

/** The size of the picture box in CSS pixels. */
export type PanoramaSize = { width: number; height: number };

/** A place in the box. `inside` says it is within the box; a point behind the camera has none (`project` returns null). */
export type PanoramaPoint = { x: number; y: number; inside: boolean };

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Wraps a heading to (-180, 180]. */
export function wrapYaw(yaw: number): number {
  const w = ((((yaw + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

/** The smallest signed turn from heading `from` to heading `to`, in (-180, 180]. Use it for a difference of headings, never `to - from`. */
export const yawDelta = (from: number, to: number) => wrapYaw(to - from);

/** Keeps a view inside its limits: heading wrapped, pitch within +-`maxPitch`, field of view within `minFov` to `maxFov`. */
export function clampView(view: PanoramaView, { maxPitch = 85, minFov = 20, maxFov = 120 }: { maxPitch?: number; minFov?: number; maxFov?: number } = {}): PanoramaView {
  return { yaw: wrapYaw(view.yaw), pitch: Math.min(Math.max(view.pitch, -maxPitch), maxPitch), fov: Math.min(Math.max(view.fov, minFov), maxFov) };
}

const focal = (view: PanoramaView, size: PanoramaSize) => size.width / 2 / Math.tan((view.fov * RAD) / 2);

function basis(view: PanoramaView) {
  const y = view.yaw * RAD;
  const p = view.pitch * RAD;
  const forward = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)] as const;
  const right = [Math.cos(y), 0, -Math.sin(y)] as const;
  const up = [-Math.sin(p) * Math.sin(y), Math.cos(p), -Math.sin(p) * Math.cos(y)] as const;
  return { forward, right, up };
}
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where the direction (`yaw`, `pitch`) is drawn in the box for `view`, or null when it is behind the camera. */
export function project(view: PanoramaView, size: PanoramaSize, yaw: number, pitch: number): PanoramaPoint | null {
  const { forward, right, up } = basis(view);
  const p = pitch * RAD;
  const y = yaw * RAD;
  const d = [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)] as const;
  const z = dot(d, forward);
  if (z <= 1e-9) return null;
  const f = focal(view, size);
  const x = size.width / 2 + (f * dot(d, right)) / z;
  const yy = size.height / 2 - (f * dot(d, up)) / z;
  return { x, y: yy, inside: x >= 0 && x <= size.width && yy >= 0 && yy <= size.height };
}

/** The direction under a point of the box for `view`: the inverse of `project`. */
export function unproject(view: PanoramaView, size: PanoramaSize, x: number, y: number): { yaw: number; pitch: number } {
  const { forward, right, up } = basis(view);
  const f = focal(view, size);
  const a = (x - size.width / 2) / f;
  const b = -(y - size.height / 2) / f;
  const v = [forward[0] + a * right[0] + b * up[0], forward[1] + a * right[1] + b * up[1], forward[2] + a * right[2] + b * up[2]] as const;
  const length = Math.hypot(v[0], v[1], v[2]);
  return { yaw: wrapYaw(Math.atan2(v[0], v[2]) * DEG), pitch: Math.asin(Math.min(Math.max(v[1] / length, -1), 1)) * DEG };
}

/** Pixels to degrees at the middle of the box: how far a drag of `px` turns the view. */
export const degreesPerPixel = (view: PanoramaView, size: PanoramaSize) => (Math.atan(1 / focal(view, size)) * DEG);

/** The flat picture's own mapping, for the fallback with no WebGL: longitude and latitude are straight across and down, the visible rectangle is `fov` wide and as tall as the box's shape makes it. */
export function projectFlat(view: PanoramaView, size: PanoramaSize, yaw: number, pitch: number): PanoramaPoint {
  const perPixel = view.fov / size.width;
  const x = size.width / 2 + yawDelta(view.yaw, yaw) / perPixel;
  const y = size.height / 2 - (pitch - view.pitch) / perPixel;
  return { x, y, inside: x >= 0 && x <= size.width && y >= 0 && y <= size.height };
}

/** The inverse of `projectFlat`. */
export function unprojectFlat(view: PanoramaView, size: PanoramaSize, x: number, y: number): { yaw: number; pitch: number } {
  const perPixel = view.fov / size.width;
  return { yaw: wrapYaw(view.yaw + (x - size.width / 2) * perPixel), pitch: Math.min(Math.max(view.pitch - (y - size.height / 2) * perPixel, -90), 90) };
}

/** The direction in words: "Looking 40° right, 5° up", "Looking straight ahead". Whole degrees; nothing is said for less than half a degree. */
export function describeView(view: Pick<PanoramaView, "yaw" | "pitch">): string {
  const yaw = Math.round(wrapYaw(view.yaw));
  const pitch = Math.round(view.pitch);
  const side = yaw === 0 ? "" : yaw === 180 ? "directly behind" : `${Math.abs(yaw)}° ${yaw > 0 ? "right" : "left"}`;
  const tilt = pitch === 0 ? "" : `${Math.abs(pitch)}° ${pitch > 0 ? "up" : "down"}`;
  const parts = [side, tilt].filter(Boolean);
  return parts.length === 0 ? "Looking straight ahead" : `Looking ${parts.join(", ")}`;
}
