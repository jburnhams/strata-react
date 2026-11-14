// The page arithmetic behind `BookViewer` (issue #238): how pages pair into spreads the way a
// printed book does, and how "iv" or "22" finds a page. Plain numbers and strings, no DOM.

/** A page as the lookup sees it: its position in the scan (1-based, as a person counts) and its printed label, if it has one. */
export type PageNames = { scan: string; printed?: string };

/**
 * The pages shown together, as indexes into the set. In a spread the first page stands alone on
 * the right (a book opens on its first recto, so the left side is empty), then pages pair 2 and 3,
 * 4 and 5, and an odd one out at the end stands alone on the left. In a single layout every page
 * is its own view.
 */
export function viewsOf(count: number, spread: boolean): number[][] {
  if (!spread) return Array.from({ length: count }, (_, i) => [i]);
  const views: number[][] = count > 0 ? [[0]] : [];
  for (let i = 1; i < count; i += 2) views.push(i + 1 < count ? [i, i + 1] : [i]);
  return views;
}

/** The index of the view that holds page `index`. */
export function viewOf(index: number, spread: boolean): number {
  return spread ? (index <= 0 ? 0 : Math.floor((index + 1) / 2)) : Math.max(index, 0);
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Finds the page a person typed. A printed label wins ("iv", "12") because that is what is printed
 * on the page they are looking at; otherwise it is the scan's own position ("22" is the 22nd
 * image). Roman numerals and any other label match as text, case aside. Returns the index, or
 * `null` when no page has that name.
 */
export function findPage(pages: readonly PageNames[], query: string): number | null {
  const q = norm(query.replace(/^(page|p\.?)\s+/i, ""));
  if (!q) return null;
  const printed = pages.findIndex((p) => p.printed !== undefined && norm(p.printed) === q);
  if (printed >= 0) return printed;
  const scan = pages.findIndex((p) => norm(p.scan) === q);
  return scan >= 0 ? scan : null;
}

/** A page said in words: "Page 22 (12)" or "Page 22" with no printed label. */
export const pageName = (p: PageNames, word = "Page") => `${word} ${p.scan}${p.printed ? ` (${p.printed})` : ""}`;

/** Where the viewer is, in words: "Page 22 (12) of 44", or "Pages 22 and 23 of 44" for a spread. */
export function sayPosition(shown: readonly PageNames[], total: number, word = "Page", plural = "Pages"): string {
  if (shown.length === 0) return "";
  if (shown.length === 1) return `${pageName(shown[0], word)} of ${total}`;
  const label = (p: PageNames) => `${p.scan}${p.printed ? ` (${p.printed})` : ""}`;
  return `${plural} ${label(shown[0])} and ${label(shown[1])} of ${total}`;
}
