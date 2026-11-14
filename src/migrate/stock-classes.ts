// Finds the stock Tailwind classes an app still uses, for an app moving onto Strata one screen at a time (issue #225).
// `strata.css` clears Tailwind's colour, type-size, radius, shadow and font namespaces, so `bg-stone-100`, `text-sm`,
// `rounded-xl` and `shadow-lg` stop compiling the moment it is imported. `strata.migrate.css` keeps them, and this lists
// what is left to convert so the app knows when `strata.css` is one import away. It reads class names as text (no Tailwind
// build, no dependency), so it is a list to work from, not a proof: a class built from parts ("bg-" + tone) is invisible
// to it and to Tailwind's own scanner alike, and a word that only looks like a class in a string can be listed.

/** What kind of stock class it is, named as the roles that replace it are. */
export type StockKind = "colour" | "text size" | "radius" | "shadow" | "font";

/** One stock class found at a line of a file. */
export type StockClass = { line: number; className: string; kind: StockKind; instead: string };

const COLOURS = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTILITIES = "bg|text|border(?:-[xytblrse])?|ring|ring-offset|fill|stroke|from|via|to|divide|outline|accent|caret|decoration|placeholder|shadow|inset-shadow|inset-ring|text-shadow";
const colour = new RegExp(`^(?:${COLOUR_UTILITIES})-(?:(?:${COLOURS})-(?:50|100|200|300|400|500|600|700|800|900|950)|white|black)(?:/\\d+)?$`);
const textSize = /^text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/[\w.[\]-]+)?$/;
const radius = /^rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|ee|es))?-(?:xs|sm|md|lg|xl|2xl|3xl|4xl)$/;
const shadow = /^(?:inset-)?shadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)$/;
const font = /^font-serif$/;

const rules: { kind: StockKind; test: RegExp; instead: string }[] = [
  { kind: "colour", test: colour, instead: "a colour role: bg-primary, bg-muted, text-muted-foreground, border-border, bg-danger-subtle…" },
  { kind: "text size", test: textSize, instead: "a type step: type-caption, type-label, type-body-sm, type-body, type-heading, type-title" },
  { kind: "radius", test: radius, instead: "a radius role: rounded-control, rounded-surface, rounded-overlay or rounded-pill" },
  { kind: "shadow", test: shadow, instead: "shadow-overlay for what floats, a border for what sits on the page" },
  { kind: "font", test: font, instead: "font-display, or a face your theme names" },
];

/** Stock classes in `source`, one entry per use. In a `.css` file only `@apply` lines are read. */
export function findStockClasses(source: string, file = ""): StockClass[] {
  const css = /\.css$/.test(file);
  const found: StockClass[] = [];
  // In a stylesheet an `@apply` runs to its `;` (or the closing brace), however many lines it is written over.
  let applying = false;
  source.split("\n").forEach((text, i) => {
    if (css) {
      if (!applying && !text.includes("@apply")) return;
      applying = !/[;}]/.test(text.slice(Math.max(0, text.indexOf("@apply"))));
    }
    for (const token of text.match(/[^\s"'`<>{}()=,;]+/g) ?? []) {
      // The utility is what follows the last variant (`dark:hover:bg-stone-100`), without an important mark.
      const className = token.slice(token.lastIndexOf(":") + 1).replace(/^!|!$/g, "");
      const rule = rules.find((r) => r.test.test(className));
      if (rule) found.push({ line: i + 1, className: token.replace(/^!/, ""), kind: rule.kind, instead: rule.instead });
    }
  });
  return found;
}
