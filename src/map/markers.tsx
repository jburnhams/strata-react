import * as React from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { Button as AriaButton } from "react-aria-components";
import { cn } from "../lib/utils";
import { geo, type LatLng } from "../lib/geo";
import { Tooltip } from "../components/tooltip";
import { fanOut } from "./fan";

// Item markers on a map (strata-react issue #181, from strata-360's race map: a marker for every clip at
// the middle of its stretch of track, the stretch drawn heavier, overlapping markers fanned apart, a card
// on hover, a click that opens the clip). What is decided here and why:
//
// - **Each marker is a real control.** A React Aria `Button` portalled into the DOM node of a Leaflet
//   marker (a `divIcon` whose `html` is that node), so Leaflet keeps it where the map puts it while React
//   owns what it is: named by its label, pressed with a click, Enter or Space, a `Tooltip` on hover and
//   focus. Not Leaflet's popup, which is not a Strata surface and not reachable the same way.
// - **One tab stop for all of them**, arrows (and Home and End) between them, in the order the app gave:
//   forty markers must not be forty tab stops. The map's own keyboard stays: the markers are a roving
//   group inside it, and the app's list of items beside the map is still the full keyboard path.
// - **Only what is near the screen is drawn.** Each time the view settles the markers within the view
//   (plus a margin, so a fan is not cut at the edge) are laid out and the rest are not in the DOM, so 500
//   markers cost what the visible ones cost.
// - **The fan is a pure function of the zoom** (`fanOut`, fan.ts): in world pixels, so panning never moves
//   it and zooming in settles it; a leader line joins each fanned marker to its true place.
// - **States are shapes as well as colour**: a plain circle, a ringed larger one for selected, a diamond for
//   highlighted by the app (the newest draft's choice). The key names each one that is on the map.
//
// Checked: React Aria has no map part; `Button` and the Strata `Tooltip` are used as they are.

/** The words the key uses for each marker state. */
export type MarkerKeyWords = { marker?: string; selected?: string; highlighted?: string };

/** An item on the map: a place, or a stretch of a route (drawn heavier, the marker at its middle). */
export type MapMarker = {
  /** Stable between renders. */
  id: string;
  /** A place, or a stretch of a route between two distances along it (metres). */
  at: LatLng | { routeId: string; from: number; to: number };
  /** Its name: the button's accessible name and the card's default words. */
  label: string;
  selected?: boolean;
  /** Marked by the app (a diamond): the newest draft's choice, a flagged item. */
  highlighted?: boolean;
  /** Any CSS colour, normally a role; overrides the state's. */
  colour?: string;
};

/** A marker with where it really is and where it is drawn. */
export type Placed = { marker: MapMarker; at: LatLng; shown: LatLng; fanned: boolean };

const alongCache = new WeakMap<readonly LatLng[], number[]>();
/** The running distance at each point of a route, kept per route array so a long route is walked once. */
export function alongOf(points: readonly LatLng[]): number[] {
  let a = alongCache.get(points);
  if (!a) {
    a = geo.cumulative(points);
    alongCache.set(points, a);
  }
  return a;
}

/** Where a marker really is: its place, or the middle of its stretch. Null when its route is not on the map. */
export function markerPlace(m: MapMarker, routes: readonly { id: string; points: readonly LatLng[] }[]): LatLng | null {
  if (Array.isArray(m.at)) return m.at as LatLng;
  const at = m.at as { routeId: string; from: number; to: number };
  const route = routes.find((r) => r.id === at.routeId);
  return route ? geo.pointAlong(route.points, (at.from + at.to) / 2, alongOf(route.points)) : null;
}

/** The markers near the view, with the overlapping ones fanned apart for this zoom. */
export function placeMarkers(map: L.Map, markers: readonly MapMarker[], routes: readonly { id: string; points: readonly LatLng[] }[]): Placed[] {
  const near = map.getBounds().pad(0.25);
  const zoom = map.getZoom();
  const here: { marker: MapMarker; at: LatLng }[] = [];
  for (const marker of markers) {
    const at = markerPlace(marker, routes);
    if (at && near.contains([at[0], at[1]])) here.push({ marker, at });
  }
  const fanned = fanOut(here.map((h) => ({ id: h.marker.id, ...map.project([h.at[0], h.at[1]], zoom) })));
  return here.map((h, i) => {
    const f = fanned[i];
    const shown = f.fanned ? map.unproject([f.x, f.y], zoom) : null;
    return { marker: h.marker, at: h.at, shown: shown ? ([shown.lat, shown.lng] as LatLng) : h.at, fanned: f.fanned };
  });
}

const state = (m: MapMarker) => (m.highlighted ? "highlighted" : m.selected ? "selected" : "marker");

type PinProps = {
  map: L.Map;
  placed: Placed;
  active: boolean;
  onActivate: (id: string) => void;
  onMove: (id: string, to: "next" | "previous" | "first" | "last") => void;
  register: (id: string, el: HTMLElement | null) => void;
  onSelect?: (id: string) => void;
  card?: (m: MapMarker) => React.ReactNode;
};

/** One marker: a Leaflet marker holding a node that React fills with a labelled button. */
function Pin({ map, placed, active, onActivate, onMove, register, onSelect, card }: PinProps) {
  const { marker, shown } = placed;
  const host = React.useMemo(() => {
    const el = document.createElement("div");
    el.className = "strata-map-pin";
    return el;
  }, []);
  const layer = React.useRef<L.Marker | null>(null);
  React.useEffect(() => {
    const m = L.marker([shown[0], shown[1]], { icon: L.divIcon({ className: "strata-map-marker", html: host, iconSize: [28, 28], iconAnchor: [14, 14] }), interactive: false, keyboard: false }).addTo(map);
    layer.current = m;
    return () => {
      layer.current = null;
      m.remove();
    };
    // Made once per pin; where it is and how high it sits are updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, host]);
  React.useEffect(() => {
    layer.current?.setLatLng([shown[0], shown[1]]);
  }, [shown]);
  React.useEffect(() => {
    layer.current?.setZIndexOffset(marker.selected ? 1000 : marker.highlighted ? 500 : 0);
  }, [marker.selected, marker.highlighted]);
  const kind = state(marker);
  const swatch = marker.colour ?? (kind === "highlighted" ? "var(--success)" : kind === "selected" ? "var(--foreground)" : "var(--primary)");
  return createPortal(
    <Tooltip label={card ? card(marker) : marker.label} side="top">
      <AriaButton
        ref={(el) => register(marker.id, el)}
        aria-label={marker.label}
        aria-pressed={marker.selected ?? false}
        excludeFromTabOrder={!active}
        onFocus={() => onActivate(marker.id)}
        onPress={() => onSelect?.(marker.id)}
        onKeyDown={(e) => {
          const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? "next" : e.key === "ArrowLeft" || e.key === "ArrowUp" ? "previous" : e.key === "Home" ? "first" : e.key === "End" ? "last" : null;
          if (!to) return;
          e.preventDefault();
          e.stopPropagation();
          onMove(marker.id, to);
        }}
        className="pointer-events-auto grid size-7 cursor-pointer place-items-center rounded-pill outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Shape kind={kind} colour={swatch} />
      </AriaButton>
    </Tooltip>,
    host,
  );
}

/** The drawn shape of a marker state: a circle, a ringed larger circle, a diamond. Shapes carry the meaning as colour does. */
function Shape({ kind, colour }: { kind: "marker" | "selected" | "highlighted"; colour: string }) {
  return (
    <span
      aria-hidden
      className={cn("block border-2 border-background", kind === "highlighted" ? "size-3.5 rotate-45 rounded-sm" : "rounded-pill", kind === "selected" ? "size-4 ring-2 ring-foreground" : kind === "marker" ? "size-3.5" : "")}
      style={{ background: colour }}
    />
  );
}

type LayerProps = {
  map: L.Map;
  placed: readonly Placed[];
  onSelect?: (id: string) => void;
  card?: (m: MapMarker) => React.ReactNode;
};

/** The pins for the markers near the view, as one roving group: one tab stop, arrows between them. */
export function MarkerLayer({ map, placed, onSelect, card }: LayerProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const els = React.useRef(new Map<string, HTMLElement>());
  const ids = placed.map((p) => p.marker.id);
  const active = activeId !== null && ids.includes(activeId) ? activeId : (ids[0] ?? null);
  const register = React.useCallback((id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  }, []);
  const move = (id: string, to: "next" | "previous" | "first" | "last") => {
    const i = ids.indexOf(id);
    const next = to === "first" ? 0 : to === "last" ? ids.length - 1 : Math.min(ids.length - 1, Math.max(0, i + (to === "next" ? 1 : -1)));
    setActiveId(ids[next]);
    els.current.get(ids[next])?.focus();
  };
  return (
    <>
      {placed.map((p) => (
        <Pin key={p.marker.id} map={map} placed={p} active={p.marker.id === active} onActivate={setActiveId} onMove={move} register={register} onSelect={onSelect} card={card} />
      ))}
    </>
  );
}

/** The key to the marker states that are on the map, each with its shape and its words. */
export function MarkerKey({ markers, words }: { markers: readonly MapMarker[]; words?: MarkerKeyWords }) {
  const kinds = (["marker", "selected", "highlighted"] as const).filter((k) => markers.some((m) => state(m) === k));
  const text = { marker: words?.marker ?? "Item", selected: words?.selected ?? "Selected", highlighted: words?.highlighted ?? "Highlighted" };
  if (!kinds.length) return null;
  return (
    <div className="rounded-control border border-border bg-background px-2 py-1.5 type-caption text-foreground">
      <ul className="grid gap-0.5">
        {kinds.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="grid size-4 place-items-center">
              <Shape kind={k} colour={k === "highlighted" ? "var(--success)" : k === "selected" ? "var(--foreground)" : "var(--primary)"} />
            </span>
            {text[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}
