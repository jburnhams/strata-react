// Pure, so the camera maths (no GL, no React) can use it. See `followAim`.

/**
 * Where a viewer looks when it follows something that moves (a player in a replay, a camera operator): the heading the app
 * supplies, with the person's own look added on top, so panning during playback still works and "through the player's eyes" is just
 * `follow` mode. Degrees, positive yaw to the right and positive pitch up, the same in `PanoramaViewer` and `SceneViewport`.
 * Yaw wraps to -180 to 180 and pitch is held to `maxPitch` (default 89), where "up" stops meaning anything.
 */
export function followAim({
  heading,
  pitch = 0,
  look,
  maxPitch = 89,
}: {
  heading: number;
  pitch?: number;
  look?: { yaw?: number; pitch?: number };
  maxPitch?: number;
}): { yaw: number; pitch: number } {
  const yaw = ((((heading + (look?.yaw ?? 0) + 180) % 360) + 360) % 360) - 180;
  return { yaw, pitch: Math.min(Math.max(pitch + (look?.pitch ?? 0), -maxPitch), maxPitch) };
}
