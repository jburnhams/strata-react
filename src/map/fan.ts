// Markers that would sit on top of each other are moved apart in a small fan (strata-react issue #181).
// Pure maths on pixel positions, no map and no DOM, so the rule can be tested and so a frame is the
// same everywhere. The positions are in the map's *world* pixels at the current zoom (not the screen's),
// so panning never changes the result, only zooming does, and zooming in is what settles the fan.
//
// Rules: markers within `gap` pixels of each other, directly or through a chain of neighbours
// (single linkage), form one group. A group of two to six goes on one circle just wide enough that
// neighbours are `gap` apart; a larger group fills rings of radius gap, 2 gap, 3 gap… each holding as
// many as fit, so forty markers on one spot make a tidy rosette, not one huge circle. The first marker
// of a group (input order) goes straight up and the rest follow clockwise: the same input always gives the
// same output. A lone marker does not move.

/** A marker's true place in world pixels. */
export type FanInput = { id: string; x: number; y: number };
/** Where it is drawn; `fanned` is true when that is not its true place (draw a leader line back). */
export type FanOutput = { id: string; x: number; y: number; fanned: boolean };

/** Move apart markers closer than `gap` pixels. Output is in input order. */
export function fanOut(items: readonly FanInput[], gap = 26): FanOutput[] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // A grid of `gap`-sized cells, so each marker is compared with its neighbours and not with all 500.
  const cells = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  items.forEach((p, i) => {
    const [cx, cy] = [Math.floor(p.x / gap), Math.floor(p.y / gap)];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of cells.get(key(cx + dx, cy + dy)) ?? []) {
          if (Math.hypot(items[j].x - p.x, items[j].y - p.y) < gap) parent[find(i)] = find(j);
        }
    const own = cells.get(key(cx, cy));
    if (own) own.push(i);
    else cells.set(key(cx, cy), [i]);
  });
  const groups = new Map<number, number[]>();
  items.forEach((_, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });
  const out: FanOutput[] = items.map((p) => ({ id: p.id, x: p.x, y: p.y, fanned: false }));
  for (const members of groups.values()) {
    const n = members.length;
    if (n < 2) continue;
    const cx = members.reduce((s, i) => s + items[i].x, 0) / n;
    const cy = members.reduce((s, i) => s + items[i].y, 0) / n;
    const place = (i: number, radius: number, angle: number) => {
      out[i] = { id: items[i].id, x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle), fanned: true };
    };
    if (n <= 6) {
      const radius = gap / (2 * Math.sin(Math.PI / n));
      members.forEach((i, k) => place(i, radius, (2 * Math.PI * k) / n));
    } else {
      let k = 0;
      for (let ring = 1; k < n; ring++) {
        const radius = ring * gap;
        const fit = Math.max(1, Math.floor((2 * Math.PI * radius) / gap));
        const here = Math.min(fit, n - k);
        for (let m = 0; m < here; m++) place(members[k + m], radius, (2 * Math.PI * m) / here);
        k += here;
      }
    }
  }
  return out;
}
