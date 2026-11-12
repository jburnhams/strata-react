import * as React from "react";
import L from "leaflet";
import { useColorScheme } from "../components/theme";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { geo, type LatLng } from "../lib/geo";
import { installMapStyles } from "./map-styles";

// A themed map of routes with a position that moves along them (strata-react issue #80, from
// strata-vid's MapPanel and jonathanburnhams.com's activity maps). It is behind its own entry,
// `strata-react/map`, because Leaflet is heavy and an app that draws no maps should not install it:
// Leaflet is an optional peer and nothing in the main entry imports it.
//
// Leaflet, without react-leaflet (Jonathan's choice, 2026-11-12). react-leaflet binds every layer to
// a React element, so a position that moves sixty times a second re-renders the route elements
// beside it; here the map is made once, the routes are one effect that runs only when the routes
// change, and the position is another that calls `setLatLng` on one marker. A position update
// touches nothing else: no route is redrawn, none is recreated.
//
// What the app supplies, and what the component decides:
// - Tiles are the app's (`tiles.light`, `tiles.dark`, each with the attribution its provider
//   requires, shown on the map). A dark scheme uses `tiles.dark` when there is one, else the light
//   tiles under a filter (see map-styles.ts); the choice follows the colour scheme.
// - Colours are roles. A route's colour is any CSS colour (`var(--chart-2)`, `var(--info)`), resolved
//   against the map's own element so SVG strokes, which Leaflet writes as attributes, get a real
//   colour that follows the scheme. Routes default to the chart palette in order.
// - Colour by value (`values` on a route plus `colourScale`) follows LineChart's rules (§3.8): the
//   colour is a fact of the subject, steps are the app's, and a key names them (`colourScaleLabel`
//   and the step thresholds through `formatValue`) so colour is never the only cue. Runs of one
//   step are drawn as one line, so a long route is a few polylines, not thousands.
// - One route is the common case: it gets direction chevrons and start and finish marks (a loop is
//   one mark) by default; with several routes those are off unless a route asks.
// - Fit-to-content happens on first show and when the set of routes changes, not when a route's
//   points are replaced by the same ids, so a person who has zoomed is not thrown back.
// - Overlay slots, `topEnd` and `bottomStart`, sit where Leaflet puts nothing (it uses the top
//   start for zoom and the bottom end for attribution), so an app's own control or figure never
//   covers a required notice.
//
// Keyboard and screen readers. Leaflet's container is a focus stop: arrows pan, + and − zoom. It is
// named by `label` and described by a text alternative that says what is drawn (each route, its
// length, whether it is a loop, and how far along the position is), written from the data or given
// as `summary`. Hovering a route or a mark is a bonus; its facts are in that text. Choosing a route
// is `onSelect`, and a screen that lets a person choose one lists its routes beside the map (a
// pointer click on a line has no keyboard equivalent inside Leaflet's SVG, so the list is the path).
//
// Map as picture content (issue #161, from strata-vid, where a route inset is composed over footage and
// must look the same on every frame as in an export drawn on a canvas). Three additions, none of which
// changes a page map: `zoom` sets the zoom from outside (any number, so an animation is a prop that
// changes every frame; unset keeps fit-to-routes), `follow="centre"` holds the view on a position at that
// zoom, and `positions` draws several moving positions, each tied to a route and drawn in its colour.
// Centred follow pans to a whole-pixel view worked out from the position and zoom alone (`centre`), with
// no animation: Leaflet's own centred pan truncates each step, so where the view ended up would depend
// on the path it took; this depends only on the position and zoom, which is what makes frame N the same
// picture however it was reached. A `reset` would give the same view but empties the tile layer on every
// call, which flickers at one update per frame.
// Fractional zoom needs `zoomSnap: 0`, which is set only while `zoom` is controlled, so a page map still
// snaps to half steps. Each marker is one `L.CircleMarker` kept by id and moved with `setLatLng`.
//
// No animation: zoom, fade and inertia are off, because a map is panned all the time and a tile
// fade makes a screenshot depend on timing (character by frequency, and strata-visual).
//
// Checked: React Aria has no map or geographic part. Leaflet's own keyboard handler and focus are
// kept as they are.

/** A source of map tiles: a URL template the app's provider documents, and the attribution it requires. */
export type TileSource = {
  /** `https://tiles.example.com/{z}/{x}/{y}.png`; `{s}` and `{r}` work as in Leaflet. */
  url: string;
  /** What the provider requires shown (HTML allowed: "© OpenStreetMap contributors"). */
  attribution: string;
  subdomains?: string;
  minZoom?: number;
  maxZoom?: number;
};

/** One route on the map. */
export type MapRoute = {
  id: string;
  /** Its name, in the text alternative and on hover ("Wednesday run"). */
  label: string;
  points: readonly LatLng[];
  /** Any CSS colour, normally a role (`var(--chart-2)`). Default: the chart palette in order. */
  colour?: string;
  /** Line width in pixels. Default 4. */
  weight?: number;
  /** One value per point, coloured by `colourScale` (speed, elevation, heart rate). */
  values?: readonly number[];
  /** Direction chevrons along the line: true for five, or a count. Default on for a single route. */
  arrows?: boolean | number;
  /** Start and finish marks. Default on for a single route. */
  ends?: boolean;
};

/** One moving position, for a map with more than one (two runners on the same loop). */
export type MapPosition = {
  /** Stable between renders: the marker is kept by it and moved, never recreated. */
  id: string;
  /** Where it is now; null hides it. */
  at: LatLng | null;
  /** What it is called in the text alternative ("Runner A"). */
  label: string;
  /** The route it travels. Its marker takes that route's colour and the text alternative says how far along it is. */
  routeId?: string;
  /** Any CSS colour, normally a role. Overrides the route's. Default: the route's colour, else the theme's primary. */
  colour?: string;
};

export type RouteMapProps = {
  /** Names the map ("Route of Wednesday's run"). */
  label: string;
  /** Keep this array stable between renders (state or `useMemo`): the routes are redrawn when it changes, which a moving position must not cause. */
  routes: readonly MapRoute[];
  tiles: { light: TileSource; dark?: TileSource };
  /** Where the moving thing is now. Moved without redrawing any route; null for none. */
  position?: LatLng | null;
  /** What the position is called in the text alternative. Default "Current position". */
  positionLabel?: string;
  /** More moving positions, each in its route's colour and named in the text alternative. Moved without redrawing any route; `position` may be used beside them. */
  positions?: readonly MapPosition[];
  /** Which position `follow` tracks: a `positions` id. Default `position`, else the first of `positions` that is shown. */
  followId?: string;
  /** `true` pans only when the position leaves the inner 80% of the view; `"centre"` keeps it exactly in the centre on every update, with no animation (a frame is deterministic), at `zoom` when that is set, else the zoom the map has. */
  follow?: boolean | "centre";
  /** The zoom level, any number (12, 14.5): it may change every frame without redrawing routes. Unset, the map fits its routes and the person zooms. */
  zoom?: number;
  /** The route drawn heavier, with the others lighter. */
  selectedId?: string | null;
  /** A route line was pressed. Give the app's own list of routes the same action for the keyboard. */
  onSelect?: (id: string) => void;
  /** Step colours for routes that have `values`: a step starts at `at` and runs to the next. */
  colourScale?: readonly { at: number; colour: string }[];
  /** What the colours mean, written in the key ("Speed"). */
  colourScaleLabel?: string;
  /** Writes a value in the key and the text alternative ("12 km/h"). Default the plain number. */
  formatValue?: (value: number) => string;
  /** Replaces the generated text alternative. */
  summary?: string;
  /** Units for lengths in the generated text. Default metric. */
  units?: "metric" | "imperial";
  /** Wheel zoom. Off by default so the page still scrolls past the map. */
  scrollZoom?: boolean;
  /** An app control or figure in the top end corner (Leaflet leaves it free). */
  topEnd?: React.ReactNode;
  /** An app legend or figure in the bottom start corner, below the colour key when there is one. */
  bottomStart?: React.ReactNode;
  /** Layout only. The map is 16:9 and at least 16rem tall unless a height is given. */
  className?: string;
};

/** The smallest and largest value, without spreading the array (a long recording passes the engine's argument limit). */
function extent(values: readonly number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

const tuple = (p: LatLng): L.LatLngTuple => [p[0], p[1]];
const plain = (v: number) => String(v);

/** `value`, sampled once a second (a throttle, not a debounce: a value that changes every frame still comes through): for text a screen reader may read, which must not change sixty times a second. */
function useSlow<T>(value: T, ms = 1000): T {
  const [slow, setSlow] = React.useState(value);
  const latest = React.useRef(value);
  latest.current = value;
  React.useEffect(() => {
    const id = window.setInterval(() => setSlow(latest.current), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return slow;
}

const SINGLE = "\u0000position";
const PALETTE = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

/**
 * Put `target` in the exact middle of the view at zoom `z`, with no animation and without throwing the
 * loaded tiles away. A zoom change goes through `setView` (Leaflet redraws its tiles then anyway). The
 * position is then set by panning to a whole-pixel top-left worked out from the target and the zoom
 * alone, so where the view ends up does not depend on the path taken (Leaflet's own centred pan
 * truncates each step and drifts); a `reset` would be exact too but empties the tile layer on every
 * call, which flickers when the position changes every frame.
 */
function centre(map: L.Map, target: LatLng, z: number) {
  if (map.getZoom() !== z) map.setView(tuple(target), z, { animate: false });
  const want = map.project(tuple(target), z).subtract(map.getSize().divideBy(2)).round();
  const have = map.getPixelBounds().min!.round();
  const move = want.subtract(have);
  if (move.x || move.y) map.panBy(move, { animate: false, noMoveStart: true });
}

/** The colour a CSS value (a `var()`, a role) resolves to on `el`, so an SVG attribute gets a real one. Falls back to the value itself. */
function resolveColour(el: HTMLElement, value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  el.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || value;
}

/** Indices where a run of one step ends, so a coloured route is a few polylines. */
function stepRuns(points: readonly LatLng[], values: readonly number[], stepOf: (v: number) => number) {
  const runs: { from: number; to: number; step: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const step = stepOf(((values[i - 1] ?? 0) + (values[i] ?? 0)) / 2);
    const last = runs[runs.length - 1];
    if (last && last.step === step) last.to = i;
    else runs.push({ from: i - 1, to: i, step });
  }
  return runs;
}

const arrowHtml = (bearing: number, colour: string, halo: string) =>
  `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style="transform: rotate(${bearing.toFixed(0)}deg)">` +
  `<path d="M6 17 L13 9 L20 17" fill="none" stroke="${halo}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="M6 17 L13 9 L20 17" fill="none" stroke="${colour}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** A map of one or more routes with a position that moves along them, on tiles the app supplies, themed from its roles. Leaflet, behind `strata-react/map`. */
export function RouteMap({
  label,
  routes,
  tiles,
  position = null,
  positionLabel = "Current position",
  positions,
  followId,
  follow = false,
  zoom,
  selectedId = null,
  onSelect,
  colourScale,
  colourScaleLabel,
  formatValue = plain,
  summary,
  units = "metric",
  scrollZoom = false,
  topEnd,
  bottomStart,
  className,
}: RouteMapProps) {
  const { scheme } = useColorScheme();
  const host = React.useRef<HTMLDivElement>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = React.useState<L.Map | null>(null);
  const summaryId = React.useId();
  const latest = React.useRef({ onSelect });
  latest.current = { onSelect };
  const selectable = Boolean(onSelect);
  // One marker per position, by id, with the style last applied so a moving marker is not restyled every frame.
  const markers = React.useRef(new Map<string, { marker: L.CircleMarker; style: string }>());

  const darkTiles = scheme === "dark" ? tiles.dark : undefined;
  const source = darkTiles ?? tiles.light;
  const treated = scheme === "dark" && !tiles.dark;
  const stops = React.useMemo(() => (colourScale ? [...colourScale].sort((a, b) => a.at - b.at) : []), [colourScale]);

  // The map, made once. Its container is Leaflet's; React owns only the wrapper around it.
  React.useEffect(() => {
    installMapStyles();
    const el = host.current;
    if (!el) return;
    const m = L.map(el, { scrollWheelZoom: scrollZoom, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false, inertia: false, attributionControl: false, zoomSnap: 0.5 });
    L.control.attribution({ prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(m);
    el.setAttribute("aria-roledescription", "map");
    // Leaflet follows the window, not its container; a pane that resizes (a Workspace split) needs the same.
    const ro = new ResizeObserver(() => m.invalidateSize({ animate: false }));
    ro.observe(el);
    setMap(m);
    return () => {
      ro.disconnect();
      markers.current.clear();
      m.remove();
      setMap(null);
    };
    // The wheel setting is applied below, so the map is not rebuilt for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!map) return;
    if (scrollZoom) map.scrollWheelZoom.enable();
    else map.scrollWheelZoom.disable();
  }, [map, scrollZoom]);

  // A zoom set from outside is any number; Leaflet snaps to `zoomSnap`, so it is 0 while zoom is controlled.
  const zoomed = zoom !== undefined;
  React.useEffect(() => {
    if (map) map.options.zoomSnap = zoomed ? 0 : 0.5;
  }, [map, zoomed]);

  // Every position on the map, the single `position` first: what is spoken, drawn and followed.
  const all = React.useMemo<MapPosition[]>(() => [...(position ? [{ id: SINGLE, at: position, label: positionLabel }] : []), ...(positions ?? [])], [position, positionLabel, positions]);

  // The text alternative: written from the data unless the app gives one. The position is in it, but
  // it is not a live region: a position that moves many times a second must not be announced.
  const spoken = useSlow(all);
  const text = React.useMemo(() => {
    if (summary) return summary;
    if (!routes.length) return "No routes to show.";
    const parts = routes.map((r) => {
      const along = geo.cumulative(r.points);
      const total = along[along.length - 1] ?? 0;
      const ends = geo.ends(r.points);
      const shape = ends?.loop ? ", a loop" : "";
      let here = "";
      // A position tied to another route is not on this one; one tied to no route is described along each.
      for (const p of spoken) {
        if (!p.at || !r.points.length || (p.routeId !== undefined && p.routeId !== r.id && routes.some((o) => o.id === p.routeId))) continue;
        here += ` ${p.label}: ${format.distance(along[geo.nearest(r.points, p.at)] ?? 0, units)} along.`;
      }
      let range = "";
      if (stops.length && r.values?.length) range = ` ${colourScaleLabel ?? "Value"} from ${formatValue(extent(r.values)[0])} to ${formatValue(extent(r.values)[1])}.`;
      return `${r.label}: ${format.distance(total, units)}${shape}.${range}${here}`;
    });
    return `Map with ${routes.length === 1 ? "one route" : `${routes.length} routes`}. ${parts.join(" ")}`;
  }, [summary, routes, spoken, units, stops.length, colourScaleLabel, formatValue]);

  React.useEffect(() => {
    if (!map) return;
    const c = map.getContainer();
    c.setAttribute("aria-label", label);
    c.setAttribute("aria-describedby", summaryId);
  }, [map, label, summaryId]);

  // Tiles: the light set, or the dark one in the dark scheme.
  React.useEffect(() => {
    if (!map) return;
    const layer = L.tileLayer(source.url, { attribution: source.attribution, subdomains: source.subdomains ?? "abc", minZoom: source.minZoom, maxZoom: source.maxZoom ?? 19, keepBuffer: 1 });
    layer.addTo(map);
    return () => void layer.remove();
  }, [map, source.url, source.attribution, source.subdomains, source.minZoom, source.maxZoom]);

  // The routes: redrawn when the routes, the scheme (colours resolve differently), the selection or
  // the scale change, and never for a position update.
  React.useEffect(() => {
    if (!map) return;
    const group = L.featureGroup().addTo(map);
    const el = map.getContainer();
    const halo = resolveColour(el, "var(--background)");
    const single = routes.length === 1;
    const stepOf = (v: number) => {
      let at = 0;
      stops.forEach((s, i) => {
        if (s.at <= v) at = i;
      });
      return at;
    };
    routes.forEach((route, index) => {
      if (route.points.length < 2) return;
      const base = resolveColour(el, route.colour ?? PALETTE[index % PALETTE.length]);
      const selected = route.id === selectedId;
      const dim = selectedId !== null && !selected;
      const weight = (route.weight ?? 4) + (selected ? 2 : 0);
      const style = { weight, opacity: dim ? 0.55 : 1, lineCap: "round" as const, lineJoin: "round" as const, interactive: selectable, bubblingMouseEvents: false };
      const lines: L.Polyline[] = [];
      if (stops.length && route.values?.length) {
        for (const run of stepRuns(route.points, route.values, stepOf)) {
          lines.push(L.polyline(route.points.slice(run.from, run.to + 1).map(tuple), { ...style, color: resolveColour(el, stops[run.step].colour) }));
        }
      } else {
        lines.push(L.polyline(route.points.map(tuple), { ...style, color: base }));
      }
      for (const line of lines) {
        line.bindTooltip(route.label, { sticky: true });
        line.on("click", () => latest.current.onSelect?.(route.id));
        line.addTo(group);
      }
      const chevrons = route.arrows === undefined ? (single ? 5 : 0) : route.arrows === true ? 5 : route.arrows === false ? 0 : route.arrows;
      if (chevrons > 0) {
        for (const a of geo.arrows(route.points, chevrons)) {
          L.marker(tuple(a.position), {
            interactive: false,
            keyboard: false,
            icon: L.divIcon({ className: "strata-map-arrow", iconSize: [26, 26], iconAnchor: [13, 13], html: arrowHtml(a.bearing, base, halo) }),
          }).addTo(group);
        }
      }
      if (route.ends ?? single) {
        const ends = geo.ends(route.points);
        if (ends) {
          const success = resolveColour(el, "var(--success)");
          const danger = resolveColour(el, "var(--danger)");
          const mark = (at: LatLng, text: string, options: L.CircleMarkerOptions) => L.circleMarker(tuple(at), { radius: 7, interactive: true, bubblingMouseEvents: false, ...options }).bindTooltip(text).addTo(group);
          // Shapes carry the meaning as well as colour: a filled start, a ringed finish, one of each for a loop.
          if (ends.loop) mark(ends.start, `${route.label}: start and finish`, { color: danger, weight: 3, fillColor: success, fillOpacity: 1 });
          else {
            mark(ends.finish, `${route.label}: finish`, { color: danger, weight: 3, fillColor: halo, fillOpacity: 1 });
            mark(ends.start, `${route.label}: start`, { color: halo, weight: 2, fillColor: success, fillOpacity: 1 });
          }
        }
      }
    });
    // Redrawn routes are new layers: keep the positions above them.
    for (const { marker } of markers.current.values()) marker.bringToFront();
    return () => void group.remove();
  }, [map, routes, scheme, selectedId, stops, selectable]);

  // The position a followed view is held on: read by the fit (a map shown for the first time starts
  // centred on it) and by the position effect.
  const target = React.useMemo(() => {
    if (!follow) return null;
    const shown = all.filter((p) => p.at);
    return (followId ? shown.find((p) => p.id === followId) : shown[0])?.at ?? null;
  }, [all, follow, followId]);
  const latestView = React.useRef({ target, zoom, centred: follow === "centre" });
  latestView.current = { target, zoom, centred: follow === "centre" };

  // Fit to the routes when the map first has a size and whenever the set of routes changes. With a
  // zoom set there is nothing to fit: the view is placed at that zoom, on the followed position when
  // the map is centred on one, else on the middle of the routes.
  const routeKey = routes.map((r) => r.id).join("\n");
  const fitted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!map) return;
    const fit = () => {
      const size = map.getSize();
      if (fitted.current === routeKey || size.x === 0 || size.y === 0) return;
      const box = geo.bounds(routes.flatMap((r) => r.points));
      if (!box) return;
      fitted.current = routeKey;
      const view = latestView.current;
      if (view.zoom !== undefined) {
        const centre: LatLng = (view.centred && view.target) || [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2];
        map.setView(tuple(centre), view.zoom, { animate: false });
      } else map.fitBounds([tuple(box[0]), tuple(box[1])], { padding: [24, 24], animate: false, maxZoom: 17 });
    };
    fit();
    map.on("resize", fit);
    return () => void map.off("resize", fit);
    // `routes` is read when the key says the set changed; a new array of the same ids does not refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey]);

  // A zoom that changes after the first view (an animation) moves the zoom about the view's centre.
  React.useEffect(() => {
    if (map && zoom !== undefined && fitted.current !== null && map.getZoom() !== zoom) map.setZoom(zoom, { animate: false });
  }, [map, zoom]);

  // The positions: one marker each, kept by id and moved with `setLatLng`. No route is touched.
  React.useEffect(() => {
    if (!map) return;
    const el = map.getContainer();
    const live = markers.current;
    const seen = new Set<string>();
    for (const p of all) {
      if (!p.at) continue;
      seen.add(p.id);
      let entry = live.get(p.id);
      if (!entry) {
        entry = { marker: L.circleMarker(tuple(p.at), { radius: 8, weight: 3, fillOpacity: 1, interactive: false }).addTo(map), style: "" };
        live.set(p.id, entry);
      } else entry.marker.setLatLng(tuple(p.at));
      const index = routes.findIndex((r) => r.id === p.routeId);
      const spec = p.colour ?? (index >= 0 ? (routes[index].colour ?? PALETTE[index % PALETTE.length]) : "var(--primary)");
      const style = `${scheme}|${spec}`;
      if (entry.style !== style) {
        entry.style = style;
        entry.marker.setStyle({ color: resolveColour(el, "var(--background)"), fillColor: resolveColour(el, spec) });
      }
    }
    for (const [id, entry] of live) {
      if (seen.has(id)) continue;
      entry.marker.remove();
      live.delete(id);
    }
    if (!target) return;
    if (follow === "centre") {
      // Before the first fit with no zoom set there is no zoom to hold; the fit places the view.
      const z = zoom ?? (fitted.current === null ? undefined : map.getZoom());
      if (z !== undefined) centre(map, target, z);
    } else if (!map.getBounds().pad(-0.2).contains(tuple(target))) map.panTo(tuple(target), { animate: false });
  }, [map, all, routes, scheme, follow, target, zoom]);

  return (
    <div ref={root} data-dark-treatment={treated ? "" : undefined} className={cn("strata-map relative isolate aspect-video min-h-64 overflow-hidden rounded-surface border border-border", className)}>
      <div ref={host} className="size-full" />
      <p id={summaryId} className="sr-only">
        {text}
      </p>
      {topEnd && <div className="absolute top-2 right-2 z-1000">{topEnd}</div>}
      {(stops.length > 0 || bottomStart) && (
        <div className="absolute bottom-6 left-2 z-1000 grid max-w-[60%] gap-2">
          {stops.length > 0 && <ColourKey stops={stops} label={colourScaleLabel} formatValue={formatValue} />}
          {bottomStart}
        </div>
      )}
    </div>
  );
}

/** The key to a colour scale: its name, then each step with where it starts, so colour is never the only cue. */
function ColourKey({ stops, label, formatValue }: { stops: readonly { at: number; colour: string }[]; label?: string; formatValue: (v: number) => string }) {
  return (
    <div className="rounded-control border border-border bg-background px-2 py-1.5 type-caption text-foreground">
      {label && <p className="font-medium">{label}</p>}
      <ul className="grid gap-0.5">
        {stops.map((s) => (
          <li key={s.at} className="flex items-center gap-2 tabular-nums">
            <svg width="20" height="4" aria-hidden>
              <line x1="0" x2="20" y1="2" y2="2" stroke={s.colour} strokeWidth={4} strokeLinecap="round" />
            </svg>
            <span>{`From ${formatValue(s.at)}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
