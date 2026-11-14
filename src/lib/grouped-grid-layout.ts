import { GridLayout } from "react-aria-components";
import { LayoutInfo, Rect } from "react-stately";

// A grid of tiles in groups under full-width headings, for React Aria's `Virtualizer` (issue #246,
// strata-stills' photo grid with 2,000 pictures by hour). `GridLayout` takes one flat collection and
// places each item in the next column, so a heading would be one more tile. Checked in its source
// (react-stately's `GridLayout.update`): it works out the column count, tile size and gaps from
// `minItemSize` and `minSpace`, keeps measured heights by key, and then places items row by row. This
// subclass lets it do that, then re-places what it made: a heading is an item whose key starts with
// `GROUP_PREFIX`, drawn the full width at `HEADER_HEIGHT`, and the tiles after it start a new row.
// Keyboard movement follows: React Aria's grid keyboard delegate reads each item's rectangle from the
// layout (`getItemRect`), so arrows go up, down, left and right across the new rows.
//
// The heading of the group at the top of the visible area is kept at the top of it: the layout hands
// the Virtualizer a copy of that heading, moved to the visible top and above the tiles (zIndex), in
// place of the real one, which is above the visible area by then. The Virtualizer asks for the
// visible items whenever the scroll position changes, so this needs no re-layout while scrolling.

/** Keys of group headings start with this, so a tile key that is a plain id can never be mistaken for one. */
export const GROUP_PREFIX = "⁣group⁣";
export const groupKey = (group: string) => `${GROUP_PREFIX}${group}`;
export const isGroupKey = (key: unknown): key is string => typeof key === "string" && key.startsWith(GROUP_PREFIX);

/** The height of a group's heading row, in px. */
export const HEADER_HEIGHT = 40;

/** One picture to place in a justified row: its width over height, known before it loads. */
export type JustifyItem = { key: string; aspect: number };
/** Where `justifyRows` put a picture, relative to the row's left edge, and the height of the picture's row. */
export type Justified = { key: string; x: number; width: number; row: number };

/**
 * Rows of equal height, each picture at its own shape (Google Photos, Lightroom): fill a row with
 * pictures at the target height `rowHeight` until it is full, then scale the row's height so it spans
 * `width` exactly. The last row of a run keeps the target height rather than stretching, so a short
 * run does not become giant pictures. `padding` is each tile's own padding and border, added to
 * every tile's width on top of the picture (the picture is `aspect` times the row's height). Returns
 * the placements and each row's picture height.
 */
export function justifyRows(items: readonly JustifyItem[], width: number, rowHeight: number, gap: number, padding: number): { placed: Justified[]; heights: number[] } {
  const placed: Justified[] = [];
  const heights: number[] = [];
  let run: JustifyItem[] = [];
  const flush = (last: boolean) => {
    if (!run.length) return;
    const sum = run.reduce((t, i) => t + i.aspect, 0);
    const room = width - gap * (run.length - 1) - padding * run.length;
    // A full row is scaled to fit exactly; the last is only ever scaled down (when it would not fit at the target).
    const h = last ? Math.min(rowHeight, room / sum) : room / sum;
    let x = 0;
    for (const i of run) {
      const w = i.aspect * h + padding;
      placed.push({ key: i.key, x, width: w, row: heights.length });
      x += w + gap;
    }
    heights.push(h);
    run = [];
  };
  for (const item of items) {
    run.push(item);
    const w = run.reduce((t, i) => t + i.aspect * rowHeight + padding, 0) + gap * (run.length - 1);
    if (w >= width) flush(false);
  }
  flush(true);
  return { placed, heights };
}

/**
 * The copy of the heading to draw at the top of the visible area, or null when the real one is already
 * there. It is the last heading at or above `top`, moved to `top`, but never lower than the next
 * heading's top less its own height, so the next heading pushes it up as it arrives.
 */
export function stuckHeader<H extends LayoutInfo>(headers: readonly H[], top: number): LayoutInfo | null {
  let current: H | null = null;
  for (const h of headers) if (h.rect.y <= top) current = h;
  if (!current || current.rect.y === top) return null;
  const after = headers[headers.indexOf(current) + 1];
  const y = after ? Math.min(top, after.rect.y - current.rect.height) : top;
  const copy = current.copy();
  copy.rect = new Rect(0, y, current.rect.width, current.rect.height);
  copy.zIndex = 10;
  return copy;
}

/** `GridLayout` with full-width group headings (items keyed by `groupKey`) that stay at the top of the scroll box while their group is in view. */
export class GroupedGridLayout<T = unknown> extends GridLayout<T> {
  private headers: LayoutInfo[] = [];

  update(context: Parameters<GridLayout<T>["update"]>[0]): void {
    super.update(context);
    const options = context.layoutOptions ?? {};
    const space = options.minSpace?.height ?? 18;
    const width = this.virtualizer!.size.width;
    const collection = this.virtualizer!.collection;

    // What the base layout worked out: the tile's width and each tile's x, from the first row.
    const tiles = [...collection].filter((n) => !isGroupKey(n.key)).map((n) => super.getLayoutInfo(n.key)).filter((l): l is LayoutInfo => l !== null);
    const first = tiles[0];
    const columns = Math.max(1, (this as unknown as { numColumns: number }).numColumns);
    // The column positions come from the first row of the base layout whatever sits in it (a heading
    // takes a column there), not from the first tiles.
    const xs = [...collection].slice(0, columns).map((n) => super.getLayoutInfo(n.key)?.rect.x ?? 0);
    const tileHeight = tiles.reduce((h, t) => Math.max(h, t.rect.height), 0) || first?.rect.height || 0;

    const justify = (options as { justify?: unknown }).justify as { aspects: ReadonlyMap<string, number>; rowHeight: number; padding: number; chrome: number } | undefined;
    const next = new Map<string, LayoutInfo>();
    this.headers = [];
    let y = space;
    let col = 0;
    let rowInfos: LayoutInfo[] = [];
    let run: { node: (typeof collection extends Iterable<infer N> ? N : never); base: LayoutInfo; aspect: number }[] = [];
    // A justified run (a group's tiles, or all of them) is packed into rows of equal height.
    const endRun = () => {
      if (!justify || !run.length) return;
      const { placed, heights } = justifyRows(run.map((r) => ({ key: String(r.node.key), aspect: r.aspect })), width, justify.rowHeight, space, justify.padding);
      const byKey = new Map(run.map((r) => [String(r.node.key), r]));
      const tops: number[] = [];
      for (const h of heights) { tops.push(y); y += h + justify.chrome + space; }
      for (const p of placed) {
        const r = byKey.get(p.key)!;
        const info = r.base.copy();
        info.rect = new Rect(p.x, tops[p.row]!, p.width, heights[p.row]! + justify.chrome);
        info.estimatedSize = false;
        next.set(p.key, info);
      }
      run = [];
    };
    const endRow = () => {
      endRun();
      if (!rowInfos.length) return;
      const h = rowInfos.reduce((m, l) => Math.max(m, l.rect.height), 0);
      for (const l of rowInfos) l.rect.height = h;
      y += h + space;
      rowInfos = [];
      col = 0;
    };
    for (const node of collection) {
      const key = String(node.key);
      if (isGroupKey(key)) {
        endRow();
        const info = new LayoutInfo(node.type, key, new Rect(0, y, width, HEADER_HEIGHT));
        info.estimatedSize = false;
        info.allowOverflow = true;
        info.content = node;
        next.set(key, info);
        this.headers.push(info);
        y += HEADER_HEIGHT + space;
        continue;
      }
      const base = super.getLayoutInfo(node.key);
      if (!base) continue;
      if (justify) {
        run.push({ node, base, aspect: justify.aspects.get(key) ?? 1 });
        continue;
      }
      const info = base.copy();
      info.rect = new Rect(xs[col] ?? base.rect.x, y, base.rect.width, Math.max(tileHeight, base.rect.height));
      info.estimatedSize = base.estimatedSize;
      next.set(key, info);
      rowInfos.push(info);
      if (++col === columns) endRow();
    }
    endRow();
    (this as unknown as { layoutInfos: Map<string, LayoutInfo> }).layoutInfos = next;
    (this as unknown as { contentSize: { width: number; height: number } }).contentSize = { width, height: y } as never;
  }

  getVisibleLayoutInfos(rect: Rect): LayoutInfo[] {
    const visible = super.getVisibleLayoutInfos(rect);
    const stuck = stuckHeader(this.headers, rect.y);
    if (!stuck) return visible;
    const current = stuck;
    return [...visible.filter((l) => l.key !== current.key), stuck];
  }
}
