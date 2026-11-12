import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button, format, geo } from "../src";
import { RouteMap, type MapRoute, type RouteMapProps } from "../src/map";
import { canalWalk, parkLoop, riverRun, riverRunAt, riverRunSpeed, speedScale } from "./fixtures/route";

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
