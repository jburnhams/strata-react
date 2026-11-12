import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button, format, geo, type LatLng } from "../src";
import { RouteMap, type MapMarker, type MapPosition, type MapRoute, type PickNearest, type RouteMapProps } from "../src/map";
import { canalWalk, parkLoop, riverRun, riverRunMetres, riverRunAt, riverRunSpeed, speedScale } from "./fixtures/route";

// Issue #80. The tiles are served by MSW (mocks/handlers.ts), so every story is the same picture
// every time; the routes are the fixture run along a river. The resting stories are the visual
// baselines (light and dark); "Live" moves a position at 60 fps and is skipped by the visual suite.

const tiles = {
  light: { url: "https://tiles.example.test/light/{z}/{x}/{y}.svg", attribution: "© Fixture tiles" },
  dark: { url: "https://tiles.example.test/dark/{z}/{x}/{y}.svg", attribution: "© Fixture tiles" },
};

const run: MapRoute = { id: "run", label: "Wednesday run", points: riverRun };
const routes: MapRoute[] = [
  { ...run, colour: "var(--chart-1)" },
  { id: "loop", label: "Park loop", points: parkLoop, colour: "var(--chart-2)" },
  { id: "walk", label: "Canal walk", points: canalWalk, colour: "var(--chart-4)" },
];
const stable = { single: [run], several: routes };

const meta = {
  title: "Data/RouteMap",
  component: RouteMap,
  args: { label: "Route of Wednesday's run", routes: stable.single, tiles, className: "w-full max-w-3xl" },
} satisfies Meta<typeof RouteMap>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One route: fitted to the screen, direction chevrons along it, a filled start and a ringed finish. */
export const SingleRoute: Story = {};

/** Several routes, each in its own chart colour; no chevrons or marks unless a route asks. One is selected, the others lighter. */
export const SeveralRoutes: Story = { args: { label: "Routes this week", routes: stable.several, selectedId: "loop" } };

/** A loop has one mark for start and finish. */
export const Loop: Story = { args: { label: "Park loop", routes: [{ id: "loop", label: "Park loop", points: parkLoop }] } };

/** Colour by value, with the key that names the steps. Colour is not the only cue: the key lists where each step starts. */
export const ColourByValue: Story = {
  args: {
    routes: [{ ...run, values: riverRunSpeed, ends: true, arrows: false }],
    colourScale: speedScale,
    colourScaleLabel: "Speed",
    formatValue: (v) => `${v} km/h`,
  },
};

/** A position on the route, as the app moves it (here at 40% of the way). */
export const WithPosition: Story = { args: { position: riverRunAt(0.4), positionLabel: "Runner" } };

/** The app's own overlays in the two corners Leaflet leaves free: a control top end, a figure bottom start (below the key). */
export const WithOverlays: Story = {
  args: {
    routes: [{ ...run, values: riverRunSpeed }],
    colourScale: speedScale,
    colourScaleLabel: "Speed",
    formatValue: (v) => `${v} km/h`,
    position: riverRunAt(0.62),
    topEnd: <Button size="sm">Elevation</Button>,
    bottomStart: <p className="rounded-control border border-border bg-background px-2 py-1 type-caption tabular-nums">{format.distance(geo.length(riverRun) * 0.62)} of {format.distance(geo.length(riverRun))}</p>,
  },
};

/** Phone width: the key and the figure stay inside the map, the controls keep their size. */
export const Phone: Story = { ...WithOverlays, tags: ["visual-phone"], args: { ...WithOverlays.args, className: "w-full" } };

// Map as picture content (issue #161): the map is part of a frame, so it is set up once and must be
// the same on every frame. The dark tiles are the light ones, so the picture does not change with the scheme.
const sameTiles = { light: tiles.light, dark: tiles.light };
const towpath = riverRun.map(([lat, lng]) => [lat - 0.003, lng + 0.002] as LatLng);
const pair: MapRoute[] = [
  { id: "river", label: "River run", points: riverRun, colour: "oklch(0.55 0.2 25)", arrows: false },
  { id: "towpath", label: "Towpath run", points: towpath, colour: "oklch(0.5 0.15 250)", arrows: false },
];
const pairAt = (a: number, b: number): MapPosition[] => [
  { id: "a", label: "Runner A", routeId: "river", at: riverRunAt(a) },
  { id: "b", label: "Runner B", routeId: "towpath", at: towpath[Math.round(b * (towpath.length - 1))] },
];

/** Two routes, two positions at different places, each marker in its route's colour; the text alternative names both. */
export const TwoPositions: Story = { args: { label: "Two runners", routes: pair, positions: pairAt(0.62, 0.3), tiles: sameTiles } };

/** Centred follow at a set zoom: the view is held on Runner A, so the marker sits in the middle of the frame. */
export const CentredAtZoom: Story = { args: { label: "Runner A, centred", routes: pair, positions: pairAt(0.45, 0.3), follow: "centre", zoom: 14, tiles: sameTiles } };

/** The same frame one second of footage later: the view has moved with the runner, the zoom is unchanged. */
export const CentredLater: Story = { args: { ...CentredAtZoom.args, positions: pairAt(0.5, 0.35) } };

function PictureStage(args: RouteMapProps) {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      setT(((now - started) / 12_000) % 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  // Zoom goes 12 to 15 and back while the view stays on Runner A; both positions move at their own speeds.
  const zoom = 12 + 3 * (1 - Math.abs(2 * t - 1));
  return (
    <div className="grid w-full max-w-3xl gap-2">
      <RouteMap {...args} positions={pairAt(t, (t * 0.7) % 1)} follow="centre" followId="a" zoom={zoom} />
      <p className="type-body-sm text-muted-foreground tabular-nums">Zoom {zoom.toFixed(2)}, centred on Runner A every frame; neither route is redrawn.</p>
    </div>
  );
}

/** Live: zoom animates 12 to 15 while the view stays centred on a moving position. Skipped by the visual suite. */
export const AnimatedZoom: Story = { tags: ["no-visual"], args: { label: "Runners", routes: pair, tiles: sameTiles }, render: (args) => <PictureStage {...args} /> };

function LiveStage(args: RouteMapProps) {
  const [share, setShare] = React.useState(0);
  const [follow, setFollow] = React.useState(false);
  React.useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      setShare(((now - started) / 30_000) % 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="grid w-full max-w-3xl gap-2">
      <RouteMap {...args} position={riverRunAt(share)} follow={follow} />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setFollow((f) => !f)}>
          {follow ? "Stop following" : "Follow the runner"}
        </Button>
        <p className="type-body-sm text-muted-foreground tabular-nums">{format.distance(geo.length(riverRun) * share)} along, updated every frame; the routes are not redrawn.</p>
      </div>
    </div>
  );
}

/** Live: the position moves every animation frame. Only the marker moves; the route line is the same element throughout. Skipped by the visual suite. */
export const Live: Story = { tags: ["no-visual"], render: (args) => <LiveStage {...args} /> };

// Markers, cursor and picking (batch of issues #181 to #184).
const spots = (n: number, around: LatLng, spread: number): MapMarker[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `clip-${i}`,
    label: `Clip ${i + 1}`,
    at: [around[0] + spread * Math.sin(i * 2.4), around[1] + spread * Math.cos(i * 2.4)] as LatLng,
  }));
const mid = riverRun[Math.floor(riverRun.length / 2)];
const clips: MapMarker[] = [
  ...spots(5, mid, 0.00008),
  { id: "far-1", label: "Clip 6", at: riverRun[20] },
  { id: "far-2", label: "Clip 7", at: riverRun[160], highlighted: true },
  { id: "stretch", label: "Clip 8, the climb", at: { routeId: "run", from: riverRunMetres[80], to: riverRunMetres[110] }, selected: true },
];

/** Items on the map: a close group fans out around its true place with leader lines, the rest are single pins, a stretch of the route is drawn heavier, and the key names each state. */
export const Markers: Story = { args: { label: "Clips on the run", markers: clips } };

/** Zoomed in until the group separates: no fan, each pin at its own place. */
export const MarkersZoomedIn: Story = { args: { ...Markers.args, zoom: 18, follow: "centre", positions: [{ id: "a", label: "Here", at: mid }], tiles: sameTiles } };

/** Phone width: the key stays inside the map. */
export const MarkersPhone: Story = { ...Markers, tags: ["visual-phone"], args: { ...Markers.args, className: "w-full" } };

/** Picking a place: the crosshair cursor and the banner; the keyboard moves a crosshair with the arrows. */
export const Picking: Story = { args: { picking: true, pickBanner: "Click the map to place the clip", onPick: () => {} } };

function PickStage(args: RouteMapProps) {
  const [picking, setPicking] = React.useState(false);
  const [picked, setPicked] = React.useState<PickNearest | null>(null);
  return (
    <div className="grid w-full max-w-3xl gap-2">
      <RouteMap {...args} picking={picking} onPick={(_, info) => { setPicked(info.nearest); setPicking(false); }} onPickCancel={() => setPicking(false)} />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => setPicking(true)}>Pick a place</Button>
        <p className="type-body-sm text-muted-foreground tabular-nums">{picked ? `${format.distance(picked.alongM)} along, ${format.distance(picked.distanceM)} off the route` : "Nothing picked"}</p>
      </div>
    </div>
  );
}

/** Live: pick a place, read the nearest point on the route. Skipped by the visual suite. */
export const PickAPlace: Story = { tags: ["no-visual"], render: (args) => <PickStage {...args} /> };
