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

    const next = new Map<string, LayoutInfo>();
    this.headers = [];
    let y = space;
    let col = 0;
    let rowInfos: LayoutInfo[] = [];
    const endRow = () => {
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
    // The heading whose group is at the top of the visible area, kept there.
    let current: LayoutInfo | null = null;
    for (const h of this.headers) if (h.rect.y <= rect.y) current = h;
    if (!current || current.rect.y === rect.y) return visible;
    const stuck = current.copy();
    stuck.rect = new Rect(0, rect.y, current.rect.width, current.rect.height);
    stuck.zIndex = 10;
    return [...visible.filter((l) => l.key !== current!.key), stuck];
  }
}
