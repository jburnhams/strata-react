import * as React from "react";
import { cn } from "../lib/utils";
import { Caption, FullscreenButton, Picture, ZoomControls, useZoom, zoomShortcuts } from "./compare-parts";
import type { Candidate } from "./compare";
import { FullscreenFrame } from "./fullscreen-frame";
import { KeysLegend, useHotkeys } from "./hotkeys";
import { Toolbar, ToolbarSeparator } from "./toolbar";
import { ViewportFrame, useViewport } from "./viewport";

// Every candidate's picture for one item at once, with one zoom for all of them (the models app's
// "Outputs" tab, which lists each candidate's output, and Bright Horizons' pick-which-to-keep).
// Looking at the same detail in every tile is the point, so the viewport is shared exactly as it is
// in `Compare`; the rest of `Compare` (blind, `missing`, the keys from one list, full screen) is
// the same too, and shares its parts. What each tile offers beyond looking (open it in a
// comparison, choose it, flag it) is the caller's: `actions` draws it under the caption, so the grid
// does not decide that a tile is a button.

/** Props for `CompareGrid`. */
export type CompareGridProps = {
  /** Names the grid for screen readers: "Four versions of this photo". Required. */
  label: string;
  items: readonly Candidate[];
  /** Whether the person must not learn which variant is which: tiles are named by label only. Required, no default. */
  blind: boolean;
  /** The words shown where a picture could not be loaded. Required. */
  missing: string;
  /** What goes under a tile's caption: a button to compare it, a choice, a flag. */
  actions?: (item: Candidate) => React.ReactNode;
  /** Tiles per row at full width. Default 3. A narrow screen uses fewer. */
  columns?: 2 | 3 | 4;
  /** Bind the zoom and full-screen keys on the window. Default true. */
  keys?: boolean;
  className?: string;
};

const COLUMNS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

/** Many pictures in a grid, zoomed and panned together, and full screen. */
export function CompareGrid({ label, items, blind, missing, actions, columns = 3, keys = true, className }: CompareGridProps) {
  const { viewport, setViewport } = useViewport();
  const [full, setFull] = React.useState(false);
  const key = items.map((i) => i.media.src).join("|");
  const [learned, setLearned] = React.useState<{ key: string; size: readonly [number, number] } | null>(null);
  const natural = items[0]?.media.size ?? (learned?.key === key ? learned.size : null);
  const aspect = natural ? natural[0] / natural[1] : 3 / 2;
  const first = React.useRef<HTMLDivElement>(null);
  const zoom = useZoom({ viewport, setViewport, frame: first, natural });
  const shortcuts = zoomShortcuts(zoom, full, setFull);
  useHotkeys(shortcuts, { enabled: keys });

  return (
    <FullscreenFrame label={label} active={full} onActiveChange={setFull} className={className}>
      <section aria-label={label} className={cn("grid gap-3", full && "min-h-0 flex-1 content-start overflow-auto")}>
        <Toolbar label="Zoom" className="items-center gap-2">
          <ZoomControls viewport={viewport} zoom={zoom} natural={natural} />
          <ToolbarSeparator />
          <FullscreenButton full={full} setFull={setFull} />
        </Toolbar>
        <div className={cn("grid gap-3", COLUMNS[columns])}>
          {items.map((c, i) => (
            <figure key={c.id} className="grid content-start gap-1.5">
              <Caption c={c} blind={blind} />
              <ViewportFrame viewport={viewport} setViewport={setViewport} aspect={aspect} label={blind ? `Picture ${c.label}` : c.label} ref={i === 0 ? first : undefined}>
                <Picture c={c} blind={blind} missing={missing} onNatural={i === 0 ? (w, h) => setLearned({ key, size: [w, h] }) : undefined} />
              </ViewportFrame>
              {actions && <div className="flex flex-wrap gap-2">{actions(c)}</div>}
            </figure>
          ))}
        </div>
        {keys && <KeysLegend shortcuts={shortcuts} />}
      </section>
    </FullscreenFrame>
  );
}
