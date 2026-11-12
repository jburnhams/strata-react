import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CursorScope, geo, useSharedCursor, type LatLng } from "../../src";
import { RouteMap, type MapMarker, type MapRoute, type MapView, type RouteMapProps } from "../../src/map";
import { renderWithStrata } from "../../src/testing";

// Issues #181 (markers), #182 (view and pick) and #184 (the shared cursor on the map). Real Leaflet in
// jsdom, as route-map.test.tsx: the container is given a size, and tiles are elements nothing loads.

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
const routes = [run, loop];
const paths = (c: HTMLElement) => [...c.querySelectorAll<SVGPathElement>(".leaflet-overlay-pane path")];
const props = (over: Partial<RouteMapProps> = {}): RouteMapProps => ({ label: "Route map", routes: [run], tiles: { light }, ...over });
const tileZoom = (c: HTMLElement) => Number(c.querySelector<HTMLImageElement>("img.leaflet-tile")!.src.match(/light\/(\d+)\//)![1]);
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("markers", () => {
  const items: MapMarker[] = [
    { id: "a", label: "Clip 1", at: [51.5, -0.12] },
    { id: "b", label: "Clip 2", at: { routeId: "run", from: 200, to: 900 }, selected: true },
    { id: "c", label: "Clip 3", at: [51.515, -0.095], highlighted: true },
  ];
  const withMarkers = (over: Partial<RouteMapProps> = {}) => props({ routes, markers: items, view: { center: [51.507, -0.105], zoom: 13 }, ...over });

  it("are named controls, selected one pressed, the same count the text alternative gives", () => {
    const { container } = renderWithStrata(<RouteMap {...withMarkers()} />);
    const buttons = screen.getAllByRole("button", { name: /^Clip/ });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Clip 1", "Clip 2", "Clip 3"]);
    expect(screen.getByRole("button", { name: "Clip 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Clip 1" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector("p.sr-only")).toHaveTextContent("3 markers, selected: Clip 2.");
  });

  it("are one tab stop, with arrows, Home and End between them, and press with Enter", async () => {
    const user = userEvent.setup();
    const onMarkerSelect = vi.fn();
    renderWithStrata(<RouteMap {...withMarkers({ onMarkerSelect })} />);
    const [a, b, c] = screen.getAllByRole("button", { name: /^Clip/ });
    expect([a, b, c].map((x) => x.tabIndex)).toEqual([0, -1, -1]);
    a.focus();
    await user.keyboard("{ArrowRight}");
    expect(b).toHaveFocus();
    expect([a, b, c].map((x) => x.tabIndex)).toEqual([-1, 0, -1]);
    await user.keyboard("{End}");
    expect(c).toHaveFocus();
    await user.keyboard("{Home}");
    expect(a).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onMarkerSelect).toHaveBeenCalledWith("a");
    await user.click(c);
    expect(onMarkerSelect).toHaveBeenLastCalledWith("c");
  });

  it("show the app's card on focus, words only", async () => {
    const user = userEvent.setup();
    renderWithStrata(<RouteMap {...withMarkers({ renderMarkerCard: (m) => <span>Card for {m.label}</span> })} />);
    await user.tab();
    // The map's own container is the first stop; the group's one stop follows it.
    screen.getByRole("button", { name: "Clip 1" }).focus();
    expect(await screen.findByText("Card for Clip 1")).toBeInTheDocument();
  });

  it("draw a stretch heavier on its route, with the marker at its middle", () => {
    const { container } = renderWithStrata(<RouteMap {...withMarkers({ markers: [items[1]] })} />);
    const widths = paths(container).map((p) => Number(p.getAttribute("stroke-width")));
    expect(Math.max(...widths)).toBeGreaterThan(4 + 2); // the route is 4, the stretch heavier
    expect(screen.getAllByRole("button", { name: /Clip 2/ })).toHaveLength(1);
  });

  it("fan overlapping markers apart with a leader line, and not the ones that are alone", () => {
    const pile: MapMarker[] = [
      { id: "p1", label: "Pile 1", at: [51.507, -0.105] },
      { id: "p2", label: "Pile 2", at: [51.507, -0.105] },
      { id: "p3", label: "Pile 3", at: [51.507, -0.105] },
      { id: "solo", label: "Solo", at: [51.5, -0.12] },
    ];
    const { container } = renderWithStrata(<RouteMap {...withMarkers({ markers: pile })} />);
    const dashed = paths(container).filter((p) => p.getAttribute("stroke-dasharray") === "2 3");
    expect(dashed).toHaveLength(3); // one leader per fanned marker, none for Solo
    const iconOf = (name: string) => screen.getByRole("button", { name }).closest<HTMLElement>(".leaflet-marker-icon")!;
    const at = (name: string) => {
      const m = /translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px/.exec(iconOf(name).getAttribute("style") ?? "") ?? [];
      return [Number(m[1] ?? iconOf(name).style.left.replace("px", "")), Number(m[2] ?? iconOf(name).style.top.replace("px", ""))];
    };
    expect(at("Pile 1")).not.toEqual(at("Pile 2"));
  });

  it("settle as the map zooms in: no fan, no leader lines", () => {
    const close: MapMarker[] = [
      { id: "p1", label: "Near 1", at: [51.507, -0.105] },
      { id: "p2", label: "Near 2", at: [51.5071, -0.105] },
    ];
    const { container, rerender } = renderWithStrata(<RouteMap {...withMarkers({ markers: close })} />);
    expect(paths(container).filter((p) => p.getAttribute("stroke-dasharray") === "2 3")).toHaveLength(2);
    rerender(<RouteMap {...withMarkers({ markers: close, view: { center: [51.507, -0.105], zoom: 18 } })} />);
    expect(paths(container).filter((p) => p.getAttribute("stroke-dasharray") === "2 3")).toHaveLength(0);
  });

  it("draw only the markers near the view", () => {
    const many: MapMarker[] = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, label: `Item ${i}`, at: [48 + (i % 20) * 0.5, 2 + Math.floor(i / 20) * 0.5] as LatLng }));
    renderWithStrata(<RouteMap {...withMarkers({ markers: [...many, items[0]] })} />);
    expect(screen.getAllByRole("button", { name: /^(Item|Clip)/ })).toHaveLength(1); // Clip 1 only: the rest are far away
  });

  it("have a key naming the states that are on the map, or none", () => {
    const { rerender } = renderWithStrata(<RouteMap {...withMarkers({ markerKey: { marker: "Clip", selected: "Open clip", highlighted: "Newest draft" } })} />);
    const key = screen.getByText("Open clip").closest("ul")!;
    expect(within(key).getByText("Clip")).toBeInTheDocument();
    expect(within(key).getByText("Newest draft")).toBeInTheDocument();
    rerender(<RouteMap {...withMarkers({ markers: [items[0]] })} />);
    expect(screen.queryByText("Selected")).toBeNull();
    expect(screen.getByText("Item")).toBeInTheDocument();
    rerender(<RouteMap {...withMarkers({ markerKey: false })} />);
    expect(screen.queryByText("Item")).toBeNull();
  });

  it("moves a marker without recreating it", () => {
    const { rerender } = renderWithStrata(<RouteMap {...withMarkers({ markers: [items[0]] })} />);
    const button = screen.getByRole("button", { name: "Clip 1" });
    rerender(<RouteMap {...withMarkers({ markers: [{ ...items[0], at: [51.5001, -0.1199] }] })} />);
    expect(screen.getByRole("button", { name: "Clip 1" })).toBe(button);
  });

  it("cleans up on unmount", () => {
    const { unmount } = renderWithStrata(<RouteMap {...withMarkers()} />);
    expect(() => unmount()).not.toThrow();
  });
});

describe("the view", () => {
  it("reports the view once it settles after the person moves it, with bounds, zoom and centre", async () => {
    const seen: MapView[] = [];
    renderWithStrata(<RouteMap {...props({ onViewChange: (v) => seen.push(v), settle: 30 })} />);
    await wait(80);
    expect(seen).toHaveLength(0); // the first fit is the app's own
    const zoom = () => (document.querySelector(".leaflet-container") as HTMLElement).querySelector("img.leaflet-tile")!;
    void zoom;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(seen).toHaveLength(0); // not yet: debounced
    await wait(80);
    expect(seen).toHaveLength(1); // once, for both
    const [v] = seen;
    expect(v.zoom).toBeGreaterThan(10);
    expect(v.bounds[0][0]).toBeLessThan(v.center[0]);
    expect(v.bounds[1][0]).toBeGreaterThan(v.center[0]);
    expect(v.bounds[0][1]).toBeLessThan(v.center[1]);
  });

  it("does not report moves the app makes through props, unless asked", async () => {
    const seen: MapView[] = [];
    const { rerender } = renderWithStrata(<RouteMap {...props({ onViewChange: (v) => seen.push(v), settle: 20, zoom: 12 })} />);
    rerender(<RouteMap {...props({ onViewChange: (v) => seen.push(v), settle: 20, zoom: 14 })} />);
    rerender(<RouteMap {...props({ onViewChange: (v) => seen.push(v), settle: 20, zoom: 14, view: { center: [51.51, -0.1], zoom: 15 } })} />);
    rerender(<RouteMap {...props({ onViewChange: (v) => seen.push(v), settle: 20, zoom: 14, follow: "centre", position: [51.505, -0.11] })} />);
    await wait(80);
    expect(seen).toHaveLength(0);
    const loud: MapView[] = [];
    const again = renderWithStrata(<RouteMap {...props({ onViewChange: (v) => loud.push(v), reportAppMoves: true, settle: 20, zoom: 12 })} />);
    await wait(80);
    expect(loud.length).toBeGreaterThan(0);
    again.unmount();
  });

  it("shows a given view, and goes to a new one when the app sets it", () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ view: { center: [51.5, -0.12], zoom: 15 } })} />);
    expect(tileZoom(container)).toBe(15);
    rerender(<RouteMap {...props({ view: { center: [51.5, -0.12], zoom: 11 } })} />);
    expect(tileZoom(container)).toBe(11);
  });

  it("has a reset control in the control group that fits the routes again, and reports it as the person's move", async () => {
    const seen: MapView[] = [];
    const { container } = renderWithStrata(<RouteMap {...props({ onViewChange: (v) => seen.push(v), settle: 20 })} />);
    const fitted = tileZoom(container);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await wait(60);
    seen.length = 0;
    expect(container.querySelector(".leaflet-top.leaflet-left .strata-map-reset")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(tileZoom(container)).toBe(fitted);
    await wait(60);
    expect(seen).toHaveLength(1);
  });

  it("resets to the given view when there is one, and by the keyboard", () => {
    const { container } = renderWithStrata(<RouteMap {...props({ view: { center: [51.5, -0.12], zoom: 15 } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Reset view" }), { key: " " });
    expect(tileZoom(container)).toBe(15);
  });
});

describe("picking a place", () => {
  const at = (container: HTMLElement) => container.querySelector<HTMLElement>(".leaflet-container")!;

  it("does nothing on a click when not picking", () => {
    const onPick = vi.fn();
    const { container } = renderWithStrata(<RouteMap {...props({ onPick })} />);
    fireEvent.click(at(container), { clientX: 320, clientY: 180 });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("picks by pointer with the nearest route, and announces it", () => {
    const onPick = vi.fn();
    const { container } = renderWithStrata(<RouteMap {...props({ routes, picking: true, onPick, view: { center: [51.505, -0.11], zoom: 15 } })} />);
    // The view is centred on a vertex of both routes, so the centre of the map is on them.
    fireEvent.click(at(container), { clientX: 320, clientY: 180 });
    expect(onPick).toHaveBeenCalledTimes(1);
    const [latlng, info] = onPick.mock.calls[0];
    expect(latlng[0]).toBeCloseTo(51.505, 3);
    expect(latlng[1]).toBeCloseTo(-0.11, 3);
    expect(info.nearest.distanceM).toBeLessThan(15);
    expect(["run", "loop"]).toContain(info.nearest.routeId);
    expect(container.querySelector("p[role=status]")).toHaveTextContent(/Picked 51\.50\d+, -0\.1\d+\. Nearest: (Wednesday run|Park loop), [\d.]+\s[mk]m? along, [\d.]+\sm from the route\./);
  });

  it("has a visible mode: a crosshair cursor, the banner, and Escape asks to cancel", () => {
    const onPickCancel = vi.fn();
    const { container } = renderWithStrata(<RouteMap {...props({ picking: true, onPickCancel, pickBanner: <p>Click the map to set the point</p> })} />);
    expect(container.querySelector(".strata-map-picking")).not.toBeNull();
    expect(screen.getByText("Click the map to set the point")).toBeInTheDocument();
    fireEvent.keyDown(at(container), { key: "Escape" });
    expect(onPickCancel).toHaveBeenCalledTimes(1);
  });

  it("picks by keyboard: arrows move a crosshair, Enter chooses where it is", () => {
    const onPick = vi.fn();
    const { container } = renderWithStrata(<RouteMap {...props({ picking: true, onPick, view: { center: [51.505, -0.11], zoom: 15 } })} />);
    const map = at(container);
    fireEvent.keyDown(map, { key: "Enter" });
    const [centre] = onPick.mock.calls[0];
    expect(centre[0]).toBeCloseTo(51.505, 4);
    expect(container.querySelector(".strata-map-crosshair")).toBeNull(); // not drawn until the keys are used
    fireEvent.keyDown(map, { key: "ArrowRight" });
    fireEvent.keyDown(map, { key: "ArrowRight", shiftKey: true });
    expect(container.querySelector(".strata-map-crosshair")).not.toBeNull();
    fireEvent.keyDown(map, { key: "Enter" });
    const [moved] = onPick.mock.calls[1];
    expect(moved[1]).toBeGreaterThan(centre[1]); // east of the centre
    // 60 px at zoom 15 is about 60 * 4.78 m / cos(lat) in longitude: a few hundredths of a millidegree each.
    expect(moved[0]).toBeCloseTo(centre[0], 4); // not north or south
  });

  it("stops Leaflet's own arrow pan while picking, and gives it back afterwards", () => {
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ picking: true })} />);
    const before = container.querySelector(".leaflet-map-pane")!.getAttribute("style");
    fireEvent.keyDown(at(container), { key: "ArrowLeft" });
    expect(container.querySelector(".leaflet-map-pane")!.getAttribute("style")).toBe(before);
    rerender(<RouteMap {...props({ picking: false })} />);
    expect(container.querySelector(".strata-map-picking")).toBeNull();
    expect(container.querySelector(".strata-map-crosshair")).toBeNull();
  });

  it("makes route lines stop taking clicks while picking, so a pick near the route picks", () => {
    const onSelect = vi.fn();
    const { container, rerender } = renderWithStrata(<RouteMap {...props({ routes, onSelect })} />);
    expect(container.querySelector(".leaflet-interactive")).not.toBeNull();
    rerender(<RouteMap {...props({ routes, onSelect, picking: true })} />);
    expect(container.querySelector(".leaflet-interactive")).toBeNull();
  });
});

describe("the shared cursor on the map", () => {
  function Reader({ onRead }: { onRead: (at: number | null) => void }) {
    const c = useSharedCursor("reader");
    onRead(c?.at ?? null);
    return null;
  }
  function Writer({ at }: { at: number | null }) {
    const c = useSharedCursor("writer");
    const set = c?.setPointer;
    React.useEffect(() => {
      set?.(at);
    }, [set, at]);
    return null;
  }

  it("draws another member's distance as a ring on the route", () => {
    const total = geo.length(run.points);
    const { container } = renderWithStrata(
      <CursorScope>
        <RouteMap {...props({ cursor: true })} />
        <Writer at={total / 2} />
      </CursorScope>,
    );
    const rings = paths(container).filter((p) => p.getAttribute("fill") === "none" || p.getAttribute("fill-opacity") === "0");
    expect(rings.length).toBeGreaterThan(0);
  });

  it("moves the ring without redrawing a route, and removes it when the cursor leaves", () => {
    const total = geo.length(run.points);
    const same = props({ cursor: true }); // an app keeps its routes in one array
    const { container, rerender } = renderWithStrata(
      <CursorScope>
        <RouteMap {...same} />
        <Writer at={total * 0.25} />
      </CursorScope>,
    );
    const before = paths(container);
    rerender(
      <CursorScope>
        <RouteMap {...same} />
        <Writer at={total * 0.75} />
      </CursorScope>,
    );
    const after = paths(container);
    expect(after).toHaveLength(before.length);
    expect(after[0]).toBe(before[0]);
    rerender(
      <CursorScope>
        <RouteMap {...same} />
        <Writer at={null} />
      </CursorScope>,
    );
    expect(paths(container).length).toBe(before.length - 1);
  });

  it("writes the distance along the route when the pointer is near it, and clears when it is not", () => {
    const reads: (number | null)[] = [];
    const { container } = renderWithStrata(
      <CursorScope>
        <RouteMap {...props({ routes: [run], cursor: true, view: { center: run.points[1] as LatLng, zoom: 15 } })} />
        <Reader onRead={(a) => reads.push(a)} />
      </CursorScope>,
    );
    const map = container.querySelector<HTMLElement>(".leaflet-container")!;
    // The centre of the view is the route's second point.
    fireEvent.mouseMove(map, { clientX: 320, clientY: 180 });
    const expected = geo.cumulative(run.points)[1];
    expect(reads.at(-1)).not.toBeNull();
    expect(Math.abs(reads.at(-1)! - expected)).toBeLessThan(10);
    fireEvent.mouseMove(map, { clientX: 20, clientY: 340 }); // far from the line
    expect(reads.at(-1)).toBeNull();
  });

  it("does nothing outside a scope, and does not draw its own writes", () => {
    const { container } = renderWithStrata(<RouteMap {...props({ cursor: true })} />);
    expect(container.querySelector(".leaflet-container")).not.toBeNull();
    const reads: (number | null)[] = [];
    const lone = renderWithStrata(
      <CursorScope>
        <RouteMap {...props({ routes: [run], cursor: true, view: { center: run.points[1] as LatLng, zoom: 15 } })} />
      </CursorScope>,
    );
    const before = paths(lone.container).length;
    fireEvent.mouseMove(lone.container.querySelector<HTMLElement>(".leaflet-container")!, { clientX: 320, clientY: 180 });
    expect(paths(lone.container)).toHaveLength(before); // the map's own pointer is not drawn back at it
    void reads;
  });
});
