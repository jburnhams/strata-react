// Every number and date on screen goes through Intl, once, here. Units are joined with a
// non-breaking space so "212 °C" never wraps between figure and unit. A product that is not
// en-GB calls createFormat with its locale once and exports the result from its own lib.
//
// The number formatters are callable (`format.integer(n)`) because that is the form people reach
// for (strata-react issue #12), and they keep Intl's methods (`format.integer.format(n)`,
// `formatToParts`, `resolvedOptions`) so existing calls and Intl knowledge still work.
//
// Dates follow the same shape. Every date formatter is callable with a Date, an ISO string or
// epoch milliseconds (`format.dateTime(row.at)`), because rows arrive from an API as ISO strings
// and an app that has to wrap each one in `new Date(...)` soon builds its own Intl.DateTimeFormat
// beside it instead (strata-react issue #31, from the Bright Horizons History screen). An invalid
// date throws a RangeError naming the input rather than printing "Invalid Date" into a row.
// `date` and `dateTime` use Intl's medium/short styles, so the locale decides the order
// ("8 Nov 2026, 06:05" in en-GB, "Nov 8, 2026, 6:05 AM" in en-US) and nobody hand-writes a
// pattern. `timeZone` is optional: left out, times are the viewer's; a product that shows a place's
// times (a kiln in one room, a shop's opening hours) passes that place's zone once.
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

/** What a date formatter accepts: a Date, an ISO 8601 string, or epoch milliseconds. */
export type DateInput = Date | string | number;

/** An `Intl.DateTimeFormat` that can also be called directly, with a Date, an ISO string or epoch milliseconds. */
export type DateFormatter = ((value: DateInput) => string) & {
  format: (value: DateInput) => string;
  formatToParts: (value: DateInput) => Intl.DateTimeFormatPart[];
  formatRange: (start: DateInput, end: DateInput) => string;
} & Pick<Intl.DateTimeFormat, "resolvedOptions">;

/** Options shared by every date formatter one `createFormat` call makes. */
export interface FormatOptions {
  /** An IANA zone ("Europe/London", "UTC") to show times in. Left out, times are the viewer's own. */
  timeZone?: string;
}

/** A Date from a Date, an ISO string or epoch milliseconds; throws a RangeError naming the input when it is not a date. */
export function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a date: ${JSON.stringify(String(value))}`);
  return date;
}

function callableDate(df: Intl.DateTimeFormat): DateFormatter {
  const format = (value: DateInput) => df.format(toDate(value));
  return Object.assign(format, {
    format,
    formatToParts: (value: DateInput) => df.formatToParts(toDate(value)),
    formatRange: (start: DateInput, end: DateInput) => df.formatRange(toDate(start), toDate(end)),
    resolvedOptions: () => df.resolvedOptions(),
  });
}

function callable(nf: Intl.NumberFormat): NumberFormatter {
  const format = (value: number | bigint) => nf.format(value);
  return Object.assign(format, {
    format,
    formatToParts: (value: number | bigint) => nf.formatToParts(value),
    resolvedOptions: () => nf.resolvedOptions(),
  });
}

/** Intl formatters for one locale (and optionally one time zone): integers, decimals, percent, dates, times, units with a non-breaking space, byte sizes, and counted nouns. */
export function createFormat(locale: string, options: FormatOptions = {}) {
  const { timeZone } = options;
  const dates = (opts: Intl.DateTimeFormatOptions) => callableDate(new Intl.DateTimeFormat(locale, { ...opts, timeZone }));
  const integer = callable(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }));
  const decimal = callable(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }));
  const percent = callable(new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }));
  const clock = dates({ hour: "2-digit", minute: "2-digit" });
  const day = dates({ weekday: "long", day: "numeric", month: "long" });
  const shortDay = dates({ weekday: "short", hour: "2-digit", minute: "2-digit" });
  const date = dates({ dateStyle: "medium" });
  const dateTime = dates({ dateStyle: "medium", timeStyle: "short" });
  const withUnit = (value: number, unit: string, fmt: Pick<Intl.NumberFormat, "format"> = integer) =>
    `${fmt.format(value)}${NBSP}${unit}`;
  return {
    locale,
    /** The zone times are shown in, or `undefined` for the viewer's own. */
    timeZone,
    /** Whole numbers with grouping: `format.integer(1222)` is "1,222". */
    integer,
    /** One decimal place at most: `format.decimal(3.14)` is "3.1". */
    decimal,
    /** A ratio as a whole percent: `format.percent(0.42)` is "42%". */
    percent,
    /** A time of day: `format.clock(at)` is "06:05". */
    clock,
    /** A day without its year, for this week's things: `format.day(at)` is "Sunday 8 November". */
    day,
    /** A weekday and time, for chart axes and recent rows: `format.shortDay(at)` is "Sun 06:05". */
    shortDay,
    /** A date with its year, for a record or a deadline: `format.date(at)` is "8 Nov 2026". */
    date,
    /** A date and time, for a log or history row: `format.dateTime(at)` is "8 Nov 2026, 06:05". */
    dateTime,
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
