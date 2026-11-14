import * as React from "react";
import { useSearchParams } from "react-router";
import { ArrowDown, ArrowUp, LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { Button, IconButton } from "./button";
import { Input, NativeSelect } from "./field";
import { Popover } from "./popover";
import { Slider } from "./value-controls";
import { Toolbar, ToolbarSeparator } from "./toolbar";
import { ToggleGroup } from "./toggle";
import { useNarrow } from "./lightbox";
import type { TileAspect } from "./tile-grid";
import { format } from "../lib/format";
import { cn } from "../lib/utils";

// How a long set of things is looked at: a photo grid's sort, grouping, tile size, aspect, layout and
// a text filter (issue #247, from strata-stills' Browser, whose first build hand-wrote all six). The
// hook holds the state and applies it to the rows; the component is the one toolbar that draws it.
//
// The toolbar is React Aria's `Toolbar` (our `Toolbar`): one tab stop, arrows between the controls.
// The pieces are ours already: `NativeSelect` for sort and group (a short list of words is best a
// native select, as the stack table says), an `IconButton` for direction whose name is the key's own
// words ("Newest first", "Oldest first"; a bare "Ascending" says nothing about dates), React Aria's
// `Slider` for size with `-` and `+` on it as well as the arrows, a `ToggleGroup` for aspect and for
// grid or list, and an `Input` for the filter with the count beside it ("82 of 140", read out as the
// filter changes). Nothing here needs more than the parts Strata has: checked, the Slider's keys
// are arrows, Home and End, so `-`/`+` are a small handler on its wrapper.
//
// On a phone (`useNarrow`, the same query the lightbox uses) every control but the filter moves
// into a "View" `Popover`, so the strip is one row and the controls are still the same controls.
//
// State is kept where the person left it: in `localStorage` under `strata-view:{id}` (every access
// inside try/catch, since storage can be blocked or full, and the screen works without it) and,
// with `url`, in the address (`?sort=taken-desc&group=hour&size=180`) so a link opens the same view.
// The URL wins over storage when both exist. The filter text is not stored: a filter that is still
// on tomorrow reads as a list that lost rows.
//
// Sorting is natural for strings (`Intl.Collator` numeric: "IMG_2" before "IMG_10"), `null` values
// sort last in both directions, and the sort is stable, so ties keep the order they came in.

/** A way to order rows. */
export type ViewSort<T> = {
  key: string;
  /** What the menu calls it: "Date taken". */
  label: string;
  /** The value to order by. `null` or `undefined` sorts last either way. */
  value: (row: T) => string | number | Date | null | undefined;
  /** Words for the direction buttons, from the key's own sense: `["Oldest first", "Newest first"]`. Default "Ascending", "Descending". */
  directions?: readonly [ascending: string, descending: string];
  /** The direction a person gets on first choosing this key. Default ascending. */
  defaultDescending?: boolean;
};

/** A way to put rows into groups. */
export type ViewGroup<T> = {
  key: string;
  /** What the menu calls it: "Hour". */
  label: string;
  /** The group a row belongs to; the groups come out in the order the sorted rows first show them. */
  of: (row: T) => string;
  /** The heading drawn for a group; default the group's own text. */
  heading?: (group: string) => string;
};

/** What `useViewOptions` takes. */
export type ViewOptionsConfig<T> = {
  /** Names this view in `localStorage` (`strata-view:{id}`): "browser-grid". Required, so two screens do not share a size. */
  id: string;
  sorts?: readonly ViewSort<T>[];
  /** Key of the sort a first visit starts with, and whether it starts descending. Default the first. */
  defaultSort?: { key: string; descending?: boolean };
  groups?: readonly ViewGroup<T>[];
  /** Key of the group a first visit starts with; default none. */
  defaultGroup?: string | null;
  /** The tile width range in px; give it to get the size slider. */
  size?: { min: number; max: number; step?: number; default: number };
  aspects?: readonly TileAspect[];
  defaultAspect?: TileAspect;
  /** Offer grid or list. */
  layouts?: boolean;
  /** The text the filter matches in a row (everything a person would search for); give it to get the filter box. */
  filterText?: (row: T) => string;
  /** Keep sort, group and size in the address too (`?sort=taken-desc&group=hour&size=180`). Needs a router. Fixed for the life of the component. */
  url?: boolean | { sort?: string; group?: string; size?: string };
};

type Stored = { sort: string | null; descending: boolean; group: string | null; size: number | null; aspect: TileAspect | null; layout: "grid" | "list" };

/** One group of rows. */
export type ViewGroupRows<T> = { key: string; heading: string; rows: T[] };

/** The state `useViewOptions` returns, with the rows it applies to. */
export type ViewOptionsState<T> = {
  config: ViewOptionsConfig<T>;
  sort: string | null;
  descending: boolean;
  group: string | null;
  size: number;
  aspect: TileAspect;
  layout: "grid" | "list";
  query: string;
  setSort: (key: string) => void;
  setDescending: (descending: boolean) => void;
  setGroup: (key: string | null) => void;
  setSize: (size: number) => void;
  setAspect: (aspect: TileAspect) => void;
  setLayout: (layout: "grid" | "list") => void;
  setQuery: (query: string) => void;
  /** Filter by the text, then sort: the rows to draw. */
  apply: (rows: readonly T[]) => T[];
  /** The same rows in groups when a group key is chosen; one group, no heading, when none. */
  grouped: (rows: readonly T[]) => ViewGroupRows<T>[];
  /** The line beside the filter: "82 of 140" while filtering, "140" otherwise (pass the full and filtered counts). */
  countText: (shown: number, total: number) => string;
  /** Back to the defaults (not the filter). */
  reset: () => void;
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: string | number | Date, b: string | number | Date): number {
  if (typeof a === "string" && typeof b === "string") return collator.compare(a, b);
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  return typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(a), String(b));
}

/** Rows ordered by a key: natural string order, `null` last whichever way, ties kept in their order. Exported for a screen that orders without the toolbar. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => string | number | Date | null | undefined, descending = false): T[] {
  const keyed = rows.map((row, i) => ({ row, i, v: value(row) }));
  keyed.sort((p, q) => {
    const pn = p.v === null || p.v === undefined;
    const qn = q.v === null || q.v === undefined;
    if (pn || qn) return pn === qn ? p.i - q.i : pn ? 1 : -1;
    const c = compare(p.v as string | number | Date, q.v as string | number | Date);
    return (descending ? -c : c) || p.i - q.i;
  });
  return keyed.map((k) => k.row);
}

const storeKey = (id: string) => `strata-view:${id}`;
function readStore(id: string): Partial<Stored> {
  try {
    const raw = localStorage.getItem(storeKey(id));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Partial<Stored>) : {};
  } catch {
    return {};
  }
}
function writeStore(id: string, value: Stored) {
  try {
    localStorage.setItem(storeKey(id), JSON.stringify(value));
  } catch {
    // Storage blocked or full: the view still works, it is just not remembered.
  }
}

function parseSort(text: string | null, sorts: readonly ViewSort<never>[]): { key: string; descending: boolean } | null {
  if (!text) return null;
  const m = /^(.*?)(?:-(asc|desc))?$/.exec(text);
  const key = m?.[1] ?? text;
  const sort = sorts.find((s) => s.key === key);
  return sort ? { key, descending: m?.[2] ? m[2] === "desc" : Boolean(sort.defaultDescending) } : null;
}

/** The view's state: sort and direction, group, tile size, aspect, layout and a text filter, kept in `localStorage` and (with `url`) the address, and applied to rows with `apply` and `grouped`. Draw it with `ViewOptions`; feed the result to `SelectableGrid`. */
export function useViewOptions<T>(config: ViewOptionsConfig<T>): ViewOptionsState<T> {
  const { id, sorts = [], groups = [], size: sizeRange, defaultAspect = "square" } = config;
  const urlNames = config.url ? { sort: "sort", group: "group", size: "size", ...(typeof config.url === "object" ? config.url : {}) } : null;
  // One hook or none, chosen by `url`, which is fixed for the life of the component (as `useExpanded`'s `param`).
  const urlState = urlNames ? useUrlView(urlNames) : null;

  const [state, setState] = React.useState<Stored>(() => {
    const saved = readStore(id);
    const first = sorts.find((s) => s.key === config.defaultSort?.key) ?? sorts[0];
    const fromUrl = urlState ? parseSort(urlState.get("sort"), sorts as never) : null;
    const savedSort = sorts.some((s) => s.key === saved.sort) ? (saved.sort as string) : null;
    const urlGroup = urlState?.get("group");
    const urlSize = Number(urlState?.get("size"));
    const clampSize = (n: number) => (sizeRange ? Math.min(sizeRange.max, Math.max(sizeRange.min, n)) : n);
    return {
      sort: fromUrl?.key ?? savedSort ?? first?.key ?? null,
      descending: fromUrl ? fromUrl.descending : savedSort ? Boolean(saved.descending) : Boolean(config.defaultSort?.descending ?? first?.defaultDescending),
      group: urlGroup && groups.some((g) => g.key === urlGroup) ? urlGroup : urlState?.has("group") ? null : saved.group !== undefined && (saved.group === null || groups.some((g) => g.key === saved.group)) ? saved.group : (config.defaultGroup ?? null),
      size: urlSize > 0 ? clampSize(urlSize) : typeof saved.size === "number" ? clampSize(saved.size) : null,
      aspect: saved.aspect && ["square", "portrait", "landscape"].includes(saved.aspect) ? saved.aspect : null,
      layout: saved.layout === "list" ? "list" : "grid",
    };
  });
  const [query, setQuery] = React.useState("");

  const size = state.size ?? sizeRange?.default ?? 144;
  const aspect = state.aspect ?? defaultAspect;

  // Remember, and write the address, after a change (not on the first render, which would only repeat what was read).
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    writeStore(id, state);
    urlState?.set({
      sort: state.sort ? `${state.sort}-${state.descending ? "desc" : "asc"}` : null,
      group: state.group,
      size: sizeRange ? String(size) : null,
    });
  }, [state]);

  const set = React.useCallback((patch: Partial<Stored>) => setState((s) => ({ ...s, ...patch })), []);
  const sortFor = (key: string | null) => sorts.find((s) => s.key === key);

  const apply = (rows: readonly T[]): T[] => {
    const needle = query.trim().toLowerCase();
    const text = config.filterText;
    const kept = needle && text ? rows.filter((r) => text(r).toLowerCase().includes(needle)) : [...rows];
    const sort = sortFor(state.sort);
    return sort ? sortRows(kept, sort.value, state.descending) : kept;
  };
  const grouped = (rows: readonly T[]): ViewGroupRows<T>[] => {
    const group = groups.find((g) => g.key === state.group);
    if (!group) return [{ key: "", heading: "", rows: [...rows] }];
    const out = new Map<string, T[]>();
    for (const row of rows) {
      const k = group.of(row);
      const list = out.get(k);
      if (list) list.push(row);
      else out.set(k, [row]);
    }
    return [...out].map(([key, list]) => ({ key, heading: group.heading ? group.heading(key) : key, rows: list }));
  };

  return {
    config,
    sort: state.sort,
    descending: state.descending,
    group: state.group,
    size,
    aspect,
    layout: state.layout,
    query,
    setSort: (key) => {
      const s = sortFor(key);
      if (s) set({ sort: key, descending: Boolean(s.defaultDescending) });
    },
    setDescending: (descending) => set({ descending }),
    setGroup: (key) => set({ group: key }),
    setSize: (n) => set({ size: sizeRange ? Math.min(sizeRange.max, Math.max(sizeRange.min, Math.round(n))) : n }),
    setAspect: (a) => set({ aspect: a }),
    setLayout: (layout) => set({ layout }),
    setQuery,
    apply,
    grouped,
    countText: (shown, total) => (query.trim() && shown !== total ? `${format.integer(shown)} of ${format.integer(total)}` : format.integer(total)),
    reset: () => set({ sort: sorts.find((s) => s.key === config.defaultSort?.key)?.key ?? sorts[0]?.key ?? null, descending: Boolean(config.defaultSort?.descending), group: config.defaultGroup ?? null, size: null, aspect: null, layout: "grid" }),
  };
}

// The address side of `useViewOptions`: reads three parameters and replaces them together. Its own
// hook so `useSearchParams` (and so a router) is needed only by a view that asks for `url`.
function useUrlView(names: { sort: string; group: string; size: string }) {
  const [params, setParams] = useSearchParams();
  return {
    get: (which: "sort" | "group" | "size") => params.get(names[which]),
    has: (which: "sort" | "group" | "size") => params.has(names[which]),
    set: (next: { sort: string | null; group: string | null; size: string | null }) =>
      setParams(
        (p) => {
          const out = new URLSearchParams(p);
          for (const which of ["sort", "group", "size"] as const) {
            if (next[which]) out.set(names[which], next[which]);
            else out.delete(names[which]);
          }
          return out;
        },
        { replace: true },
      ),
  };
}

const ASPECTS: Record<TileAspect, string> = { square: "Square", portrait: "Portrait", landscape: "Landscape" };

/** Props for `ViewOptions`. */
export type ViewOptionsProps<T> = {
  view: ViewOptionsState<T>;
  /** How many rows pass the filter, and how many there are; for "82 of 140". Omit with no filter. */
  shown?: number;
  total?: number;
  /** Names the toolbar. Default "View options". */
  label?: string;
  className?: string;
};

/** The one toolbar for a `useViewOptions` state: sort menu and direction, group menu, size slider (`-`/`+` keys), aspect, grid or list, and a filter with its count. One tab stop; on a phone all but the filter fold into a "View" popover. */
export function ViewOptions<T>({ view, shown, total, label = "View options", className }: ViewOptionsProps<T>) {
  const narrow = useNarrow();
  const { sorts = [], groups = [], size, aspects, layouts, filterText } = view.config;
  const sort = sorts.find((s) => s.key === view.sort);
  const [asc, desc] = sort?.directions ?? (["Ascending", "Descending"] as const);

  const controls = (
    <>
      {sorts.length > 0 && (
        <>
          <NativeSelect size="sm" aria-label="Sort by" value={view.sort ?? ""} onChange={(e) => view.setSort(e.target.value)} className="w-auto">
            {sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </NativeSelect>
          <IconButton size="sm" icon={view.descending ? ArrowDown : ArrowUp} label={view.descending ? desc : asc} hint="Reverse" onPress={() => view.setDescending(!view.descending)} />
        </>
      )}
      {groups.length > 0 && (
        <NativeSelect size="sm" aria-label="Group by" value={view.group ?? ""} onChange={(e) => view.setGroup(e.target.value || null)} className="w-auto">
          <option value="">No grouping</option>
          {groups.map((g) => <option key={g.key} value={g.key}>Group by {g.label.toLowerCase()}</option>)}
        </NativeSelect>
      )}
      {size && (
        <div
          className="w-40"
          onKeyDown={(e) => {
            // `-` and `+` (and `=`, the unshifted + key) as the zoom keys the grid also answers to.
            if (e.key === "-" || e.key === "_") view.setSize(view.size - (size.step ?? 12));
            else if (e.key === "+" || e.key === "=") view.setSize(view.size + (size.step ?? 12));
            else return;
            e.preventDefault();
          }}
        >
          <Slider aria-label="Tile size" min={size.min} max={size.max} step={size.step ?? 12} value={view.size} onChange={view.setSize} hideValue />
        </div>
      )}
      {aspects && aspects.length > 1 && (
        <ToggleGroup size="sm" label="Picture shape" options={aspects.map((a) => ({ value: a, label: ASPECTS[a] }))} value={view.aspect} onChange={(v) => view.setAspect(v as TileAspect)} />
      )}
      {layouts && (
        <ToggleGroup size="sm" label="Layout" options={[{ value: "grid", label: "Grid", icon: LayoutGrid, iconOnly: true }, { value: "list", label: "List", icon: List, iconOnly: true }]} value={view.layout} onChange={(v) => view.setLayout(v as "grid" | "list")} />
      )}
    </>
  );
  const filter = filterText && (
    <>
      <Input size="sm" type="search" aria-label="Filter" placeholder="Filter" value={view.query} onChange={(e) => view.setQuery(e.target.value)} className="w-40" />
      {shown !== undefined && total !== undefined && (
        <span role="status" className="type-caption text-muted-foreground tabular-nums">{view.countText(shown, total)}</span>
      )}
    </>
  );

  return (
    <Toolbar label={label} className={cn("gap-2", className)}>
      {narrow ? (
        <Popover label="View" side="bottom" trigger={<Button size="sm"><SlidersHorizontal aria-hidden />View</Button>}>
          <div className="grid gap-2">{controls}</div>
        </Popover>
      ) : (
        controls
      )}
      {filter && !narrow && <ToolbarSeparator />}
      {filter}
    </Toolbar>
  );
}
