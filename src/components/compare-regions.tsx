import * as React from "react";
import { boxViewport, frameBoxToShares, regionShares, type Region, type ShareBox, type Viewport } from "../lib/viewport";
import type { Shortcut } from "./hotkeys";
import { ToggleGroup } from "./toggle";

// The region view of `Compare`, `CompareVideo` and `CompareGrid`: the same small part of every
// candidate, enlarged to fill the frame, because at full size the difference between two outputs of
// one source (a face, the stripes on a sofa, handwriting) is hard to see.
//
// A region is a box in the source's coordinates (`of` is the reference size; without it the box is
// already shares of the frame). It is turned into SHARES of the frame, and every candidate is drawn
// in the same box (`object-contain`, the first candidate's shape), so the same share is the same
// part of each whatever its pixel size: "mapped to its own pixel size" is the box scaled by the
// frame, not a sum per candidate. A candidate of another shape letterboxes inside the box, and its
// region is then of the frame, not of its picture; say so in the region's label if it matters.
//
// A region is not a new kind of view. It is a viewport (zoom and pan) that fills the frame with the
// box, so swipe, fade, blink, the shared clock and the locked zoom of every candidate work inside
// it with no change, and `0` (Fit) is "the whole frame" with no extra code. What it adds: a chip
// strip, keys `q w e r y u` for the first six (`t` is a pair vote's tie), nearest-neighbour drawing
// while a region is shown, an outline of the box on the whole frame while its chip is pointed at,
// and Shift-drag to make one more ("Region 3") that lasts until the item changes.
//
// The active region is state of its own, cleared by any zoom or pan that is not ours, so a chip is
// never shown pressed for a view that has moved off it. Blind: region labels describe the content
// ("Face"), never a candidate.
//
// Checked: React Aria has no zoom, crop or region part; the chip strip is its toggle button group
// (`ToggleGroup`) and the drag is pointer events on the frame, as in `ViewportFrame`.

const REGION_KEYS = ["q", "w", "e", "r", "y", "u"] as const;

/** What a view needs to show regions. */
export type RegionState = {
  /** The given regions, then the ones drawn by hand. */
  regions: readonly Region[];
  /** The chosen region's id, `null` for the whole frame or any other zoom. */
  active: string | null;
  /** Choose a region (fill the frame with it) or `null` for the whole frame. */
  choose: (id: string | null) => void;
  /** Wrap the view's own `setViewport`, so a zoom or pan by hand clears the chosen region. */
  setViewport: (next: Viewport) => void;
  /** A box drawn by hand, as a new region. */
  add: (rect: { x0: number; y0: number; x1: number; y1: number }) => void;
  /** The box to outline on the whole frame (the chip being pointed at). */
  peek: ShareBox | null;
  setPeek: (id: string | null) => void;
  shortcuts: Shortcut[];
};

/** Regions for one item: `reset` is a key that changes with the item, which drops the regions drawn by hand. */
export function useRegions({ regions = [], viewport, setViewport, frame, reset }: { regions?: readonly Region[]; viewport: Viewport; setViewport: (v: Viewport) => void; frame: React.RefObject<HTMLElement | null>; reset: string }): RegionState {
  const [drawn, setDrawn] = React.useState<{ key: string; list: Region[] }>({ key: reset, list: [] });
  const hand = drawn.key === reset ? drawn.list : [];
  const all = React.useMemo(() => [...regions, ...hand], [regions, hand]);
  const [active, setActive] = React.useState<string | null>(null);
  const [peekId, setPeek] = React.useState<string | null>(null);
  const size = () => {
    const r = frame.current?.getBoundingClientRect();
    return { width: r?.width ?? 0, height: r?.height ?? 0 };
  };
  const choose = (id: string | null) => {
    const region = all.find((r) => r.id === id);
    if (!region) {
      setActive(null);
      setViewport({ scale: 1, x: 0, y: 0 });
      return;
    }
    applied.current = size();
    setViewport(boxViewport(regionShares(region), applied.current));
    setActive(region.id);
    setPeek(null);
  };
  // The item changed: no region is chosen any more (its hand-drawn ones went with it).
  React.useEffect(() => setActive(null), [reset]);
  const add = (rect: { x0: number; y0: number; x1: number; y1: number }) => {
    const box = frameBoxToShares(rect, viewport, size());
    if (box[2] <= 0 || box[3] <= 0) return;
    const region: Region = { id: `region-${all.length + 1}`, label: `Region ${all.length + 1}`, box };
    setDrawn({ key: reset, list: [...hand, region] });
    applied.current = size();
    setViewport(boxViewport(box, applied.current));
    setActive(region.id);
  };
  // The viewport is pixels, so it is only right for the frame it was worked out for. A change of view (side by side to swipe, full screen, a window resize, a picture's size learned) changes the frame, and the chosen region is worked out again for it. `applied` is the size it was last right for.
  const applied = React.useRef({ width: 0, height: 0 });
  const [, bump] = React.useState(0);
  React.useLayoutEffect(() => {
    const now = size();
    if (now.width === applied.current.width && now.height === applied.current.height) return;
    applied.current = now;
    const region = all.find((r) => r.id === active);
    if (region && now.width > 0) setViewport(boxViewport(regionShares(region), now));
  });
  React.useLayoutEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width !== applied.current.width || r.height !== applied.current.height) bump((n) => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  const peekRegion = all.find((r) => r.id === peekId);
  return {
    regions: all,
    active,
    choose,
    setViewport: (next) => {
      setActive(null);
      setViewport(next);
    },
    add,
    peek: peekRegion ? regionShares(peekRegion) : null,
    setPeek,
    shortcuts: all.slice(0, REGION_KEYS.length).map((r, i): Shortcut => ({ keys: [REGION_KEYS[i]], label: `Region: ${r.label}`, run: () => choose(r.id) })),
  };
}

/** The chip strip: the whole frame and each region, one chosen. Renders nothing when there are no regions. */
export function RegionChips({ state }: { state: RegionState }) {
  if (state.regions.length === 0) return null;
  const byLabel = (target: EventTarget) => {
    const text = (target as HTMLElement).closest?.('[role="radio"]')?.textContent;
    return state.regions.find((r) => r.label === text)?.id ?? null;
  };
  return (
    <div onPointerOver={(e) => state.setPeek(byLabel(e.target))} onFocus={(e) => state.setPeek(byLabel(e.target))} onPointerLeave={() => state.setPeek(null)} onBlur={() => state.setPeek(null)}>
      <ToggleGroup
        label="Region"
        options={[{ value: "", label: "Whole frame" }, ...state.regions.map((r) => ({ value: r.id, label: r.label }))]}
        value={state.active ?? ""}
        onChange={(v) => state.choose(v === "" ? null : v)}
        size="sm"
      />
    </div>
  );
}
