// Every number and date on screen goes through Intl, once, here. Units are joined with a
// non-breaking space so "212 °C" never wraps between figure and unit. A product that is not
// en-GB calls createFormat with its locale once and exports the result from its own lib.

export const NBSP = " ";

export function createFormat(locale: string) {
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const shortDay = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const withUnit = (value: number, unit: string, fmt: Intl.NumberFormat = integer) =>
    `${fmt.format(value)}${NBSP}${unit}`;
  return {
    locale,
    integer,
    decimal,
    percent,
    clock,
    day,
    shortDay,
    withUnit,
    celsius: (value: number) => withUnit(value, "°C"),
    /** "1 piece", "6 pieces": the count and its noun, so copy never reads "1 pieces". */
    count: (value: number, one: string, many = `${one}s`) =>
      `${integer.format(value)}${NBSP}${new Intl.PluralRules(locale).select(value) === "one" ? one : many}`,
  };
}

export type Format = ReturnType<typeof createFormat>;

export const format = createFormat("en-GB");
