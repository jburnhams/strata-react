import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "react-router";
import { cn } from "../lib/utils";
import { FIT } from "../lib/viewport";
import { findPage, pageName, sayPosition, viewOf, viewsOf } from "../lib/book";
import { Button, IconButton } from "./button";
import { useZoom, ZoomControls } from "./compare-parts";
import { Field, Input } from "./field";
import { ThumbnailStrip, useNarrow, type LightboxItem } from "./lightbox";
import { Toolbar } from "./toolbar";
import { useViewport, ViewportFrame, type PickZone } from "./viewport";

// A scanned book read as a book (strata-react issue #238, from strata-scan and diary-study, which
// had only a grid of thumbnails and one page at a time on an editing screen). `Lightbox` is a
// photo set in a dialog; a book is different in the ways that matter to a reader, so it is its own
// component built from the same parts (`ViewportFrame`, `useViewport`, the zoom controls, the
// thumbnail strip) rather than a `spread` option bolted on: it is inline (a screen of its own, not
// a dialog), its unit is a spread, and its pages have two names.
//
// - Single page or spread. Facing pages side by side with the first page alone on the right, as a
//   printed book opens (`viewsOf`, `lib/book.ts`); below 720px, or with `layout="single"`, one page.
//   Both pages of a spread share one zoom and pan, as `Compare`'s frames do, so they are one object.
// - Two names. A page's position in the scan (`scan`, "22") and its printed label (`printed`, "12",
//   "iv"). Go to takes either and finds the printed label first, because that is what is printed on
//   the page in front of them (`findPage`). A name nothing has is said in words under the box.
// - Paging. Left and Right, Page Up and Page Down, Home and End, and a click on the outer half of a
//   page, as `ViewportFrame`'s click-to-choose (`pick`), so the zone is outlined and named under the
//   pointer ("Previous page") and a double click still zooms. While a page is zoomed the arrows pan
//   it (the frame handles them and says so), so paging steps aside, as in `Lightbox`. The position is
//   said in words ("Pages 22 (12) and 23 (13) of 44") in a polite region.
// - The URL holds the position (`useBookUrl`, `?page=22`, the scan number), replacing the entry as
//   the reader turns pages so Back leaves the book, and a pasted link opens on that page.
// - A thumbnail strip, the `Lightbox`'s, with a `badge` per page ("Look") from the same `Status` the
//   grid uses. The neighbouring views' images are requested ahead.
// - A text pane (`side`) beside the pages, under them when narrow: the app's transcript for the
//   pages shown, so a person reads the scan and the transcript together. `overlay` draws a layer
//   that zooms with a page (a `BoxOverlay` of OCR lines).
//
// No page-curl: turning a page is an action done hundreds of times, and character by frequency
// (ux-research `ux-character.md`) gives it no motion.

/** One page of the book. */
export type BookPage = {
  id: string;
  src: string;
  /** What the page shows, for assistive technology: "Page 22 of the Punch book". Required. */
  label: string;
  /** Its position in the scan, as a person counts: "22". */
  scan: string;
  /** What is printed on it: "12", "iv", or a running head. Pages with none have only their scan position. */
  printed?: string;
  /** A small picture for the strip. Default `src`. */
  thumb?: string;
  /** Its natural size in pixels, for 1:1 and the frame's shape. */
  natural?: readonly [number, number];
};

export type BookViewerProps = {
  /** Names the book: "The Play of Punch and Judy". */
  label: string;
  pages: readonly BookPage[];
  /** The page being read (any page of a spread), as an index into `pages`. */
  index: number;
  onIndexChange: (index: number) => void;
  /** What shows in place of a page that did not load, in words. Required. */
  missing: string;
  /** `"spread"` (default) shows facing pages when there is room; `"single"` always one. */
  layout?: "spread" | "single";
  /** Beside the pages (under them when narrow): the pages shown, for the transcript pane. */
  side?: (shown: readonly BookPage[]) => React.ReactNode;
  sideLabel?: string;
  /** In the corner of a page's thumbnail: a `Status` ("Look") for the pages that need a look. */
  badge?: (page: BookPage) => React.ReactNode;
  /** A layer inside a page's zoomable frame, in the page's own pixels (`natural` once known): a `BoxOverlay`. */
  overlay?: (page: BookPage, natural: readonly [number, number] | null) => React.ReactNode;
  /** The thumbnail strip under the pages. Default true. */
  strip?: boolean;
  /** Width over height of a page before it loads. Default 2:3. */
  aspect?: number;
  /** What a page is called: "Page" (default), or "Leaf", "Folio". */
  word?: string;
  className?: string;
};

/** What `useBookUrl` returns: the `index` and `onIndexChange` a `BookViewer` takes. */
export type BookUrl = Pick<BookViewerProps, "index" | "onIndexChange">;

/** Keeps the page being read in the URL (`?page=22`, the 1-based position in the scan): a link or a reload opens it, and turning pages replaces the entry so Back leaves the book. */
export function useBookUrl(count: number, { param = "page" }: { param?: string } = {}): BookUrl {
  const [params, setParams] = useSearchParams();
  const n = Number(params.get(param));
  const index = Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : 0;
  const onIndexChange = React.useCallback(
    (i: number) =>
      setParams(
        (p) => {
          const out = new URLSearchParams(p);
          out.set(param, String(Math.min(Math.max(i, 0), Math.max(count - 1, 0)) + 1));
          return out;
        },
        { replace: true },
      ),
    [count, param, setParams],
  );
  return { index, onIndexChange };
}

/** A scanned book read as a book: facing pages (the first alone on the right) or one page, printed and scan names with a go-to that takes either, arrows, Page Up/Down, Home/End and a click on a page's outer half, the position in the URL and in words, a thumbnail strip with badges, an optional text pane. */
export function BookViewer({ label, pages, index, onIndexChange, missing, layout = "spread", side, sideLabel = "Text", badge, overlay, strip = true, aspect = 2 / 3, word = "Page", className }: BookViewerProps) {
  const narrow = useNarrow();
  const spread = layout === "spread" && !narrow;
  const views = React.useMemo(() => viewsOf(pages.length, spread), [pages.length, spread]);
  const at = Math.min(Math.max(index, 0), Math.max(pages.length - 1, 0));
  const view = viewOf(at, spread);
  const shownIndexes = views[view] ?? [];
  const shown = shownIndexes.map((i) => pages[i]);
  const lastView = views.length - 1;
  const goView = (k: number) => {
    const to = views[Math.min(Math.max(k, 0), lastView)];
    if (to) onIndexChange(to[0]);
  };

  // The first page of a book stands alone on the right; a lone last page is on the left.
  const slots: (BookPage | null)[] = spread ? (view === 0 ? [null, shown[0] ?? null] : [shown[0] ?? null, shown[1] ?? null]) : [shown[0] ?? null];

  const { viewport, setViewport } = useViewport(FIT);
  const frame = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState<ReadonlySet<string>>(new Set());
  const [naturals, setNaturals] = React.useState<ReadonlyMap<string, readonly [number, number]>>(new Map());
  const naturalOf = (p: BookPage) => naturals.get(p.id) ?? p.natural ?? null;
  const zoom = useZoom({ viewport, setViewport, frame, natural: shown[0] ? naturalOf(shown[0]) : null });
  const viewKey = shown.map((p) => p.id).join("+");
  React.useEffect(() => setViewport(FIT), [viewKey, setViewport]);

  // Neighbouring views are requested ahead of being turned to.
  React.useEffect(() => {
    if (typeof Image === "undefined") return;
    for (const k of [view - 1, view + 1]) for (const i of views[k] ?? []) new Image().src = pages[i].src;
  }, [view, views, pages]);

  const root = React.useRef<HTMLDivElement>(null);
  const keys = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest?.('[role="toolbar"], [role="listbox"], input, textarea, select, [contenteditable="true"]')) return;
    const to = e.key === "ArrowRight" || e.key === "PageDown" ? view + 1 : e.key === "ArrowLeft" || e.key === "PageUp" ? view - 1 : e.key === "Home" ? 0 : e.key === "End" ? lastView : null;
    if (to === null) return;
    e.preventDefault();
    goView(to);
    // The page that had focus may be replaced by the turn; the keys must keep working, so focus falls back to the book.
    requestAnimationFrame(() => {
      if (root.current && !root.current.contains(document.activeElement)) root.current.focus({ preventScroll: true });
    });
  };

  // Go to: a printed label first, then the scan's position.
  const [query, setQuery] = React.useState("");
  const [problem, setProblem] = React.useState<string>();
  const goTo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    const found = findPage(pages, query);
    if (found === null) {
      setProblem(`No ${word.toLowerCase()} is called “${query.trim()}”. Try its number in the scan, or what is printed on it, such as iv or 12.`);
      return;
    }
    setProblem(undefined);
    setQuery("");
    onIndexChange(found);
  };

  const items = React.useMemo<LightboxItem[]>(() => pages.map((p) => ({ id: p.id, src: p.src, thumb: p.thumb, label: p.label, position: pageName(p, word), natural: p.natural })), [pages, word]);
  const position = sayPosition(shown, pages.length, word, `${word}s`);
  const prevWord = spread ? `Previous ${word.toLowerCase()}s` : `Previous ${word.toLowerCase()}`;
  const nextWord = spread ? `Next ${word.toLowerCase()}s` : `Next ${word.toLowerCase()}`;
  const body = side?.(shown);

  const zones = (slot: number): { zoneAt: (x: number) => PickZone | null; describe: string } => {
    // The outer half of a page turns: the left half of the left page (or of the only page) goes back, the right half of the right page (or of the only page) goes on.
    const back = slots.length === 1 || slot === 0;
    const forward = slots.length === 1 || slot === 1;
    return {
      describe: `Click the outer half of the page to turn it. Previous is on the left, next on the right.`,
      zoneAt: (x) =>
        back && x < 0.5 && view > 0 ? { value: "prev", from: 0, to: 0.5, hint: prevWord } : forward && x >= 0.5 && view < lastView ? { value: "next", from: 0.5, to: 1, hint: nextWord } : null,
    };
  };

  return (
    <div ref={root} role="region" aria-label={label} aria-roledescription="book" tabIndex={-1} onKeyDown={keys} className={cn("grid min-w-0 gap-3 outline-none", className)}>
      <div className="flex flex-wrap items-end gap-2">
        <IconButton icon={ChevronLeft} label={prevWord} onPress={() => goView(view - 1)} disabled={view === 0} />
        <IconButton icon={ChevronRight} label={nextWord} onPress={() => goView(view + 1)} disabled={view === lastView} />
        <span className="type-label tabular-nums" aria-hidden>{position}</span>
        <Toolbar label="Zoom" className="ml-2 flex items-center gap-1">
          <ZoomControls viewport={viewport} zoom={zoom} natural={shown[0] ? naturalOf(shown[0]) : null} />
        </Toolbar>
        <form onSubmit={goTo} className="ml-auto">
          <Field label={`Go to ${word.toLowerCase()}`} error={problem} action={<Button type="submit" size="sm" variant="outline">Go</Button>}>
            <Input size="sm" value={query} onChange={(e) => { setQuery(e.target.value); setProblem(undefined); }} className="w-32" autoComplete="off" />
          </Field>
        </form>
      </div>
      <div className={cn("grid min-w-0 gap-4", body && !narrow && "grid-cols-[minmax(0,1fr)_20rem]")}>
        <div className={cn("grid min-w-0 gap-0", slots.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
          {slots.map((page, slot) =>
            page === null ? (
              <div key={slot} aria-hidden />
            ) : failed.has(page.id) ? (
              <p key={page.id} role="img" aria-label={page.label} className="grid min-h-40 place-items-center rounded-surface border border-dashed border-border p-6 text-center type-body text-muted-foreground">{missing}</p>
            ) : (
              <ViewportFrame
                key={`slot-${slot}`}
                ref={slot === slots.findIndex((s) => s !== null) ? frame : undefined}
                label={page.label}
                aspect={aspect}
                viewport={viewport}
                setViewport={setViewport}
                maxHeight="calc(100svh - 14rem)"
                pick={{ ...zones(slot), onPick: (zone) => goView(view + (zone.value === "prev" ? -1 : 1)), token: String(view) }}
              >
                <img
                  src={page.src}
                  alt={page.label}
                  draggable={false}
                  className="size-full object-contain"
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setNaturals((m) => new Map(m).set(page.id, [img.naturalWidth, img.naturalHeight]));
                  }}
                  onError={() => setFailed((f) => new Set(f).add(page.id))}
                />
                {overlay?.(page, naturalOf(page))}
              </ViewportFrame>
            ),
          )}
        </div>
        {body && (
          <aside aria-label={sideLabel} className="min-h-0 min-w-0 overflow-y-auto">
            {body}
          </aside>
        )}
      </div>
      {strip && pages.length > 1 && <ThumbnailStrip items={items} at={at} onPick={onIndexChange} badge={badge ? (it) => badge(pages.find((p) => p.id === it.id)!) : undefined} label={`${word}s in this book`} />}
      <div role="status" aria-live="polite" className="sr-only">{position}</div>
    </div>
  );
}
