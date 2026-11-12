import type { LatLng } from "../../src";

// A run along a river, made from sine curves so the numbers are the same everywhere: about 6 km
// from the start, 240 points, with a speed at each (slower on the climb in the middle). Sample data
// for the map stories and the screens that use them; the tiles it is drawn on are served by MSW
// (`tiles` in mocks/handlers.ts), so no story asks a live provider for anything.

const START: LatLng = [51.5007, -0.1246];

const run = (n: number, phase: number, scale: number): LatLng[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [START[0] + t * 0.03 * scale + 0.004 * Math.sin(t * 9 + phase), START[1] + t * 0.05 * scale + 0.006 * Math.sin(t * 6 + phase * 2)] as LatLng;
  });

export const riverRun = run(240, 0, 1);
/** Speed in km/h at each point of `riverRun`: a steady 12, down to 7 over the middle climb. */
export const riverRunSpeed = riverRun.map((_, i) => Math.round((12 - 5 * Math.exp(-(((i / 239) - 0.5) ** 2) / 0.02) + Math.sin(i / 7)) * 10) / 10);

export const parkLoop: LatLng[] = Array.from({ length: 80 }, (_, i) => {
  const a = (i / 79) * 2 * Math.PI;
  return [51.5155 + 0.004 * Math.sin(a), -0.0885 + 0.007 * Math.cos(a)] as LatLng;
});
export const canalWalk = run(120, 2, 0.6).map(([lat, lng]) => [lat + 0.012, lng - 0.02] as LatLng);

export const speedScale = [
  { at: 0, colour: "var(--chart-3)" },
  { at: 8, colour: "var(--chart-2)" },
  { at: 11, colour: "var(--chart-1)" },
  { at: 13, colour: "var(--chart-4)" },
];

/** Where the runner is `share` of the way along the river run. */
export const riverRunAt = (share: number): LatLng => riverRun[Math.min(riverRun.length - 1, Math.round(share * (riverRun.length - 1)))];

// The run as charts (issues #183 and #184): elevation and pace by distance, stops, and clips cut along it.
import { geo } from "../../src";

/** Metres along the river run at each of its points. */
export const riverRunMetres = geo.cumulative(riverRun);
/** Elevation in metres at each point, by distance. */
export const riverElevation = riverRun.map((_, i) => ({ x: riverRunMetres[i], y: Math.round(18 + 22 * Math.sin(i / 38) + 7 * Math.sin(i / 9)) }));
/** Pace in seconds per km at each point, by distance: 3600 over the speed, so slower is higher (a log axis, faster at the top). */
export const riverPace = riverRun.map((_, i) => ({ x: riverRunMetres[i], y: Math.round(3600 / riverRunSpeed[i]) }));
/** Stretches where the runner stopped. */
export const riverStops = [
  { from: riverRunMetres[60], to: riverRunMetres[72], label: "Stopped at the lights", tone: "warning" as const },
  { from: riverRunMetres[170], to: riverRunMetres[178], label: "Stopped to tie a lace", tone: "warning" as const },
];
const total = riverRunMetres[riverRunMetres.length - 1];
/** Twelve clips along the run: where each one is, as a distance. */
export const riverClips = Array.from({ length: 12 }, (_, i) => ({ x: Math.round((total * (i + 0.5)) / 12), label: `Clip ${i + 1}` }));
