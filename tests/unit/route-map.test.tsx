import L from "leaflet";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { coveringTiles } from "../../src/map/route-map";
import { RouteMap, type MapPosition, type MapRoute, type RouteMapProps } from "../../src/map";
import { renderWithStrata } from "../../src/testing";
import type { LatLng } from "../../src";

// Real Leaflet in jsdom: no module mocks. jsdom has no layout, so the map's container is given a
// size (Leaflet reads clientWidth and clientHeight); tiles are <img> elements that nothing loads.

let restore: () => void;
beforeEach(() => {
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 360 });
  restore = () => {
    if (w) Object.defineProperty(HTMLElement.prototype, "clientWidth", w);
    if (h) Object.defineProperty(HTMLElement.prototype, "clientHeight", h);
  };
});
afterEach(() => restore());

const light = { url: "https://tiles.example.test/light/{z}/{x}/{y}.png", attribution: "© Example tiles" };
const dark = { url: "https://tiles.example.test/dark/{z}/{x}/{y}.png", attribution: "© Example tiles" };

const run: MapRoute = {
  id: "run",
  label: "Wednesday run",
  points: [
    [51.5, -0.12],
    [51.505, -0.11],
    [51.51, -0.1],
    [51.515, -0.095],
  ],
};
const loop: MapRoute = {
  id: "loop",
  label: "Park loop",
  points: [
    [51.5, -0.12],
    [51.505, -0.11],
    [51.502, -0.105],
    [51.5, -0.1199],
  ],
};

const paths = (c: HTMLElement) => [...c.querySelectorAll<SVGPathElement>(".leaflet-overlay-pane path")];
const props = (over: Partial<RouteMapProps> = {}): RouteMapProps => ({ label: "Route map", routes: [run], tiles: { light }, ...over });

describe("RouteMap", () => {
  it("is named by its label and described in words: each route, its length, a loop, and the position along it", async () => {
    const { container } = renderWithStrata(<RouteMap {...props({ routes: [run, loop], position: [51.505, -0.11] })} />);
    const map = container.querySelector<HTMLElement>(".leaflet-container")!;
    expect(map).toHaveAttribute("aria-label", "Route map");
    const described = document.getElementById(map.getAttribute("aria-describedby")!)!;
    expect(described).toHaveTextContent("Map with 2 routes.");
    expect(described).toHaveTextContent(/Wednesday run: [\d.]+\skm\./);
    expect(described).toHaveTextContent("Park loop:");
    expect(described).toHaveTextContent(/Park loop: [\d.]+\skm, a loop\./);
    expect(described).not.toHaveTextContent(/Wednesday run: [^.]*a loop/);
  });

  it("says where the position is along the route, at most once a second", async () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ position: [51.5, -0.12] })} />);
    const summary = () => container.querySelector("p.sr-only")!.textContent!;
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    expect(summary()).toMatch(/Current position: 0\sm along\./);
    rerender(<RouteMap {...props({ position: [51.515, -0.095] })} />);
    expect(summary()).toMatch(/0\sm along/); // not yet: the spoken position is throttled
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    expect(summary()).toMatch(/Current position: [\d.]+\skm along\./);
  });

  it("keeps the spoken position current while the position changes every frame", async () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ position: [51.5, -0.12] })} />);
    const summary = () => container.querySelector("p.sr-only")!.textContent!;
    const end = run.points[run.points.length - 1];
    // Ten updates a second for two and a half seconds, the last at the end of the route.
    for (let i = 1; i <= 25; i++) {
      const t = i / 25;
      await act(() => new Promise((r) => setTimeout(r, 100)));
      rerender(<RouteMap {...props({ position: [51.5 + (end[0] - 51.5) * t, -0.12 + (end[1] + 0.12) * t] })} />);
    }
    expect(summary()).not.toMatch(/0\sm along/); // a debounce would still say 0 m: it never saw a quiet second
  });

  it("takes the app's own text alternative", () => {
    const { container } = renderWithStrata(<RouteMap {...props({ summary: "A run along the river from Vauxhall to Tower Bridge." })} />);
    expect(container.querySelector("p.sr-only")).toHaveTextContent("A run along the river from Vauxhall to Tower Bridge.");
  });

  it("has Leaflet's own keyboard and zoom controls, named", () => {
    const { container } = renderWithStrata(<RouteMap {...props()} />);
    expect(container.querySelector(".leaflet-container")).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeInTheDocument();
  });

  it("loads the app's tiles and shows the attribution its provider requires", () => {
    const { container } = renderWithStrata(<RouteMap {...props()} />);
    const tiles = [...container.querySelectorAll<HTMLImageElement>("img.leaflet-tile")];
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(t.src).toMatch(/^https:\/\/tiles\.example\.test\/light\/\d+\/\d+\/\d+\.png$/);
    expect(container.querySelector(".leaflet-control-attribution")).toHaveTextContent("© Example tiles");
  });

  it("follows the colour scheme: the dark tile set when there is one, a treatment on the light tiles when not", () => {
    const withDark = renderWithStrata(<RouteMap {...props({ tiles: { light, dark } })} />, { colorScheme: "dark" });
    expect(withDark.container.querySelector<HTMLImageElement>("img.leaflet-tile")!.src).toContain("/dark/");
    expect(withDark.container.querySelector(".strata-map")).not.toHaveAttribute("data-dark-treatment");
    withDark.unmount();
    const without = renderWithStrata(<RouteMap {...props()} />, { colorScheme: "dark" });
    expect(without.container.querySelector<HTMLImageElement>("img.leaflet-tile")!.src).toContain("/light/");
    expect(without.container.querySelector(".strata-map")).toHaveAttribute("data-dark-treatment");
    without.unmount();
    const lit = renderWithStrata(<RouteMap {...props()} />);
    expect(lit.container.querySelector(".strata-map")).not.toHaveAttribute("data-dark-treatment");
  });

  it("moves the position without redrawing or recreating any route", () => {
    const same = { routes: [run, loop] }; // an app keeps its routes in one array (state, or useMemo), as it must for this
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ ...same, position: [51.5, -0.12] })} />);
    const before = paths(container);
    expect(before.length).toBeGreaterThanOrEqual(3); // two routes and the position marker
    const routePaths = before.slice(0, 2);
    const marker = before[before.length - 1];
    const markerD = marker.getAttribute("d");
    for (const p of [[51.502, -0.115], [51.505, -0.11], [51.51, -0.1]] as const) rerender(<RouteMap {...props({ ...same, position: p })} />);
    const after = paths(container);
    expect(after.length).toBe(before.length);
    expect(after[0]).toBe(routePaths[0]);
    expect(after[1]).toBe(routePaths[1]);
    expect(after[after.length - 1]).toBe(marker);
    expect(marker.getAttribute("d")).not.toBe(markerD);
  });

  it("removes the position marker when there is no position", () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ position: [51.5, -0.12] })} />);
    const count = paths(container).length;
    rerender(<RouteMap {...props({ position: null })} />);
    expect(paths(container).length).toBe(count - 1);
  });

  it("gives a single route chevrons and start and finish marks, and several routes neither unless asked", () => {
    const one = renderWithStrata(<RouteMap {...props()} />);
    expect(one.container.querySelectorAll(".strata-map-arrow")).toHaveLength(5);
    expect(paths(one.container)).toHaveLength(3); // the line, the finish ring, the start dot
    one.unmount();
    const many = renderWithStrata(<RouteMap {...props({ routes: [run, loop] })} />);
    expect(many.container.querySelectorAll(".strata-map-arrow")).toHaveLength(0);
    expect(paths(many.container)).toHaveLength(2);
    many.unmount();
    const asked = renderWithStrata(<RouteMap {...props({ routes: [run, { ...loop, arrows: 2, ends: true }] })} />);
    expect(asked.container.querySelectorAll(".strata-map-arrow")).toHaveLength(2);
  });

  it("marks a loop with one start and finish mark", () => {
    const { container } = renderWithStrata(<RouteMap {...props({ routes: [loop] })} />);
    expect(paths(container)).toHaveLength(2); // the line and one mark
  });

  it("colours a route by value in runs of one step, with a key that names the steps", () => {
    const values = [5, 6, 14, 15];
    const scale = [
      { at: 0, colour: "var(--chart-1)" },
      { at: 10, colour: "var(--chart-2)" },
    ];
    const { container } = renderWithStrata(
      <RouteMap {...props({ routes: [{ ...run, values, arrows: false, ends: false }], colourScale: scale, colourScaleLabel: "Speed", formatValue: (v) => `${v} km/h` })} />,
    );
    expect(paths(container)).toHaveLength(2); // two runs, not three segments
    const key = screen.getByText("Speed").parentElement!;
    expect(key).toHaveTextContent("From 0 km/h");
    expect(key).toHaveTextContent("From 10 km/h");
    expect(container.querySelector("p.sr-only")).toHaveTextContent("Speed from 5 km/h to 15 km/h.");
  });

  it("reports a pressed route and draws the selected one heavier", () => {
    const seen: string[] = [];
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ routes: [run, loop], onSelect: (id) => seen.push(id) })} />);
    fireEvent.click(paths(container)[1]);
    expect(seen).toEqual(["loop"]);
    const width = () => paths(container)[1].getAttribute("stroke-width");
    const plain = width();
    rerender(<RouteMap {...props({ routes: [run, loop], onSelect: (id) => seen.push(id), selectedId: "loop" })} />);
    expect(Number(width())).toBeGreaterThan(Number(plain));
  });

  it("makes lines pressable when onSelect arrives later, with the same routes", () => {
    const same = { routes: [run, loop] };
    const { container, rerender } = renderWithStrata(<RouteMap {...props(same)} />);
    expect(container.querySelector(".leaflet-interactive")).toBeNull();
    const seen: string[] = [];
    rerender(<RouteMap {...props({ ...same, onSelect: (id) => seen.push(id) })} />);
    expect(container.querySelector(".leaflet-interactive")).not.toBeNull();
    fireEvent.click(paths(container)[0]);
    expect(seen).toEqual(["run"]);
  });

  it("describes a coloured route of any length (200,000 values do not overflow the call stack)", () => {
    const n = 200_000;
    const points = Array.from({ length: n }, (_, i) => [51.5 + i * 1e-7, -0.12 + i * 1e-7] as const);
    const values = Array.from({ length: n }, (_, i) => i % 50);
    const scale = [{ at: 0, colour: "var(--chart-1)" }];
    const { container } = renderWithStrata(<RouteMap {...props({ routes: [{ id: "long", label: "Long ride", points, values, arrows: false, ends: false }], colourScale: scale, colourScaleLabel: "Speed" })} />);
    expect(container.querySelector("p.sr-only")).toHaveTextContent("Speed from 0 to 49.");
  });

  it("does not make lines pressable without onSelect", () => {
    const { container } = renderWithStrata(<RouteMap {...props({ routes: [run, loop] })} />);
    expect(container.querySelector(".leaflet-interactive")).toBeNull();
  });

  it("puts the app's overlays where Leaflet puts nothing, with the colour key beneath nothing of theirs", () => {
    const { container } = renderWithStrata(<RouteMap {...props({ topEnd: <button type="button">Profile</button>, bottomStart: <p>Legend</p> })} />);
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Legend")).toBeInTheDocument();
    expect(container.querySelector(".leaflet-top.leaflet-left .leaflet-control-zoom")).not.toBeNull();
    expect(container.querySelector(".leaflet-bottom.leaflet-right .leaflet-control-attribution")).not.toBeNull();
  });

  it("puts Leaflet's stylesheet in the page once, however many maps there are", () => {
    renderWithStrata(
      <>
        <RouteMap {...props()} />
        <RouteMap {...props({ label: "Second" })} />
      </>,
    );
    expect(document.querySelectorAll("style[data-strata-map]")).toHaveLength(1);
    expect(document.querySelector("style[data-strata-map]")!.textContent).toContain(".leaflet-container");
  });

  it("shows nothing broken for no routes", () => {
    const { container } = renderWithStrata(<RouteMap {...props({ routes: [] })} />);
    expect(container.querySelector("p.sr-only")).toHaveTextContent("No routes to show.");
  });

  it("unmounts cleanly", () => {
    const { unmount } = renderWithStrata(<RouteMap {...props({ position: [51.5, -0.12] })} />);
    expect(() => unmount()).not.toThrow();
  });
});

// Map as picture content (issue #161): a set zoom, centred follow, several positions.
describe("RouteMap as picture content", () => {
  const same = { routes: [run, loop] };
  const tileZoom = (c: HTMLElement) => Number(c.querySelector<HTMLImageElement>("img.leaflet-tile")!.src.match(/light\/(\d+)\//)![1]);

  it("keeps fitting the routes when no zoom is set", () => {
    const { container } = renderWithStrata(<RouteMap {...props()} />);
    expect(tileZoom(container)).toBeGreaterThan(10);
  });

  it("places the view at the zoom it is given, and follows a zoom that changes every frame without touching a route", () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ ...same, zoom: 12 })} />);
    const routePaths = paths(container).slice(0, 2);
    expect(tileZoom(container)).toBe(12);
    for (const z of [12.5, 13, 13.7, 14.4, 15]) rerender(<RouteMap {...props({ ...same, zoom: z })} />);
    expect(tileZoom(container)).toBe(15);
    expect(paths(container).slice(0, 2)).toEqual(routePaths); // same elements, not redrawn
    expect(paths(container)[0]).toBe(routePaths[0]);
  });

  it("holds the view centred on the position at the zoom, exactly, on every update and with the routes untouched", () => {
    const start: LatLng = [51.5, -0.12];
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ ...same, position: start, follow: "centre", zoom: 12 })} />);
    const routePaths = paths(container).slice(0, 2);
    for (let i = 0; i <= 6; i++) {
      const z = 12 + (2 * i) / 6;
      const at: LatLng = [51.5 + 0.002 * i, -0.12 + 0.003 * i];
      rerender(<RouteMap {...props({ ...same, position: at, follow: "centre", zoom: Math.round(z) })} />);
      // Half of 640 by 360, within the whole pixel Leaflet works in.
      const [x, y] = screenOf(container, at, Math.round(z));
      expect(Math.abs(x - 320)).toBeLessThanOrEqual(1);
      expect(Math.abs(y - 180)).toBeLessThanOrEqual(1);
    }
    expect(paths(container).slice(0, 2)).toEqual(routePaths);
  });

  /** Where each tile is on screen (jsdom has no 3D transforms, so Leaflet positions with left and top): its own offset plus every ancestor's up to the map's container. */
  const onScreen = (c: HTMLElement) => {
    const px = (el: HTMLElement, side: "left" | "top") => Number(new RegExp(`${side}: (-?[\\d.]+)px`).exec(el.getAttribute("style") ?? "")?.[1] ?? 0);
    const at = (el: HTMLElement) => {
      let x = 0;
      let y = 0;
      for (let n: HTMLElement | null = el; n && !n.classList.contains("leaflet-container"); n = n.parentElement) {
        x += px(n, "left");
        y += px(n, "top");
      }
      return [x, y] as const;
    };
    return new Map([...c.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img")].map((t) => [t.getAttribute("src")!, at(t)] as const));
  };
  /** Where a position is drawn in the view, read from the tile that holds it. */
  const screenOf = (c: HTMLElement, p: LatLng, z: number) => {
    const world = L.CRS.EPSG3857.latLngToPoint(L.latLng(p[0], p[1]), z);
    const x = Math.floor(world.x / 256);
    const y = Math.floor(world.y / 256);
    const tile = [...onScreen(c)].find(([src]) => src.endsWith(`/${z}/${x}/${y}.png`));
    expect(tile).toBeDefined();
    return [tile![1][0] + world.x - x * 256, tile![1][1] + world.y - y * 256] as const;
  };

  it("reaches the same view however the position got there (a frame is deterministic)", () => {
    const frame = (path: LatLng[]) => {
      const { container, rerender, unmount } = renderWithStrata(<RouteMap {...props({ routes: [run], position: path[0], follow: "centre", zoom: 14 })} />);
      for (const at of path.slice(1)) rerender(<RouteMap {...props({ routes: [run], position: at, follow: "centre", zoom: 14 })} />);
      const out = onScreen(container);
      unmount();
      return out;
    };
    const target: LatLng = [51.507, -0.105];
    const direct = frame([target]);
    const wandering = frame([[51.5, -0.12], [51.515, -0.095], [51.5071, -0.1052], [51.502, -0.118], target]);
    // Tiles kept from earlier views may differ; every tile both have is in the same place on screen.
    const shared = [...direct.keys()].filter((src) => wandering.has(src));
    expect(shared.length).toBeGreaterThan(4);
        for (const src of shared) expect(wandering.get(src)).toEqual(direct.get(src));
  });

  it("keeps the loaded tiles while the position moves at a constant zoom", () => {
    const at = (n: number): LatLng => [51.507 + n * 0.0002, -0.105 + n * 0.0003];
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ ...same, position: at(0), follow: "centre", zoom: 14 })} />);
    const before = [...container.querySelectorAll("img.leaflet-tile")];
    expect(before.length).toBeGreaterThan(0);
    for (let n = 1; n <= 5; n++) rerender(<RouteMap {...props({ ...same, position: at(n), follow: "centre", zoom: 14 })} />);
    for (const t of before) expect(t.isConnected).toBe(true); // the same elements, not recreated
  });

  it("starts centred on the followed position when the map is first shown, not on the middle of the routes", () => {
    const at: LatLng = [51.5, -0.12];
    const { container } = renderWithStrata(<RouteMap {...props({ ...same, position: at, follow: "centre", zoom: 15 })} />);
    const [x, y] = screenOf(container, at, 15);
    expect(Math.abs(x - 320)).toBeLessThanOrEqual(1);
    expect(Math.abs(y - 180)).toBeLessThanOrEqual(1);
  });

  it("without a zoom, centred follow keeps the zoom the map has", () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ ...same })} />);
    const z = tileZoom(container);
    rerender(<RouteMap {...props({ ...same, position: [51.505, -0.11], follow: "centre" })} />);
    expect(tileZoom(container)).toBe(z);
  });

  it("draws several positions, each in its route's colour, moving without redrawing a route", () => {
    const coloured = [
      { ...run, colour: "rgb(10, 20, 30)" },
      { ...loop, colour: "rgb(200, 100, 50)" },
    ];
    const at = (n: number): MapPosition[] => [
      { id: "a", label: "Runner A", routeId: "run", at: [51.5 + n * 0.001, -0.12 + n * 0.001] },
      { id: "b", label: "Runner B", routeId: "loop", at: [51.5 + n * 0.0005, -0.12 + n * 0.0005] },
    ];
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ routes: coloured, positions: at(0) })} />);
    const before = paths(container);
    expect(before).toHaveLength(4); // two routes, two markers
    expect(before[2].getAttribute("fill")).toBe("rgb(10, 20, 30)");
    expect(before[3].getAttribute("fill")).toBe("rgb(200, 100, 50)");
    const ds = before.slice(2).map((p) => p.getAttribute("d"));
    for (const n of [1, 2, 3]) rerender(<RouteMap {...props({ routes: coloured, positions: at(n) })} />);
    const after = paths(container);
    expect(after).toHaveLength(4);
    for (let i = 0; i < 4; i++) expect(after[i]).toBe(before[i]);
    expect(after[2].getAttribute("d")).not.toBe(ds[0]);
    expect(after[3].getAttribute("d")).not.toBe(ds[1]);
  });

  it("a position's own colour wins, and one with no route uses the theme's primary", () => {
    const { container } = renderWithStrata(
      <RouteMap {...props({ ...same, positions: [{ id: "a", label: "A", routeId: "run", colour: "rgb(1, 2, 3)", at: [51.5, -0.12] }, { id: "b", label: "B", at: [51.505, -0.11] }] })} />,
    );
    const [, , a, b] = paths(container);
    expect(a.getAttribute("fill")).toBe("rgb(1, 2, 3)");
    expect(b.getAttribute("fill")).not.toBe("rgb(1, 2, 3)");
  });

  it("adds and removes positions by id, keeping the ones that stay", () => {
    const a: MapPosition = { id: "a", label: "A", routeId: "run", at: [51.5, -0.12] };
    const b: MapPosition = { id: "b", label: "B", routeId: "loop", at: [51.502, -0.11] };
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ ...same, positions: [a] })} />);
    const markerA = paths(container).at(-1)!;
    rerender(<RouteMap {...props({ ...same, positions: [a, b] })} />);
    expect(paths(container)).toHaveLength(4);
    expect(paths(container)[2]).toBe(markerA);
    rerender(<RouteMap {...props({ ...same, positions: [{ ...a, at: null }, b] })} />);
    expect(paths(container)).toHaveLength(3);
  });

  it("keeps positions above the routes when the routes are redrawn", () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ routes: [run], position: [51.5, -0.12] })} />);
    const marker = paths(container).at(-1)!;
    rerender(<RouteMap {...props({ routes: [{ ...run, colour: "rgb(9, 9, 9)" }], position: [51.5, -0.12] })} />);
    expect(paths(container).at(-1)).toBe(marker);
  });

  it("follows the position named by followId", () => {
    const positions: MapPosition[] = [
      { id: "a", label: "A", routeId: "run", at: [51.5, -0.12] },
      { id: "b", label: "B", routeId: "run", at: [51.51, -0.1] },
    ];
    const { container } = renderWithStrata(<RouteMap {...props({ ...same, positions, follow: "centre", followId: "b", zoom: 15 })} />);
    const [, , a, b] = paths(container);
    const [bx] = screenOf(container, positions[1].at!, 15);
    expect(Math.abs(bx - 320)).toBeLessThanOrEqual(1);
    expect(paths(container)).toHaveLength(4);
    expect(a).not.toBe(b);
  });

  it("names every position in the text alternative, each along its own route", async () => {
    const positions: MapPosition[] = [
      { id: "a", label: "Runner A", routeId: "run", at: [51.505, -0.11] },
      { id: "b", label: "Runner B", routeId: "loop", at: [51.5, -0.12] },
    ];
    const { container } = renderWithStrata(<RouteMap {...props({ ...same, positions })} />);
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    const text = container.querySelector("p.sr-only")!.textContent!;
    expect(text).toMatch(/Wednesday run: [^.]*\.\d* ?[^]*Runner A: [\d.]+\s[mk]m? along\./);
    const park = text.slice(text.indexOf("Park loop"));
    expect(park).toContain("Runner B:");
    expect(park).not.toContain("Runner A:");
    expect(text.slice(0, text.indexOf("Park loop"))).not.toContain("Runner B:");
  });

  it("keeps the single position's text and look beside positions", async () => {
    const { container } = renderWithStrata(<RouteMap {...props({ position: [51.5, -0.12], positions: [{ id: "a", label: "Second", routeId: "run", at: [51.51, -0.1] }] })} />);
    await act(() => new Promise((r) => setTimeout(r, 1100)));
    const text = container.querySelector("p.sr-only")!.textContent!;
    expect(text).toContain("Current position:");
    expect(text).toContain("Second:");
    expect(paths(container)).toHaveLength(5); // one route's line, finish ring and start dot, and the two markers
  });
});

describe("the tile layer", () => {
  // Leaflet picks tiles from floor(centre) ± size/2 but places its pane at round(centre - size/2). A centre a
  // hair under a whole pixel (the float noise of projecting it back from the pane's position) lands a pixel
  // low and leaves the last pixel column with no tile under it, unless a tile from an earlier view is still
  // kept: a visual shot of a centred follow differed by that column about one run in two under load.
  const tileBoundsRelativeToOrigin = (make: (url: string, o: L.TileLayerOptions) => L.TileLayer, nudge: number) => {
    const host = document.createElement("div");
    document.body.append(host);
    const map = L.map(host).setView([51.5, -0.12], 14, { animate: false });
    const layer = make("https://tiles.example.test/{z}/{x}/{y}.png", {}).addTo(map);
    const origin = map.getPixelOrigin();
    const size = map.getSize();
    const centre = map.unproject(L.point(origin.x + size.x / 2 + nudge, origin.y + size.y / 2 + nudge), 14);
    const bounds = (layer as unknown as { _getTiledPixelBounds(c: L.LatLng): L.Bounds })._getTiledPixelBounds(centre);
    map.remove();
    host.remove();
    return { left: bounds.min!.x - origin.x, right: bounds.max!.x - origin.x, width: size.x };
  };

  it("loads tiles under every pixel of the container, whichever way the centre rounds", () => {
    for (const nudge of [-0.000001, 0, 0.000001, -0.4]) {
      const b = tileBoundsRelativeToOrigin(coveringTiles, nudge);
      expect(b.left).toBeLessThanOrEqual(0);
      expect(b.right).toBeGreaterThanOrEqual(b.width);
    }
  });

  it("is needed: Leaflet's own layer misses the last pixel column on a centre a hair low", () => {
    const b = tileBoundsRelativeToOrigin((url, o) => L.tileLayer(url, o), -0.000001);
    expect(b.right).toBeLessThan(b.width);
  });
});
