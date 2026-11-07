// Every number and date on screen goes through Intl, once, here. Units are joined with a
// non-breaking space so "212 °C" never wraps between figure and unit. A product that is not
// en-GB calls createFormat with its locale once and exports the result from its own lib.
//
// The number formatters are callable (`format.integer(n)`) because that is the form people reach
// for (strata-react issue #12), and they keep Intl's methods (`format.integer.format(n)`,
// `formatToParts`, `resolvedOptions`) so existing calls and Intl knowledge still work.
//
// Tests: the non-breaking space is a real character in the DOM. Testing Library's text matchers
// (`getByText`, `toHaveTextContent`) collapse whitespace and match "6 pieces", but accessible-name
// matching (`getByRole("heading", { name: "6 pieces" })`) compares the name exactly and does not.
// Build the expected string with the same formatter (`{ name: format.count(6, "piece") }`), or
// use a regex with `\s` (`/6\spieces/`), which matches U+00A0.

export const NBSP = " ";

/** The decimal byte units `format.bytes` writes. */
export type ByteUnit = "B" | "kB" | "MB" | "GB" | "TB" | "PB";
const BYTE_UNITS: readonly ByteUnit[] = ["B", "kB", "MB", "GB", "TB", "PB"];
const BYTE_SIZE = Object.fromEntries(BYTE_UNITS.map((u, i) => [u, 1000 ** i])) as Record<ByteUnit, number>;

/** An `Intl.NumberFormat` that can also be called directly: `f(n)` is `f.format(n)`. */
export type NumberFormatter = ((value: number | bigint) => string) & Pick<Intl.NumberFormat, "format" | "formatToParts" | "resolvedOptions">;

function callable(nf: Intl.NumberFormat): NumberFormatter {
  const format = (value: number | bigint) => nf.format(value);
  return Object.assign(format, {
    format,
    formatToParts: (value: number | bigint) => nf.formatToParts(value),
    resolvedOptions: () => nf.resolvedOptions(),
  });
}

/** Intl formatters for one locale: integers, decimals, percent, times, days, units with a non-breaking space, byte sizes, and counted nouns. */
export function createFormat(locale: string) {
  const integer = callable(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }));
  const decimal = callable(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
  const percent = callable(new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }));
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const shortDay = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const withUnit = (value: number, unit: string, fmt: Pick<Intl.NumberFormat, "format"> = integer) =>
    `${fmt.format(value)}${NBSP}${unit}`;
  return {
    locale,
    /** Whole numbers with grouping: `format.integer(1222)` is "1,222". */
    integer,
    /** One decimal place at most: `format.decimal(3.14)` is "3.1". */
    decimal,
    /** A ratio as a whole percent: `format.percent(0.42)` is "42%". */
    percent,
    clock,
    day,
    shortDay,
    /** A figure and its unit joined by a non-breaking space (`NBSP`), so they never wrap apart. */
    withUnit,
    /** A temperature in °C, joined by a non-breaking space. */
    celsius: (value: number) => withUnit(value, "°C"),
    /**
     * A size in bytes in the largest decimal unit it reaches (kB, MB, GB, TB, as disks and
     * networks are sold): one decimal below 10 ("5.2 GB"), whole above ("431 GB"). Pass `unit`
     * to fix the unit, so figures compared side by side ("431 of 466 GB") share one.
     */
    bytes: (value: number, unit?: ByteUnit) => {
      const chosen = unit ?? [...BYTE_UNITS].reverse().find((u) => Math.abs(value) >= BYTE_SIZE[u]) ?? "B";
      const scaled = value / BYTE_SIZE[chosen];
      return withUnit(scaled, chosen, Math.abs(scaled) < 10 && chosen !== "B" ? decimal : integer);
    },
    /** The unit `bytes` would choose for a value, to share it across a set of figures. */
    byteUnit: (value: number): ByteUnit => [...BYTE_UNITS].reverse().find((u) => Math.abs(value) >= BYTE_SIZE[u]) ?? "B",
    /**
     * "1 piece", "6 pieces": the count and its noun, so copy never reads "1 pieces". They are
     * joined by a non-breaking space (`NBSP`), not a plain one: in a test, match with the same
     * call or a `\s` regex, not a typed "6 pieces" string in a role's `name`.
     */
    count: (value: number, one: string, many = `${one}s`) =>
      `${integer.format(value)}${NBSP}${new Intl.PluralRules(locale).select(value) === "one" ? one : many}`,
  };
}

export type Format = ReturnType<typeof createFormat>;

/** The en-GB formatters. */
export const format = createFormat("en-GB");
