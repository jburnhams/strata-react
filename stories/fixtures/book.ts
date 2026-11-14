import type { BookPage, PictureBox } from "../../src";

// A stand-in for a scanned book of Punch and Judy: pages drawn as paper with lines of "text", as
// inline SVG so stories and baselines need no files. The colours are the picture's own pixels (paper
// and ink), not interface colour. Pages are 1200 by 1800, the scan's size, so a box's coordinates are
// real pixels; a few pages are a little crooked, as scans are.

export const PAGE_SIZE = [1200, 1800] as const;
const printedLabels = ["", "", "i", "ii", "iii", "iv", "1", "2", "3", "4", "5", "6"];

const LINES = 14;
/** The lines the reader found on a page, in the page's pixels; every fifth is one it was unsure of. */
export function pageLines(n: number): PictureBox[] {
  return Array.from({ length: LINES }, (_, i) => {
    const confidence = (i + n) % 5 === 0 ? 62 : 90 + ((i * 3 + n) % 9);
    const text = i === 0 ? "THE PLAY OF PUNCH AND JUDY" : i % 5 === 0 ? "a scene in one act (scrawled)" : "Enter Punch with his stick, and a dog";
    return { id: `p${n}-l${i + 1}`, x: 140, y: 200 + i * 100, w: 920 - ((i * 37 + n * 11) % 260), h: 56, label: `Line ${i + 1}: ${text}, ${confidence}%`, tone: confidence < 70 ? "warning" : undefined };
  });
}

function pageSvg(n: number): string {
  const lines = pageLines(n)
    .map((b) => `<rect x="${b.x}" y="${b.y + 12}" width="${b.w}" height="30" rx="6" fill="#4a3f35" opacity="0.72"/>`)
    .join("");
  const tilt = n % 3 === 1 ? 1.2 : n % 3 === 2 ? -0.8 : 0;
  const folio = printedLabels[n - 1];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1800"><rect width="1200" height="1800" fill="#ece1c9"/><g transform="rotate(${tilt} 600 900)">${lines}${folio ? `<text x="600" y="1700" font-size="44" text-anchor="middle" fill="#4a3f35" font-family="serif">${folio}</text>` : ""}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Twelve scanned pages; the first two have no printed number, the next four are roman. */
export const bookPages: BookPage[] = Array.from({ length: 12 }, (_, i) => {
  const src = pageSvg(i + 1);
  return { id: `scan-${i + 1}`, src, thumb: src, label: `Page ${i + 1} of The Play of Punch and Judy`, scan: String(i + 1), printed: printedLabels[i] || undefined, natural: PAGE_SIZE };
});

/** The pages that need a look, as the page finder was unsure of them. */
export const needsLook = new Set(["scan-4", "scan-9"]);
