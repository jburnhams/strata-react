// The rules a number control needs and a native one lacks (issue #73): read what a person typed in
// their locale, reject what is not a number instead of turning it into 0 or NaN, and step without
// the float drift of 0.1 + 0.2. Pure functions so the field, the slider and their tests share them.
// Parsing is locale-aware because "1.234,5" is one thousand in de-DE and a typo in en-GB; the group
// and decimal marks come from `Intl`, not from a table. A value that is empty is `null`, never 0.

export type NumberMarks = { decimal: string; group: string; minus: string };

/** The decimal mark, group mark and minus sign a locale uses. */
export function numberMarks(locale: string): NumberMarks {
  const parts = new Intl.NumberFormat(locale, { useGrouping: true, minimumFractionDigits: 1 }).formatToParts(-12345.6);
  const get = (type: string, fallback: string) => parts.find((p) => p.type === type)?.value ?? fallback;
  return { decimal: get("decimal", "."), group: get("group", ","), minus: get("minusSign", "-") };
}

export type ParseResult = { kind: "empty" } | { kind: "invalid" } | { kind: "number"; value: number };

/**
 * Reads typed text as a number in `locale`. Accepts the locale's marks, a plain "." as the decimal
 * when the locale's group mark is not ".", a hyphen or true minus sign, spaces (and non-breaking
 * ones) as grouping, and a trailing `unit` the person typed ("40%"). Anything else is `invalid`.
 */
export function parseNumber(text: string, locale: string, unit?: string): ParseResult {
  let t = asciiDigits(text.trim(), locale);
  if (unit && t.endsWith(unit)) t = t.slice(0, -unit.length).trim();
  if (t === "") return { kind: "empty" };
  const { decimal, group, minus } = numberMarks(locale);
  t = t.replace(/[\u00a0\u202f']/g, " ");
  t = t.replace(new RegExp(`^[${escapeClass(minus)}\\u2212-]`), "-");
  const negative = t.startsWith("-");
  if (negative) t = t.slice(1);
  // A plain "." is accepted as the decimal mark unless the locale uses "." to group.
  if (decimal !== "." && group !== ".") t = t.replace(".", decimal);
  const groupMark = group.trim() === "" || /[\s\u00a0\u202f]/.test(group) ? " " : group;
  const d = escapeRegExp(decimal);
  const g = escapeRegExp(groupMark);
  // Grouping must be where the locale puts it (1,234,567 but not 12,5 or 1,,234); a number may also
  // be typed with no grouping at all. Checking the shape first means a wrong-locale entry is
  // refused instead of read as a different magnitude.
  const grouped = new RegExp(`^\\d{1,3}(?:${g}\\d{3})+(?:${d}\\d*)?$`);
  const plain = new RegExp(`^(?:\\d+(?:${d}\\d*)?|${d}\\d+)$`);
  if (!plain.test(t) && !grouped.test(t)) return { kind: "invalid" };
  const value = Number((negative ? "-" : "") + t.split(groupMark).join("").replace(decimal, "."));
  return Number.isFinite(value) ? { kind: "number", value } : { kind: "invalid" };
}

/** Turns a locale's own digits (Arabic-Indic, Devanagari) into 0-9, so what the field prints can be read back. */
function asciiDigits(text: string, locale: string): string {
  const f = new Intl.NumberFormat(locale, { useGrouping: false });
  const map = new Map<string, string>();
  for (let i = 0; i < 10; i++) map.set(f.format(i), String(i));
  return [...text].map((c) => map.get(c) ?? c).join("");
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeClass(s: string) {
  return s.replace(/[\\\]^-]/g, "\\$&");
}

/** How many decimal places a step has: 0.25 has 2, 5 has 0. */
export function decimalsOf(n: number): number {
  const s = String(n);
  if (s.includes("e-")) return Number(s.split("e-")[1]) + (s.split("e-")[0].split(".")[1]?.length ?? 0);
  return s.split(".")[1]?.length ?? 0;
}

/** Rounds to `places` decimals, so repeated steps of 0.1 do not drift. */
export function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

/** Keeps `n` within `min` and `max`, either of which may be left out. */
export function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

/**
 * The value after stepping `by` steps from `value`. Stepping from an empty value starts at `min`
 * (or 0), lands on the step grid anchored at `min`, and stays inside the limits.
 */
export function stepValue(value: number | null, by: number, step: number, min?: number, max?: number): number {
  const places = Math.max(decimalsOf(step), min === undefined ? 0 : decimalsOf(min));
  if (value === null) return clamp(roundTo(by > 0 ? (min ?? 0) : (max ?? min ?? 0), places), min, max);
  const anchor = min ?? 0;
  const k = (value - anchor) / step;
  const onGrid = Math.abs(k - Math.round(k)) < 1e-9;
  // Off the grid, the first step in a direction lands on the next grid point, not a whole step away.
  const steps = onGrid ? Math.round(k) + by : by > 0 ? Math.ceil(k) + by - 1 : Math.floor(k) + by + 1;
  return clamp(roundTo(anchor + steps * step, places), min, max);
}

// ---- colour ----

/** Reads `#rgb`, `#rrggbb` (with or without the #) as lower-case `#rrggbb`, or null. */
export function parseHex(text: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return "#" + (h.length === 3 ? [...h].map((c) => c + c).join("") : h);
}

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

/** WCAG contrast ratio between two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
