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
//
// A value that is not known (`null` or `undefined`: a count the source does not give, a date for
// something never synced) prints as the placeholder, an en dash unless `createFormat`'s `missing`
// says otherwise, from every number and date formatter (strata-react issue #47). Each screen used
// to pick its own ("–", "Never", blank), so tables and cards disagreed. An invalid date still
// throws: that is a bug, not a missing value.
//
// Three formatters came from the Tubes viewer, which wrote its own (strata-react issue #52): `ago`
// ("3 weeks ago", from Intl.RelativeTimeFormat, with `now` passed in by tests), `compact` ("1.2k"
// in en-GB, and `count`'s `{ compact: true }` for "1.2k views") and `runningTime` ("4:05", "1:02:09"), the
// m:ss of a media player, which Intl.DurationFormat's long form is not. `share` is `percent` for a
// part of a whole (strata-react issue #43): a part that is there never prints as "0%", nor a part
// short of the whole as "100%".
//
// Four more came from a status page (strata-react issue #341, jburnhams/homepage), each written by
// hand there because `format` had no equivalent: `bytes` in binary units (`{ binary: true }`:
// memory is read in KiB, MiB, GiB, and `free -h` shows them, so a decimal GB reads 7% high);
// `duration` ("16 min", "3.5 h", "2 days" to say how long, or `style: "parts"` for an uptime,
// "1d 1h 0m"), which `runningTime`'s clock cannot say; `measure` (a reading and its unit, "12.3 GB",
// "41%"); and `agoTick` ("now", "−30 s", "−2 min") for the axis of a history chart.

export const NBSP = " ";

/** The placeholder printed for a value that is not known: an en dash. */
export const MISSING = "–";

/** The decimal byte units `format.bytes` writes. */
export type ByteUnit = "B" | "kB" | "MB" | "GB" | "TB" | "PB";
const BYTE_UNITS: readonly ByteUnit[] = ["B", "kB", "MB", "GB", "TB", "PB"];
const BYTE_SIZE = Object.fromEntries(BYTE_UNITS.map((u, i) => [u, 1000 ** i])) as Record<ByteUnit, number>;

/** The binary byte units `format.bytes` writes with `{ binary: true }`. */
export type BinaryByteUnit = "B" | "KiB" | "MiB" | "GiB" | "TiB" | "PiB";
const BINARY_UNITS: readonly BinaryByteUnit[] = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
const BINARY_SIZE = Object.fromEntries(BINARY_UNITS.map((u, i) => [u, 1024 ** i])) as Record<BinaryByteUnit, number>;
const SIZE: Record<ByteUnit | BinaryByteUnit, number> = { ...BYTE_SIZE, ...BINARY_SIZE };

/** What `format.bytes` and `format.byteUnit` take beyond the value: `{ binary: true }` for KiB, MiB, GiB (powers of 1024), or a unit to fix. A binary unit implies binary. */
export type BytesOptions = { binary?: boolean; unit?: ByteUnit | BinaryByteUnit };

function chooseByteUnit(value: number, binary: boolean): ByteUnit | BinaryByteUnit {
  const units: readonly (ByteUnit | BinaryByteUnit)[] = binary ? BINARY_UNITS : BYTE_UNITS;
  return [...units].reverse().find((u) => Math.abs(value) >= SIZE[u]) ?? "B";
}

/** An `Intl.NumberFormat` that can also be called directly: `f(n)` is `f.format(n)`. `null` or `undefined` prints the placeholder. */
export type NumberFormatter = ((value: number | bigint | Intl.StringNumericLiteral | null | undefined) => string) & {
  format: (value: number | bigint | Intl.StringNumericLiteral | null | undefined) => string;
} & Pick<Intl.NumberFormat, "formatToParts" | "resolvedOptions">;

/** What a date formatter accepts: a Date, an ISO 8601 string, or epoch milliseconds. */
export type DateInput = Date | string | number;

/** An `Intl.DateTimeFormat` that can also be called directly, with a Date, an ISO string or epoch milliseconds. */
export type DateFormatter = ((value: DateInput | null | undefined) => string) & {
  format: (value: DateInput | null | undefined) => string;
  formatToParts: (value: DateInput) => Intl.DateTimeFormatPart[];
  formatRange: (start: DateInput, end: DateInput) => string;
} & Pick<Intl.DateTimeFormat, "resolvedOptions">;

/** Options shared by every date formatter one `createFormat` call makes. */
export interface FormatOptions {
  /** An IANA zone ("Europe/London", "UTC") to show times in. Left out, times are the viewer's own. */
  timeZone?: string;
  /** What a missing value (`null`, `undefined`) prints as. Default an en dash (`MISSING`). */
  missing?: string;
}

/** Options for `format.count`. */
export interface CountOptions {
  /** Write the figure compactly: "1.2k views". The noun still agrees with the exact count. */
  compact?: boolean;
}

/** A Date from a Date, an ISO string or epoch milliseconds; throws a RangeError naming the input when it is not a date. */
export function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a date: ${JSON.stringify(String(value))}`);
  return date;
}

function callableDate(df: Intl.DateTimeFormat, missing: string): DateFormatter {
  const format = (value: DateInput | null | undefined) => (value == null ? missing : df.format(toDate(value)));
  return Object.assign(format, {
    format,
    formatToParts: (value: DateInput) => df.formatToParts(toDate(value)),
    formatRange: (start: DateInput, end: DateInput) => df.formatRange(toDate(start), toDate(end)),
    resolvedOptions: () => df.resolvedOptions(),
  });
}

function callable(nf: Intl.NumberFormat, missing: string): NumberFormatter {
  const format = (value: number | bigint | Intl.StringNumericLiteral | null | undefined) =>
    value == null ? missing : nf.format(value);
  return Object.assign(format, {
    format,
    formatToParts: (value: number | bigint) => nf.formatToParts(value),
    resolvedOptions: () => nf.resolvedOptions(),
  });
}

// Largest first: `ago` says a span in the largest unit it fills at least once, rounded down, so
// 13 days is "last week" and 20 days "2 weeks ago", never "3 weeks" too early.
const DAY = 86_400_000;
const AGO_STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * DAY],
  ["month", 30 * DAY],
  ["week", 7 * DAY],
  ["day", DAY],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** Intl formatters for one locale (and optionally one time zone): integers, decimals, percent, dates, times, units with a non-breaking space, byte sizes, and counted nouns. */
export function createFormat(locale: string, options: FormatOptions = {}) {
  const { timeZone, missing = MISSING } = options;
  const dates = (opts: Intl.DateTimeFormatOptions) =>
    callableDate(new Intl.DateTimeFormat(locale, { ...opts, timeZone }), missing);
  const integer = callable(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), missing);
  const decimal = callable(new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), missing);
  const percent = callable(new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }), missing);
  const compact = callable(new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }), missing);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const plurals = new Intl.PluralRules(locale);
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
    /**
     * A part's share of a whole, as `percent` but never misleading at the ends: a part above 0 that
     * rounds to 0 is "<1%", and one short of the whole that rounds to 100 is ">99%".
     * `format.share(2.4 / 512)` is "<1%".
     */
    share: (value: number | null | undefined) => {
      if (value == null || Number.isNaN(value)) return missing;
      if (value > 0 && value < 0.005) return `<${percent.format(0.01)}`;
      if (value >= 0.995 && value < 1) return `>${percent.format(0.99)}`;
      return percent.format(value);
    },
    /** A figure in short form for counts that run to thousands: `format.compact(1234)` is "1.2k" in en-GB, "1.2K" in en-US. */
    compact,
    /**
     * How long ago (or how far ahead) a time is, in the largest unit it reaches:
     * "3 weeks ago", "yesterday", "in 2 hours", "now" under a minute. Pass `now` in tests.
     */
    ago: (value: DateInput | null | undefined, now: DateInput = new Date()) => {
      if (value == null) return missing;
      const diff = toDate(value).getTime() - toDate(now).getTime();
      const span = Math.abs(diff);
      for (const [unit, size] of AGO_STEPS) {
        if (span >= size) return relative.format(Math.sign(diff) * Math.floor(span / size), unit);
      }
      return relative.format(0, "second");
    },
    /**
     * A media running time from seconds, as a player shows it: "4:05", "1:02:09". Unknown
     * (null, negative, not finite) prints the placeholder. Set it in `tabular-nums`.
     */
    runningTime: (seconds: number | null | undefined) => {
      if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return missing;
      const s = Math.floor(seconds);
      const two = (n: number) => String(n).padStart(2, "0");
      const [h, m] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60)];
      return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
    },
    /**
     * A position in media as an editor shows it, to a chosen precision: "4:05" (seconds), "4:05.250"
     * (`"ms"`), or "0:04:05:07" (`"frames"` at `fps`, the last part the frame). Hours appear only
     * from one hour, except in frames. Frames are always four parts, hours included, as SMPTE
     * timecode is (non-drop frame, with colons): a three-part "1:05:00" reads as one hour five, so
     * a frame count must never be three. Editors write the same four parts (strata-react issue
     * #122). Floors, never rounds up, so a time never reads ahead of the picture. Unknown (null,
     * negative, not finite) prints the placeholder. Set it in `tabular-nums`.
     */
    timecode: (
      seconds: number | null | undefined,
      { precision = "seconds", fps = 30 }: { precision?: "seconds" | "ms" | "frames"; fps?: number } = {},
    ) => {
      if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return missing;
      const whole = Math.floor(seconds);
      const two = (n: number) => String(n).padStart(2, "0");
      const [h, m] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60)];
      const base = h > 0 ? `${h}:${two(m)}:${two(whole % 60)}` : `${m}:${two(whole % 60)}`;
      if (precision === "ms")
        return `${base}.${String(Math.min(Math.floor((seconds - whole) * 1000 + 1e-6), 999)).padStart(3, "0")}`;
      if (precision === "frames")
        return `${h}:${two(m)}:${two(whole % 60)}:${two(Math.min(Math.floor((seconds - whole) * fps + 1e-6), Math.ceil(fps) - 1))}`;
      return base;
    },
    /** What a missing value prints as: an en dash unless `createFormat`'s `missing` says otherwise. */
    missing,
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
     * to fix the unit, so figures compared side by side ("431 of 466 GB") share one. Memory is
     * read in binary units: `{ binary: true }` writes KiB, MiB, GiB ("7.6 GiB"), and a binary
     * unit ("GiB") picks that too. The second argument is a unit or `{ binary, unit }`.
     */
    bytes: (value: number, unitOrOptions?: ByteUnit | BinaryByteUnit | BytesOptions) => {
      const { binary = false, unit } =
        typeof unitOrOptions === "string" ? { unit: unitOrOptions } : (unitOrOptions ?? {});
      const chosen = unit ?? chooseByteUnit(value, binary);
      const scaled = value / SIZE[chosen];
      return withUnit(scaled, chosen, Math.abs(scaled) < 10 && chosen !== "B" ? decimal : integer);
    },
    /**
     * A length of time in words, the unit chosen by size: "45 s", "16 min", "3.5 h", "2 days". Unknown
     * (null, negative, not finite) prints the placeholder. `style: "parts"` is an uptime, the two
     * largest units written out: "1d 1h 0m", "2h 5m", "5m 3s". Not `runningTime`, which is a media clock.
     */
    duration: (seconds: number | null | undefined, { style = "approx" }: { style?: "approx" | "parts" } = {}) => {
      if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return missing;
      if (style === "parts") {
        const s = Math.floor(seconds);
        const [d, h, m] = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60)];
        if (d > 0) return `${d}d${NBSP}${h}h${NBSP}${m}m`;
        if (h > 0) return `${h}h${NBSP}${m}m`;
        if (m > 0) return `${m}m${NBSP}${s % 60}s`;
        return `${s}s`;
      }
      if (seconds < 60) return withUnit(Math.floor(seconds), "s");
      if (seconds < 3600) return withUnit(Math.floor(seconds / 60), "min");
      if (seconds < 86400) return withUnit(seconds / 3600, "h", decimal);
      const days = seconds / 86400;
      return withUnit(days, plurals.select(Math.round(days * 10) / 10) === "one" ? "day" : "days", decimal);
    },
    /**
     * A reading and its unit: `format.measure(12.34, "GB")` is "12.3 GB" (one decimal at most, a
     * non-breaking space). `"%"` takes the figure as percent points and goes through `percent`, so
     * the locale decides the spacing: `format.measure(41, "%")` is "41%". Unknown prints the placeholder.
     */
    measure: (value: number | null | undefined, unit: string) =>
      value == null ? missing : unit === "%" ? percent.format(value / 100) : withUnit(value, unit, decimal),
    /**
     * A tick for the axis of a chart of the past, from seconds before now: "now", "−30 s", "−2 min",
     * "−6 h", "−3 d" (a true minus sign). Pass it as `LineChart`'s `formatX` after turning x into seconds ago.
     */
    agoTick: (secondsAgo: number | null | undefined) => {
      if (secondsAgo == null || !Number.isFinite(secondsAgo)) return missing;
      const s = Math.abs(secondsAgo);
      if (s < 1) return "now";
      const [n, unit] = s < 60 ? [s, "s"] : s < 3600 ? [s / 60, "min"] : s < 86400 ? [s / 3600, "h"] : [s / 86400, "d"];
      return `−${integer.format(n)}${NBSP}${unit}`;
    },
    /**
     * A distance in metres as a person says it: metres under a kilometre ("850 m"), then
     * kilometres, one decimal below 100 ("12.4 km"), whole above; `"imperial"` is feet under a
     * tenth of a mile ("320 ft"), then miles ("7.7 mi").
     */
    distance: (metres: number, system: "metric" | "imperial" = "metric") => {
      if (system === "imperial") {
        const miles = metres / 1609.344;
        return miles < 0.1 ? withUnit(metres * 3.28084, "ft") : withUnit(miles, "mi", miles < 100 ? decimal : integer);
      }
      return Math.abs(metres) < 1000
        ? withUnit(metres, "m")
        : withUnit(metres / 1000, "km", Math.abs(metres) < 100_000 ? decimal : integer);
    },
    /** The unit `bytes` would choose for a value, to share it across a set of figures. */
    byteUnit: (value: number, { binary = false }: { binary?: boolean } = {}) => chooseByteUnit(value, binary),
    /**
     * "1 piece", "6 pieces": the count and its noun, so copy never reads "1 pieces". They are
     * joined by a non-breaking space (`NBSP`), not a plain one: in a test, match with the same
     * call or a `\s` regex, not a typed "6 pieces" string in a role's `name`.
     */
    count: (
      value: number | null | undefined,
      one: string,
      many = `${one}s`,
      { compact: short = false }: CountOptions = {},
    ) =>
      value == null
        ? missing
        : `${(short ? compact : integer).format(value)}${NBSP}${plurals.select(value) === "one" ? one : many}`,
  };
}

export type Format = ReturnType<typeof createFormat>;

/** The en-GB formatters. */
export const format = createFormat("en-GB");
