import * as React from "react";
import L from "leaflet";
import { useColorScheme } from "../components/theme";
import { cn } from "../lib/utils";
import { format } from "../lib/format";
import { geo, type LatLng } from "../lib/geo";
import { installMapStyles } from "./map-styles";
import { useSharedCursor } from "../components/cursor";
import { MarkerKey, MarkerLayer, alongOf, placeMarkers, type MapMarker, type MarkerKeyWords } from "./markers";

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
// The map as an instrument, not only a picture (strata-react issues #181, #182, #184):
// - `markers`: items on the route as controls with cards, fanned apart (markers.tsx).
// - `onViewChange`: the visible bounds and zoom, once when movement settles (debounced `settle` ms), and
//   not for a move the app made through its own props (`zoom`, `view`, `follow`, the first fit), which it
//   already knows about: every move the component makes itself runs inside `silently`, and Leaflet's events
//   are synchronous with animation off, so the flag cannot leak. `reportAppMoves` turns that off.
// - `view` restores a saved view; the person's own moves go out through `onViewChange`. A reset control
//   in Leaflet's own control group fits the routes again (or sets the zoom, when one is controlled).
// - `picking` + `onPick`: choose a place. Pointer: a click. Keyboard: arrows move a crosshair (Shift for
//   bigger steps), Enter chooses, Escape asks to cancel; Leaflet's own arrow handling is switched off for
//   the time, since both would move. The result is announced with the nearest route, how far along it and
//   how far off (`geo.snap`). Route lines stop taking clicks while picking, or a pick near the route would
//   select the route instead. A click when not picking does nothing new.
// - `cursor`: joins a `CursorScope` (cursor.tsx). The scope's unit here is metres along one route; a
//   pointer near the route (within 24 px of it) writes the distance of the nearest point on it, and
//   another member's distance is drawn as a ring on the route. Never drawn back at its own writer.
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

/** The view the map settled on. */
export type MapView = { bounds: [LatLng, LatLng]; zoom: number; center: LatLng };

/** The route nearest a picked place. */
export type PickNearest = {
  routeId: string;
  /** The leg of the route (its first point's index) the place is nearest. */
  index: number;
  /** How far the place is from the route, in metres. */
  distanceM: number;
  /** How far along the route the nearest point is, in metres. */
  alongM: number;
  /** The nearest point on the route. */
  position: LatLng;
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
  /** Items on the map: places, or stretches of a route. Keep the array stable between renders. */
  markers?: readonly MapMarker[];
  /** A marker was pressed (click, Enter or Space). */
  onMarkerSelect?: (id: string) => void;
  /** The words shown beside a marker on hover and focus (as `Tooltip`; not interactive). Default its label. */
  renderMarkerCard?: (marker: MapMarker) => React.ReactNode;
  /** The words of the marker key; `false` leaves the key out. */
  markerKey?: MarkerKeyWords | false;
  /** Join the nearest `CursorScope`: a pointer near a route puts its distance along it in every member, and another member's distance shows as a ring on the route. `{ routeId }` picks the route (default the first). */
  cursor?: boolean | { routeId?: string };
  /** The view settled after the person moved or zoomed it: bounds, zoom and centre. Not called for moves the app caused through props. */
  onViewChange?: (view: MapView) => void;
  /** Milliseconds the view must be still before `onViewChange`. Default 250. */
  settle?: number;
  /** Also call `onViewChange` for moves the app caused through props (the first fit, `zoom`, `view`, `follow`). */
  reportAppMoves?: boolean;
  /** A view to show: centre and zoom, as a saved view or the app's own. The person can still move away from it; set it again to go back. Wins over fitting the routes. */
  view?: { center: LatLng; zoom: number };
  /** Choose a place on the map. While set, a click or Enter picks and route lines do not take clicks. */
  picking?: boolean;
  /** A place was chosen, with the nearest route to it when there is one. */
  onPick?: (at: LatLng, info: { nearest: PickNearest | null }) => void;
  /** Escape was pressed while picking: the app turns `picking` off. */
  onPickCancel?: () => void;
  /** The banner for pick mode ("Click the map to set the point; Escape cancels"), shown top centre. */
  pickBanner?: React.ReactNode;
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

/** How many moves of the map the component itself is making right now (see `onViewChange`). */
const quiet = new WeakMap<L.Map, number>();
/** Run a move the component makes itself, so `onViewChange` does not report it. Leaflet's events are synchronous with animation off. */
function silently<T>(map: L.Map, fn: () => T): T {
  quiet.set(map, (quiet.get(map) ?? 0) + 1);
  try {
    return fn();
  } finally {
    quiet.set(map, (quiet.get(map) ?? 1) - 1);
  }
}

/** The route nearest a place, by distance from it to the route (not to a vertex). */
function nearestRoute(routes: readonly MapRoute[], at: LatLng): PickNearest | null {
  let best: PickNearest | null = null;
  for (const r of routes) {
    const s = geo.snap(r.points, at, alongOf(r.points));
    if (s && (!best || s.offset < best.distanceM)) best = { routeId: r.id, index: s.index, distanceM: s.offset, alongM: s.metres, position: s.position };
  }
  return best;
}

const RESET_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>';
const CROSS_ICON = '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke-linecap="round"><path d="M16 4v24M4 16h24" stroke="var(--background)" stroke-width="5"/><path d="M16 4v24M4 16h24" stroke="var(--foreground)" stroke-width="2"/></svg>';

/** Leaflet's control group gets a reset: fit the routes again. A link with a button role, as Leaflet's own zoom buttons are. */
function resetControl(onReset: () => void): L.Control {
  const control = new L.Control({ position: "topleft" });
  control.onAdd = () => {
    const bar = L.DomUtil.create("div", "leaflet-bar leaflet-control");
    const a = L.DomUtil.create("a", "strata-map-reset", bar);
    a.href = "#";
    a.setAttribute("role", "button");
    a.setAttribute("aria-label", "Reset view");
    a.title = "Reset view";
    a.innerHTML = RESET_ICON;
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.on(a, "click", (e) => {
      L.DomEvent.preventDefault(e);
      onReset();
    });
    L.DomEvent.on(a, "keydown", (e) => {
      if ((e as KeyboardEvent).key === " ") {
        L.DomEvent.preventDefault(e);
        onReset();
      }
    });
    return bar;
  };
  return control;
}

/** Put the routes in view (or, with a zoom set, centre the routes at it). */
function showRoutes(map: L.Map, routes: readonly MapRoute[], zoom: number | undefined) {
  const box = geo.bounds(routes.flatMap((r) => r.points));
  if (!box) return false;
  if (zoom !== undefined) map.setView([(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2], zoom, { animate: false });
  else map.fitBounds([tuple(box[0]), tuple(box[1])], { padding: [24, 24], animate: false, maxZoom: 17 });
  return true;
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
  silently(map, () => {
    if (map.getZoom() !== z) map.setView(tuple(target), z, { animate: false });
    const want = map.project(tuple(target), z).subtract(map.getSize().divideBy(2)).round();
    const have = map.getPixelBounds().min!.round();
    const move = want.subtract(have);
    if (move.x || move.y) map.panBy(move, { animate: false, noMoveStart: true });
  });
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


// A tile layer that always covers the whole container. Leaflet 1.9.4 picks the tiles to load from
// `floor(centre) ± size / 2` (`GridLayer._getTiledPixelBounds`) but places the map pane at
// `round(centre - size / 2)`, so when the two differ by a pixel the last pixel column of the map has no
// tile under it. The centre is a whole pixel plus or minus the float noise of projecting it back from the
// pane's position, so `floor` lands a pixel low about half the time, and whether a stray tile from an
// earlier view happens to cover that column (`keepBuffer` keeps them) depends on the path the view took:
// the same map at the same view could be drawn two ways. A visual shot of a centred follow differed by
// that one column in about one run in two under load.
// One pixel more on every side makes the tiles under the container depend on the view alone. The method
// is Leaflet's private one; a test fails if a Leaflet update removes it.
/** @internal Exported for its test, not part of the package's API. */
export function coveringTiles(url: string, options: L.TileLayerOptions): L.TileLayer {
  const Covering = L.TileLayer.extend({
    _getTiledPixelBounds(this: L.TileLayer, centre: L.LatLng): L.Bounds {
      const base = (L.GridLayer.prototype as unknown as { _getTiledPixelBounds(c: L.LatLng): L.Bounds })._getTiledPixelBounds.call(this, centre);
      return L.bounds(base.min!.subtract([1, 1]), base.max!.add([1, 1]));
    },
  });
  return new (Covering as unknown as new (u: string, o: L.TileLayerOptions) => L.TileLayer)(url, options);
}

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
  markers,
  onMarkerSelect,
  renderMarkerCard,
  markerKey,
  cursor: cursorProp,
  onViewChange,
  settle = 250,
  reportAppMoves = false,
  view,
  picking = false,
  onPick,
  onPickCancel,
  pickBanner,
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
  const latest = React.useRef({ onSelect, onViewChange, reportAppMoves, settle, picking, onPick, onPickCancel, routes, units, view, zoom });
  latest.current = { onSelect, onViewChange, reportAppMoves, settle, picking, onPick, onPickCancel, routes, units, view, zoom };
  const [announced, setAnnounced] = React.useState("");
  // True once the map has a view (the first fit has happened): before that Leaflet cannot say what is near.
  const [ready, setReady] = React.useState(false);
  const selectable = Boolean(onSelect);
  // One marker per position, by id, with the style last applied so a moving marker is not restyled every frame.
  const posMarkers = React.useRef(new Map<string, { marker: L.CircleMarker; style: string }>());

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
      posMarkers.current.clear();
      m.remove();
      setMap(null);
      setReady(false);
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
    const items = markers?.length ? ` ${markers.length === 1 ? "One marker" : `${markers.length} markers`}${markers.some((m) => m.selected) ? `, selected: ${markers.filter((m) => m.selected).map((m) => m.label).join(", ")}` : ""}.` : "";
    return `Map with ${routes.length === 1 ? "one route" : `${routes.length} routes`}. ${parts.join(" ")}${items}`;
  }, [summary, routes, spoken, units, stops.length, colourScaleLabel, formatValue, markers]);

  React.useEffect(() => {
    if (!map) return;
    const c = map.getContainer();
    c.setAttribute("aria-label", label);
    c.setAttribute("aria-describedby", summaryId);
  }, [map, label, summaryId]);

  // Tiles: the light set, or the dark one in the dark scheme.
  React.useEffect(() => {
    if (!map) return;
    const layer = coveringTiles(source.url, { attribution: source.attribution, subdomains: source.subdomains ?? "abc", minZoom: source.minZoom, maxZoom: source.maxZoom ?? 19, keepBuffer: 1 });
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
      const style = { weight, opacity: dim ? 0.55 : 1, lineCap: "round" as const, lineJoin: "round" as const, interactive: selectable && !picking, bubblingMouseEvents: false };
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
    for (const { marker } of posMarkers.current.values()) marker.bringToFront();
    return () => void group.remove();
  }, [map, routes, scheme, selectedId, stops, selectable, picking]);

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
      if (!geo.bounds(routes.flatMap((r) => r.points)) && !latest.current.view) return;
      fitted.current = routeKey;
      const v = latestView.current;
      setReady(true);
      // A given view wins, then a set zoom (on the followed position, or the routes' middle), then the routes.
      silently(map, () => {
        if (latest.current.view) map.setView(tuple(latest.current.view.center), latest.current.view.zoom, { animate: false });
        else if (v.zoom !== undefined && v.centred && v.target) map.setView(tuple(v.target), v.zoom, { animate: false });
        else showRoutes(map, latest.current.routes, v.zoom);
      });
    };
    fit();
    map.on("resize", fit);
    return () => void map.off("resize", fit);
    // `routes` is read when the key says the set changed; a new array of the same ids does not refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey]);

  // A zoom that changes after the first view (an animation) moves the zoom about the view's centre.
  React.useEffect(() => {
    if (map && zoom !== undefined && fitted.current !== null && map.getZoom() !== zoom) silently(map, () => map.setZoom(zoom, { animate: false }));
  }, [map, zoom]);

  // The positions: one marker each, kept by id and moved with `setLatLng`. No route is touched.
  React.useEffect(() => {
    if (!map) return;
    const el = map.getContainer();
    const live = posMarkers.current;
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
    } else if (!map.getBounds().pad(-0.2).contains(tuple(target))) silently(map, () => map.panTo(tuple(target), { animate: false }));
  }, [map, all, routes, scheme, follow, target, zoom]);

  // The reset control: fit the routes again, as the person's own move (so it is reported).
  React.useEffect(() => {
    if (!map) return;
    const control = resetControl(() => {
      const view = latest.current.view;
      if (view) map.setView(tuple(view.center), view.zoom, { animate: false });
      else showRoutes(map, latest.current.routes, latest.current.zoom);
    });
    control.addTo(map);
    return () => void control.remove();
  }, [map]);

  // The view, reported once it settles: the person's moves, not the app's own (unless asked).
  React.useEffect(() => {
    if (!map) return;
    let timer: number | undefined;
    const send = () => {
      timer = undefined;
      const b = map.getBounds();
      const c = map.getCenter();
      latest.current.onViewChange?.({ bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]], zoom: map.getZoom(), center: [c.lat, c.lng] });
    };
    const moved = () => {
      if (!latest.current.onViewChange) return;
      if (!latest.current.reportAppMoves && (quiet.get(map) ?? 0) > 0) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(send, latest.current.settle);
    };
    map.on("moveend zoomend", moved);
    // The first fit ran before this listener was there: with `reportAppMoves`, it is reported too.
    if (fitted.current !== null && latest.current.reportAppMoves) moved();
    return () => {
      map.off("moveend zoomend", moved);
      window.clearTimeout(timer);
    };
  }, [map]);

  // A view the app sets (a saved one): the map goes there when it changes, silently.
  const [viewLat, viewLng, viewZoom] = view ? [view.center[0], view.center[1], view.zoom] : [null, null, null];
  React.useEffect(() => {
    if (!map || viewLat === null || viewLng === null || viewZoom === null || fitted.current === null) return;
    const c = map.getCenter();
    if (map.getZoom() === viewZoom && Math.abs(c.lat - viewLat) < 1e-7 && Math.abs(c.lng - viewLng) < 1e-7) return;
    silently(map, () => map.setView([viewLat, viewLng], viewZoom, { animate: false }));
  }, [map, viewLat, viewLng, viewZoom]);

  // The shared cursor: metres along one route.
  const shared = useSharedCursor();
  const cursorOn = Boolean(cursorProp) && shared !== null;
  const cursorRouteId = typeof cursorProp === "object" && cursorProp.routeId ? cursorProp.routeId : routes[0]?.id;
  const cursorRoute = routes.find((r) => r.id === cursorRouteId) ?? null;
  const setPointer = shared?.setPointer;
  React.useEffect(() => {
    if (!map || !cursorOn || !cursorRoute || !setPointer) return;
    const along = alongOf(cursorRoute.points);
    const onMove = (e: L.LeafletMouseEvent) => {
      if (latest.current.picking) return;
      const snap = geo.snap(cursorRoute.points, [e.latlng.lat, e.latlng.lng], along);
      if (!snap) return;
      const apart = map.latLngToContainerPoint(e.latlng).distanceTo(map.latLngToContainerPoint(tuple(snap.position)));
      setPointer(apart <= 24 ? snap.metres : null);
    };
    const onOut = () => setPointer(null);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      setPointer(null);
    };
  }, [map, cursorOn, cursorRoute, setPointer]);
  const otherAlong = cursorOn ? (shared?.other ?? null) : null;
  const ring = React.useRef<L.CircleMarker | null>(null);
  React.useEffect(() => {
    if (!map) return;
    const at = otherAlong !== null && cursorRoute ? geo.pointAlong(cursorRoute.points, otherAlong, alongOf(cursorRoute.points)) : null;
    if (!at) {
      ring.current?.remove();
      ring.current = null;
      return;
    }
    if (!ring.current) {
      const el = map.getContainer();
      ring.current = L.circleMarker(tuple(at), { radius: 9, weight: 3, fillOpacity: 0, interactive: false, color: resolveColour(el, "var(--foreground)") }).addTo(map);
    } else ring.current.setLatLng(tuple(at));
  }, [map, otherAlong, cursorRoute]);
  React.useEffect(() => () => void (ring.current = null), [map]);

  // Item markers: those near the view, laid out again each time it settles.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!map || !markers?.length) return;
    const again = () => setTick((t) => t + 1);
    map.on("moveend zoomend resize", again);
    return () => void map.off("moveend zoomend resize", again);
  }, [map, markers?.length]);
  const placed = React.useMemo(() => (map && ready && markers?.length ? placeMarkers(map, markers, routes) : []), [map, ready, markers, routes, tick]);
  // A stretch is its route's part drawn heavier, and a fanned marker has a leader line back to its true place.
  React.useEffect(() => {
    if (!map || !markers?.length) return;
    const group = L.featureGroup().addTo(map);
    const el = map.getContainer();
    for (const m of markers) {
      if (Array.isArray(m.at)) continue;
      const at = m.at as { routeId: string; from: number; to: number };
      const index = routes.findIndex((r) => r.id === at.routeId);
      if (index < 0) continue;
      const route = routes[index];
      const part = geo.slice(route.points, at.from, at.to, alongOf(route.points));
      if (part.length < 2) continue;
      const colour = m.colour ?? (m.highlighted ? "var(--success)" : m.selected ? "var(--foreground)" : (route.colour ?? PALETTE[index % PALETTE.length]));
      L.polyline(part.map(tuple), { color: resolveColour(el, colour), weight: (route.weight ?? 4) + (m.selected ? 5 : 3), opacity: m.selected ? 1 : 0.8, lineCap: "round", interactive: false }).addTo(group);
    }
    for (const p of placed) if (p.fanned) L.polyline([tuple(p.at), tuple(p.shown)], { color: resolveColour(el, "var(--muted-foreground)"), weight: 1, dashArray: "2 3", interactive: false }).addTo(group);
    for (const { marker } of posMarkers.current.values()) marker.bringToFront();
    return () => void group.remove();
  }, [map, markers, routes, placed, scheme]);

  // Choosing a place.
  React.useEffect(() => {
    if (!map || !picking) return;
    const el = map.getContainer();
    el.classList.add("strata-map-picking");
    map.keyboard.disable();
    setAnnounced("Choose a place on the map. Arrow keys move the crosshair, Shift for bigger steps, Enter chooses, Escape cancels.");
    let cross: L.Marker | null = null;
    const showCross = (at: L.LatLng) => {
      if (!cross) cross = L.marker(at, { interactive: false, keyboard: false, icon: L.divIcon({ className: "strata-map-crosshair", html: CROSS_ICON, iconSize: [32, 32], iconAnchor: [16, 16] }) }).addTo(map);
      else cross.setLatLng(at);
    };
    const choose = (ll: L.LatLng) => {
      const at: LatLng = [ll.lat, ll.lng];
      const nearest = nearestRoute(latest.current.routes, at);
      const route = nearest ? latest.current.routes.find((r) => r.id === nearest.routeId) : undefined;
      setAnnounced(`Picked ${at[0].toFixed(5)}, ${at[1].toFixed(5)}.${nearest && route ? ` Nearest: ${route.label}, ${format.distance(nearest.alongM, latest.current.units)} along, ${format.distance(nearest.distanceM, latest.current.units)} from the route.` : ""}`);
      latest.current.onPick?.(at, { nearest });
    };
    const onClick = (e: L.LeafletMouseEvent) => {
      cross?.remove();
      cross = null;
      choose(e.latlng);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        latest.current.onPickCancel?.();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        choose(cross ? cross.getLatLng() : map.getCenter());
        return;
      }
      const step = e.shiftKey ? 50 : 10;
      const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      const from = map.latLngToContainerPoint(cross ? cross.getLatLng() : map.getCenter());
      let to = from.add(d);
      const size = map.getSize();
      // Past the edge, the map moves and the crosshair stays at the edge.
      const inside = L.point(Math.min(Math.max(to.x, 16), size.x - 16), Math.min(Math.max(to.y, 16), size.y - 16));
      if (!inside.equals(to)) {
        map.panBy(to.subtract(inside), { animate: false });
        to = inside;
      }
      showCross(map.containerPointToLatLng(to));
    };
    map.on("click", onClick);
    el.addEventListener("keydown", onKey);
    return () => {
      map.off("click", onClick);
      el.removeEventListener("keydown", onKey);
      cross?.remove();
      el.classList.remove("strata-map-picking");
      map.keyboard.enable();
    };
  }, [map, picking]);

  return (
    <div ref={root} data-dark-treatment={treated ? "" : undefined} className={cn("strata-map relative isolate aspect-video min-h-64 overflow-hidden rounded-surface border border-border", className)}>
      <div ref={host} className="size-full" />
      <p id={summaryId} className="sr-only">
        {text}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announced}
      </p>
      {map && placed.length > 0 && <MarkerLayer map={map} placed={placed} onSelect={onMarkerSelect} card={renderMarkerCard} />}
      {topEnd && <div className="absolute top-2 right-2 z-1000">{topEnd}</div>}
      {picking && pickBanner && <div className="absolute top-2 left-1/2 z-1000 max-w-[60%] -translate-x-1/2">{pickBanner}</div>}
      {(stops.length > 0 || bottomStart || (markers?.length && markerKey !== false)) && (
        <div className="absolute bottom-6 left-2 z-1000 grid max-w-[60%] gap-2">
          {stops.length > 0 && <ColourKey stops={stops} label={colourScaleLabel} formatValue={formatValue} />}
          {markers && markers.length > 0 && markerKey !== false && <MarkerKey markers={markers} words={markerKey} />}
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
