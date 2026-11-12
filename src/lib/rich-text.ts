// A small, safe subset of inline and block text for an answer a model or a server wrote:
// paragraphs, `-`/`1.` lists, **bold**, `code`, [links](https://…) and ids of known things.
// Issue #192, from strata-360's Ask page.
//
// This is a parser to a plain tree, never to HTML: the renderer (`RichText`) builds React
// elements from it, so no string a model writes can become markup. A link keeps only http(s) and
// mailto targets; anything else (`javascript:`, `data:`) is shown as its text.
//
// Entities are the point of the exercise: an answer says "booking f-0412" and the app wants that
// id to be a button. Matching is longest first (so `f-0412-b` wins over `f-0412`) and never inside
// a word (`f-04123` and `xf-0412` do not match), with the boundary being any letter, digit, `_` or
// `-`. A matcher function may be given instead of a list, for ids a pattern describes.

/** One id found in a text: `[start, end)` into the text and the id to open. */
export type EntityMatch = { start: number; end: number; id: string };
/** A way to find entities in a run of text: a list of known ids, or a function that reports matches. */
export type EntityMatcher = readonly string[] | ((text: string) => readonly EntityMatch[]);

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "entity"; id: string; text: string };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] };

const WORD = /[\p{L}\p{N}_-]/u;

/** Finds ids in `text`, longest first, never inside a longer word. Overlaps go to the earlier, longer match. */
export function matchEntities(text: string, matcher: EntityMatcher | undefined): EntityMatch[] {
  if (!matcher) return [];
  if (typeof matcher === "function") return [...matcher(text)].sort((a, b) => a.start - b.start);
  const ids = [...new Set(matcher)].filter(Boolean).sort((a, b) => b.length - a.length);
  const found: EntityMatch[] = [];
  let i = 0;
  while (i < text.length) {
    let hit: string | undefined;
    if (i === 0 || !WORD.test(text[i - 1]!)) {
      for (const id of ids) {
        if (text.startsWith(id, i) && (i + id.length >= text.length || !WORD.test(text[i + id.length]!))) {
          hit = id;
          break;
        }
      }
    }
    if (hit) {
      found.push({ start: i, end: i + hit.length, id: hit });
      i += hit.length;
    } else i++;
  }
  return found;
}

/** A link is safe when its scheme is http, https or mailto. */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function plain(text: string, matcher: EntityMatcher | undefined): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of matchEntities(text, matcher)) {
    if (m.start < at) continue;
    if (m.start > at) out.push({ type: "text", text: text.slice(at, m.start) });
    out.push({ type: "entity", id: m.id, text: text.slice(m.start, m.end) });
    at = m.end;
  }
  if (at < text.length) out.push({ type: "text", text: text.slice(at) });
  return out;
}

/** Parses one line's inline marks. Unclosed marks stay as the text they were typed as. */
export function parseInline(text: string, matcher?: EntityMatcher): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push(...plain(buffer, matcher));
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "bold", children: parseInline(text.slice(i + 2, end), matcher) });
        i = end + 2;
        continue;
      }
    } else if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (text[i] === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (m) {
        const href = safeHref(m[2]!);
        flush();
        if (href) out.push({ type: "link", href, children: parseInline(m[1]!, matcher) });
        else out.push({ type: "text", text: m[1]! });
        i += m[0].length;
        continue;
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
  return out;
}

/** Parses blocks: blank-line separated paragraphs, and runs of `- ` or `1. ` lines as lists. */
export function parseRichText(text: string, matcher?: EntityMatcher): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const endParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" "), matcher) });
    paragraph = [];
  };
  const endList = () => {
    if (list) blocks.push({ type: "list", ...list });
    list = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const item = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      endParagraph();
      const ordered = item[2] !== undefined;
      if (list && list.ordered !== ordered) endList();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(item[3]!, matcher));
    } else if (!line.trim()) {
      endParagraph();
      endList();
    } else {
      endList();
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  endList();
  return blocks;
}

/** The plain words of a text with the marks removed: what a live region announces. */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|`/g, "")
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
