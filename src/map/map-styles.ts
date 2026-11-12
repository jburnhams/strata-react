import leafletCss from "leaflet/dist/leaflet.css?inline";

// Leaflet draws with its own stylesheet (panes, tiles, controls positioned by class), which an app
// would otherwise have to import beside strata-react's. That is an install step a component must
// not need (CLAUDE.md, "Imports decide the peers"), so the map puts it in the page itself, once,
// followed by the few rules that make Leaflet's own parts (zoom buttons, attribution, tooltips)
// read as the app: its roles, its control height, its radius. The dark treatment is here too, in
// one place: a map without dark tiles is turned to the dark scheme with a filter, which is a
// fallback, not a design (an app with a dark tile set passes it as `tiles.dark`).
const strata = `
.strata-map .leaflet-container { background: var(--surface-sunken); color: var(--foreground); font: inherit; }
.strata-map .leaflet-container:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
.strata-map .leaflet-bar { border: 1px solid var(--border); border-radius: var(--radius-control, 4px); box-shadow: none; overflow: hidden; }
.strata-map .leaflet-bar a { background: var(--background); color: var(--foreground); border-bottom: 1px solid var(--border); width: var(--control-h, 2.5rem); height: var(--control-h, 2.5rem); line-height: var(--control-h, 2.5rem); }
.strata-map .leaflet-control-zoom-in, .strata-map .leaflet-control-zoom-out { font: inherit; font-size: 1.25rem; font-weight: 600; }
.strata-map .leaflet-bar a:last-child { border-bottom: 0; }
.strata-map .leaflet-bar a:hover, .strata-map .leaflet-bar a:focus-visible { background: var(--muted); }
.strata-map .leaflet-bar a.leaflet-disabled { color: var(--muted-foreground); background: var(--background); cursor: not-allowed; }
.strata-map .leaflet-control-attribution { background: color-mix(in oklab, var(--background) 85%, transparent); color: var(--muted-foreground); font-size: 0.75rem; }
.strata-map .leaflet-control-attribution a { color: inherit; text-decoration: underline; }
.strata-map .leaflet-tooltip { background: var(--background); color: var(--foreground); border: 1px solid var(--border); border-radius: var(--radius-control, 4px); box-shadow: none; font: inherit; font-size: 0.8125rem; padding: 0.125rem 0.375rem; }
.strata-map .leaflet-tooltip::before { display: none; }
.strata-map[data-dark-treatment] .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
.strata-map .strata-map-arrow { background: none; border: 0; }
.strata-map .strata-map-marker, .strata-map .strata-map-crosshair { background: none; border: 0; display: grid; place-items: center; }
.strata-map .strata-map-reset { display: grid; place-items: center; }
.strata-map .strata-map-picking, .strata-map .strata-map-picking .leaflet-interactive { cursor: crosshair; }
`;

let installed = false;

/** Puts Leaflet's stylesheet and the token overrides in the document head, once. */
export function installMapStyles() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const el = document.createElement("style");
  el.setAttribute("data-strata-map", "");
  el.textContent = leafletCss + strata;
  document.head.appendChild(el);
}
