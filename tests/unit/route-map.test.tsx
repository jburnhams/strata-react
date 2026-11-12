import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { RouteMap, type MapRoute, type RouteMapProps } from "../../src/map";
import { renderWithStrata } from "../../src/testing";

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
