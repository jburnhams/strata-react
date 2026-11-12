// A word-level difference between two texts, for `CompareText`. Our own and deliberately simple
// (Jonathan, 2026-11-12: "do a simple diff ourselves for now and see what text similarity is better
// in future"): split on whitespace, find the longest common subsequence of words, and mark the words
// on each side that are not in it. Case and punctuation count, because a transcript that drops a
// comma or a capital differs from one that keeps it, and the judge decides whether that matters.
// What it does not do: notice a moved sentence (it shows as removed here and added there), weigh a
// word by how different it is, or align by meaning. Those are what a text-similarity method would
// add, and are the reason this stays behind one function.
//
// The table is words × words, so a very long pair is refused (`null`) rather than freezing the
// page; the caller says so in words and still shows both texts.

/** A run of one text: its words and spaces as written, and whether the words are not in the other text. */
export type TextSegment = { text: string; changed: boolean };

/** The two texts cut into segments, and how many words differ on each side. */
export type TextDifference = { a: TextSegment[]; b: TextSegment[]; changedA: number; changedB: number };

/** The most words in A times the most in B that are compared; a bigger pair is not. */
export const MAX_CELLS = 2_500_000;

const tokens = (text: string) => text.split(/(\s+)/).filter((t) => t !== "");
const isSpace = (t: string) => /^\s+$/.test(t);

/** Marks the words that differ between two texts, or returns null when the pair is too long to compare. */
export function diffWords(a: string, b: string): TextDifference | null {
  const ta = tokens(a);
  const tb = tokens(b);
  const wa = ta.filter((t) => !isSpace(t));
  const wb = tb.filter((t) => !isSpace(t));
  if ((wa.length + 1) * (wb.length + 1) > MAX_CELLS) return null;
  const w = wb.length + 1;
  const table = new Uint32Array((wa.length + 1) * w);
  for (let i = wa.length - 1; i >= 0; i--)
    for (let j = wb.length - 1; j >= 0; j--)
      table[i * w + j] = wa[i] === wb[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
  const sameA = new Set<number>();
  const sameB = new Set<number>();
  for (let i = 0, j = 0; i < wa.length && j < wb.length; ) {
    if (wa[i] === wb[j]) {
      sameA.add(i++);
      sameB.add(j++);
    } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) i++;
    else j++;
  }
  const cut = (all: string[], same: Set<number>) => {
    let word = 0;
    const out: TextSegment[] = [];
    let changed = 0;
    for (const t of all) {
      if (isSpace(t)) {
        out.push({ text: t, changed: false });
        continue;
      }
      const diff = !same.has(word++);
      if (diff) changed++;
      out.push({ text: t, changed: diff });
    }
    return { out, changed };
  };
  const ra = cut(ta, sameA);
  const rb = cut(tb, sameB);
  return { a: ra.out, b: rb.out, changedA: ra.changed, changedB: rb.changed };
}
