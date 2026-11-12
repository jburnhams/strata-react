import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { FIT } from "../lib/viewport";
import { Button, IconButton } from "./button";
import { useZoom, ZoomControls } from "./compare-parts";
import { Dialog } from "./dialog";
import { Disclosure } from "./disclosure";
import { Toolbar } from "./toolbar";
import { useViewport, ViewportFrame } from "./viewport";

// A picture opened from a grid: one at a time, with the rest of the set a key away and what is
// known about it beside it. Issue #189, from strata-360's still gallery, where the viewer between
// `SelectableGrid`, `Dialog` and `Compare` was app glue.
//
// Built on `Dialog` (React Aria's modal): it gives the required title, the focus trap, Escape, the
// inert page and, importantly, focus returning to the tile that opened it. The dialog is its
// `full` size; nothing here reimplements an overlay. Zoom and pan are `ViewportFrame` with
// `useViewport` and the zoom controls `Compare` already uses, so the gestures, the keyboard and the
// 1:1 button are the library's; zoom is fitted again whenever the picture changes.
//
// Keys. Left and Right (or Previous / Next) move through the set, Home and End jump to its ends, and
// the position is said in words ("3 of 40") and kept in a polite region. Those keys step aside when
// they belong to something else: a zoomed picture pans with the arrows (the frame handles them and
// says so by cancelling the event), and the zoom toolbar or a field keeps its own. Escape is the dialog's.
//
// The next and previous pictures are requested ahead (`new Image()` on their `src`), so the step is
// not a wait. A picture that fails shows `missing` in its place, in the app's words and required,
// never a broken-image icon, and the neighbours still work.
//
// The details sit beside the picture from 720px wide and fold into a `Disclosure` under it below
// that, so a phone keeps the picture large. "Compare ticked" hands the ids the grid has selected
// to the app (`onCompare`), which opens `Compare` or `CompareGrid` as it likes: the lightbox has no
// dependency on them.

/** One picture in the set. */
export type LightboxItem = {
  id: string;
  /** The picture's address. */
  src: string;
  /** What it shows, for the picture's alternative text: "Bowl 12, front". Required. */
  label: string;
  /** Its natural size in pixels, for 1:1. */
  natural?: readonly [number, number];
};

export type LightboxProps = {
  /** The dialog's title: "Photos of firing f-0412". Required. */
  title: string;
  items: readonly LightboxItem[];
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What shows in place of a picture that did not load, in words: "This photo could not be loaded." Required. */
  missing: string;
  /** Beside the picture (a `PropertyList` or `Inspector` fits), under it when narrow. */
  details?: (item: LightboxItem) => React.ReactNode;
  /** Name of the folded details on a narrow screen. */
  detailsLabel?: string;
  /** Ids ticked in the grid; with `onCompare` this shows "Compare ticked". */
  ticked?: readonly string[];
  /** Hands the ticked ids to the app. Needs two or more. */
  onCompare?: (ids: readonly string[]) => void;
  /** Width over height of the frame before the picture loads. Default 3:2. */
  aspect?: number;
};

const NARROW = "(max-width: 719px)";

function useNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(() => typeof matchMedia === "function" && matchMedia(NARROW).matches);
  React.useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const q = matchMedia(NARROW);
    const on = () => setNarrow(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** A picture from a set in a full-size dialog: previous/next and arrow keys, "3 of 40", zoom and pan, details beside it, neighbours preloaded, a `missing` sentence for one that fails, and a Compare ticked hand-off. Focus returns to the tile that opened it. */
export function Lightbox({ title, items, index, onIndexChange, open, onOpenChange, missing, details, detailsLabel = "Details", ticked, onCompare, aspect = 3 / 2 }: LightboxProps) {
  const last = items.length - 1;
  const at = Math.min(Math.max(index, 0), Math.max(last, 0));
  const item = items[at];
  const narrow = useNarrow();
  const [failed, setFailed] = React.useState<ReadonlySet<string>>(new Set());
  const [natural, setNatural] = React.useState<readonly [number, number] | null>(null);
  const frame = React.useRef<HTMLDivElement>(null);
  const { viewport, setViewport } = useViewport(FIT);
  const zoom = useZoom({ viewport, setViewport, frame, natural: natural ?? item?.natural ?? null });

  // A new picture is looked at whole again.
  React.useEffect(() => {
    setViewport(FIT);
    setNatural(null);
  }, [item?.id, setViewport]);

  // The neighbours are requested ahead of being asked for.
  React.useEffect(() => {
    if (!open || typeof Image === "undefined") return;
    for (const n of [items[at - 1], items[at + 1]]) if (n) new Image().src = n.src;
  }, [open, at, items]);

  const go = (to: number) => onIndexChange(Math.min(Math.max(to, 0), last));
  // On the window, not the content: React Aria puts focus on the dialog itself when it opens, which
  // is outside the content, and the page behind is inert so nothing else can be the target.
  const keys = React.useRef((_: KeyboardEvent) => {});
  keys.current = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement;
    if (el.closest?.('[role="toolbar"], input, textarea, select, [contenteditable="true"]')) return;
    const to = e.key === "ArrowLeft" ? at - 1 : e.key === "ArrowRight" ? at + 1 : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (to === null) return;
    e.preventDefault();
    go(to);
  };
  React.useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open]);

  const ready = ticked && onCompare && ticked.length >= 2;
  const body = item && details ? details(item) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} size="full">
      {item && (
        <div className="flex h-full min-h-0 flex-col gap-3 outline-none">
          <div className="flex flex-wrap items-center gap-2">
            <IconButton icon={ChevronLeft} label="Previous picture" onPress={() => go(at - 1)} disabled={at === 0} />
            <IconButton icon={ChevronRight} label="Next picture" onPress={() => go(at + 1)} disabled={at === last} />
            <span className="type-label tabular-nums" aria-live="polite" aria-atomic="true">
              {at + 1} of {items.length}
            </span>
            <Toolbar label="Zoom" className="ml-2 flex items-center gap-1">
            <ZoomControls viewport={viewport} zoom={zoom} natural={natural ?? item.natural ?? null} />
            </Toolbar>
            {onCompare && ticked && (
              <Button size="sm" className="ml-auto" disabled={!ready} onPress={() => onCompare(ticked)}>
                Compare ticked ({ticked.length})
              </Button>
            )}
          </div>
          <div className={cn("flex min-h-0 flex-1 gap-4", narrow ? "flex-col" : "flex-row")}>
            <div className="min-h-0 min-w-0 flex-1">
              {failed.has(item.id) ? (
                <p role="img" aria-label={item.label} className="grid h-full min-h-40 place-items-center rounded-surface border border-dashed border-border p-6 text-center type-body text-muted-foreground">
                  {missing}
                </p>
              ) : (
                <ViewportFrame ref={frame} label={item.label} aspect={aspect} viewport={viewport} setViewport={setViewport} maxHeight={narrow ? "50svh" : "calc(100svh - 12rem)"}>
                  <img
                    key={item.id}
                    src={item.src}
                    alt={item.label}
                    draggable={false}
                    className="size-full object-contain"
                    onLoad={(e) => setNatural([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
                    onError={() => setFailed((f) => new Set(f).add(item.id))}
                  />
                </ViewportFrame>
              )}
            </div>
            {body &&
              (narrow ? (
                <Disclosure summary={detailsLabel} className="shrink-0">{body}</Disclosure>
              ) : (
                <aside aria-label={detailsLabel} className="min-h-0 w-72 shrink-0 overflow-y-auto">{body}</aside>
              ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
