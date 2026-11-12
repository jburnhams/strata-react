// Geometry for routes on a map (strata-react issue #80; the helpers jonathanburnhams.com wrote by
// hand for its activity maps). Pure functions on `[latitude, longitude]` pairs in degrees, no map
// library, so they live in the main entry and an app can use them for a text alternative or a
// profile without installing the map's peer.
//
// Distances are great-circle (haversine) on a 6,371 km sphere, which is within half a percent of
// the true figure at any route length a person runs, rides or drives. Bearings use a flat
// approximation between neighbouring points (the longitude scaled by the cosine of the mean
// latitude), fine for the short hops a chevron or a heading needs and wrong for a leg of hundreds
// of kilometres: `bearing` is for neighbouring points, not for a flight.

/** A position: `[latitude, longitude]` in degrees. */
export type LatLng = readonly [lat: number, lng: number];

const RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two positions, in metres. */
export function distance([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const a = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lng2 - lng1) * RAD) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** The direction from `a` to `b` in degrees clockwise from north (0 to 360), for neighbouring points. */
export function bearing([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const dx = (lng2 - lng1) * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const dy = lat2 - lat1;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** The running distance along a route at each point, in metres, starting at 0. */
export function cumulative(points: readonly LatLng[]): number[] {
  const out = points.length ? [0] : [];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + distance(points[i - 1], points[i]));
  return out;
}

/** The length of a route in metres. */
export function length(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

/** The south-west and north-east corners that hold every point, or null for none. */
export function bounds(points: readonly LatLng[]): [LatLng, LatLng] | null {
  if (!points.length) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  return [
    [south, west],
    [north, east],
  ];
}

/** The position `metres` along a route (clamped to its ends), by linear interpolation, or null for no points. */
export function pointAlong(points: readonly LatLng[], metres: number, along: readonly number[] = cumulative(points)): LatLng | null {
  if (!points.length) return null;
  const total = along[along.length - 1];
  const d = Math.min(Math.max(metres, 0), total);
  if (points.length === 1 || total === 0) return points[0];
  let lo = 1;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (along[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const [p, q] = [points[lo - 1], points[lo]];
  const t = (d - along[lo - 1]) / (along[lo] - along[lo - 1] || 1);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

/**
 * `count` positions evenly spaced by distance along a route (the ends skipped), each with the
 * direction of travel there. The direction is smoothed: the bearing from a point a fraction
 * (`window`) of the spacing before to one the same distance after, so GPS jitter and a tight bend
 * do not turn a chevron sideways.
 */
export function arrows(points: readonly LatLng[], count = 5, window = 0.4): { position: LatLng; bearing: number }[] {
  if (points.length < 2 || count < 1) return [];
  const along = cumulative(points);
  const total = along[along.length - 1];
  if (total === 0) return [];
  const spacing = total / (count + 1);
  const half = spacing * window;
  return Array.from({ length: count }, (_, i) => {
    const target = spacing * (i + 1);
    const before = pointAlong(points, target - half, along)!;
    const after = pointAlong(points, target + half, along)!;
    return { position: pointAlong(points, target, along)!, bearing: bearing(before, after) };
  });
}

/** The first and last positions, and whether they are within `loopWithin` metres of each other (a loop), or null for no route. */
export function ends(points: readonly LatLng[], loopWithin = 50): { start: LatLng; finish: LatLng; loop: boolean } | null {
  if (!points.length) return null;
  const start = points[0];
  const finish = points[points.length - 1];
  return { start, finish, loop: distance(start, finish) <= loopWithin };
}

/** The index of the point nearest `position`, for "where on the route is this?". */
export function nearest(points: readonly LatLng[], position: LatLng): number {
  let best = -1;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = distance(p, position);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Route geometry helpers: `geo.distance`, `bearing`, `length`, `cumulative`, `bounds`, `pointAlong`, `arrows`, `ends`, `nearest`. */
export const geo = { distance, bearing, cumulative, length, bounds, pointAlong, arrows, ends, nearest };
